import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  createSurveyV2Engine,
  isQuestionVisible,
  type CreateSurveyV2EngineOptions,
  type EmbedEvent,
  type FlatStep,
  type PatientInfo,
  type SurveyV2Engine,
  type SurveyV2State,
  type V2DrugResult,
  type V2Question,
  type V2SubmitResult,
} from '@apextelemed/survey-core';

// ── Public surface ──────────────────────────────────────────────────────────

/**
 * Backwards-compatible outcome shape, kept in lockstep with the Solid adapter
 * so consumers can pattern-match on `outcome.kind` regardless of framework.
 * New code can read `phase` / `state` directly instead.
 */
export type SurveyV2Outcome =
  | { kind: 'loading' }
  | { kind: 'load_failed'; error: string }
  | { kind: 'questions' }
  | { kind: 'patient_info' }
  | { kind: 'submitting' }
  | { kind: 'disqualified'; drugResults: V2DrugResult[] }
  | { kind: 'complete'; result: V2SubmitResult };

export interface UseSurveyV2FlowOptions {
  /** Base URL to the Apex backend (must include the `/api` segment), or your
   *  own proxy that forwards to `/v2/embed/*`. */
  apiBaseUrl: string;
  /** Publishable key (`pk_*`) for browser-direct embeds. Omit when proxying
   *  through your own backend that injects server-side credentials. */
  publishableKey?: string;
  /** Tenant key sent as `X-Tenant-Key` when proxying through a multi-tenant
   *  backend. Ignored on browser-direct embeds. */
  tenantKey?: string;

  drugIds?: string[];
  templateId?: string;
  mode?: 'initial' | 'refill';
  /** Returning-member token (overrides drugIds/templateId/mode). */
  token?: string;

  /** Opt-in: auto-submit at the end of the questionnaire (skipping the
   *  patient-info form) when a returning/known customer's identity is complete.
   *  Default OFF. Pass with `knownPatientInfo`. See engine docs. */
  skipPatientInfoWhenComplete?: boolean;
  /** Known identity for a returning customer on the drugIds path — seeds the
   *  engine so the skip guard can pass. Resolve it BEFORE the first render (the
   *  engine is built once from the options passed at that time). */
  knownPatientInfo?: Partial<PatientInfo>;
  /** Widen the fields required for the skip (default: firstName/lastName/email/
   *  dob/state). Add any your downstream needs (e.g. shipping address). */
  requiredPatientInfoFields?: Array<keyof PatientInfo>;

  /** Override the draft storage TTL (default 24h). */
  draftTtlMs?: number;
  /** Lifecycle events from the engine. */
  onEvent?: (e: EmbedEvent) => void;
  /** Called once on a successful submission. */
  onComplete?: (result: V2SubmitResult) => void;
  /** Called on a load/submit error. */
  onError?: (error: Error) => void;
}

export interface SurveyV2Flow {
  /** Raw engine state snapshot (re-read every render via useSyncExternalStore). */
  state: SurveyV2State;
  /** Backwards-compatible discriminated union derived from `state.phase`. */
  outcome: SurveyV2Outcome;

  // Navigation
  flatSteps: FlatStep[];
  stepIndex: number;
  totalSteps: number;
  currentStep: FlatStep | null;
  visibleQuestions: V2Question[];

  // Answers
  answers: Record<string, unknown>;
  setAnswer: (questionId: string, value: unknown) => void;

  // Patient info
  patientInfo: PatientInfo;
  setPatientInfo: (patch: Partial<PatientInfo>) => void;

  // UI state
  submitting: boolean;
  validationError: string | null;

  // Actions
  next: () => Promise<void>;
  back: () => void;
  submit: () => Promise<void>;
  restart: () => void;

  /** Underlying engine — exposed for advanced use cases / tests. Before the
   *  mount effect has run (the first render, and server rendering) this is an
   *  inert placeholder that reads as "loading"; don't hold on to it across
   *  renders. */
  engine: SurveyV2Engine;
}

function deriveOutcome(state: SurveyV2State): SurveyV2Outcome {
  switch (state.phase) {
    case 'loading':
      return { kind: 'loading' };
    case 'error':
      return { kind: 'load_failed', error: state.error ?? 'Unknown error' };
    case 'questions':
      return { kind: 'questions' };
    case 'patient_info':
      return { kind: 'patient_info' };
    case 'submitting':
      return { kind: 'submitting' };
    case 'disqualified':
      return { kind: 'disqualified', drugResults: state.disqualifiedResult?.drugResults ?? [] };
    case 'complete':
      return { kind: 'complete', result: state.result! };
  }
}

// ── Hook ────────────────────────────────────────────────────────────────────

const NOT_STARTED: SurveyV2State = {
  phase: 'loading',
  composed: null,
  flatSteps: [],
  stepIndex: 0,
  answers: {},
  patientInfo: {},
  memberId: null,
  qualification: null,
  result: null,
  disqualifiedResult: null,
  validationError: null,
  busy: false,
  error: null,
};

/**
 * Stands in for the engine until the mount effect has built the real one, so
 * `flow.engine` is never null. It reads as "loading" and its actions do
 * nothing; nothing can call them in practice, since the survey has no
 * questions to answer before the real engine loads.
 */
const PENDING_ENGINE: SurveyV2Engine = {
  getState: () => NOT_STARTED,
  subscribe: () => () => {},
  setAnswer: () => {},
  setPatientInfo: () => {},
  next: async () => {},
  back: () => {},
  submit: async () => {},
  restart: () => {},
  destroy: () => {},
};

/**
 * React adapter over the headless survey-v2 engine. The engine is constructed
 * once on mount from the options passed at that time — like the Solid adapter,
 * later changes to `opts` are NOT re-applied (re-mount the component, e.g. with
 * a `key`, to start a fresh survey). State is mirrored into React via
 * `useSyncExternalStore`, which re-reads the snapshot when the engine notifies.
 *
 * The engine is created inside the mount effect and destroyed by that same
 * effect's cleanup, never during render. Creating an engine starts its load,
 * so building it in render breaks React StrictMode: development mounts, cleans
 * up and remounts every effect, and a render-built engine is destroyed by the
 * first cleanup and never replaced, leaving the survey on "loading" forever.
 * Until the effect runs, `state` is a static "loading" snapshot.
 */
export function useSurveyV2Flow(opts: UseSurveyV2FlowOptions): SurveyV2Flow {
  // Keep the latest callbacks in a ref so the engine (built once) always calls
  // through to the current handler without forcing a rebuild.
  const handlers = useRef({ onEvent: opts.onEvent, onComplete: opts.onComplete, onError: opts.onError });
  handlers.current = { onEvent: opts.onEvent, onComplete: opts.onComplete, onError: opts.onError };

  // Options are read once per mount (see above), so pin the first render's.
  const initialOpts = useRef(opts);

  const [engine, setEngine] = useState<SurveyV2Engine | null>(null);

  useEffect(() => {
    const o = initialOpts.current;
    const engineOpts: CreateSurveyV2EngineOptions = {
      apiBaseUrl: o.apiBaseUrl,
      publishableKey: o.publishableKey,
      tenantKey: o.tenantKey,
      drugIds: o.drugIds,
      templateId: o.templateId,
      mode: o.mode,
      token: o.token,
      skipPatientInfoWhenComplete: o.skipPatientInfoWhenComplete,
      knownPatientInfo: o.knownPatientInfo,
      requiredPatientInfoFields: o.requiredPatientInfoFields,
      draftTtlMs: o.draftTtlMs,
      onEvent: (e) => handlers.current.onEvent?.(e),
      onComplete: (r) => handlers.current.onComplete?.(r),
      onError: (err) => handlers.current.onError?.(err),
    };
    const created = createSurveyV2Engine(engineOpts);
    setEngine(created);
    return () => {
      created.destroy();
    };
  }, []);

  const live = engine ?? PENDING_ENGINE;
  const subscribe = useCallback((onChange: () => void) => live.subscribe(onChange), [live]);
  const getSnapshot = useCallback(() => live.getState(), [live]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const currentStep = state.flatSteps[state.stepIndex] ?? null;
  const visibleQuestions = useMemo(
    () => (currentStep ? currentStep.questions.filter((q) => isQuestionVisible(q, state.answers)) : []),
    [currentStep, state.answers],
  );

  return {
    state,
    outcome: deriveOutcome(state),
    flatSteps: state.flatSteps,
    stepIndex: state.stepIndex,
    totalSteps: state.flatSteps.length,
    currentStep,
    visibleQuestions,
    answers: state.answers,
    setAnswer: (qid, value) => live.setAnswer(qid, value),
    patientInfo: state.patientInfo,
    setPatientInfo: (patch) => live.setPatientInfo(patch),
    submitting: state.busy,
    validationError: state.validationError,
    next: () => live.next(),
    back: () => live.back(),
    submit: () => live.submit(),
    restart: () => live.restart(),
    engine: live,
  };
}
