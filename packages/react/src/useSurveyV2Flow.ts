import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
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

  /** Underlying engine — exposed for advanced use cases / tests. */
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

/**
 * React adapter over the headless survey-v2 engine. The engine is constructed
 * once on mount from the options passed at that time — like the Solid adapter,
 * later changes to `opts` are NOT re-applied (re-mount the component, e.g. with
 * a `key`, to start a fresh survey). State is mirrored into React via
 * `useSyncExternalStore`, which re-reads the snapshot when the engine notifies.
 */
export function useSurveyV2Flow(opts: UseSurveyV2FlowOptions): SurveyV2Flow {
  // Keep the latest callbacks in a ref so the engine (built once) always calls
  // through to the current handler without forcing a rebuild.
  const handlers = useRef({ onEvent: opts.onEvent, onComplete: opts.onComplete, onError: opts.onError });
  handlers.current = { onEvent: opts.onEvent, onComplete: opts.onComplete, onError: opts.onError };

  const engineRef = useRef<SurveyV2Engine | null>(null);
  if (engineRef.current === null) {
    const engineOpts: CreateSurveyV2EngineOptions = {
      apiBaseUrl: opts.apiBaseUrl,
      publishableKey: opts.publishableKey,
      tenantKey: opts.tenantKey,
      drugIds: opts.drugIds,
      templateId: opts.templateId,
      mode: opts.mode,
      token: opts.token,
      draftTtlMs: opts.draftTtlMs,
      onEvent: (e) => handlers.current.onEvent?.(e),
      onComplete: (r) => handlers.current.onComplete?.(r),
      onError: (err) => handlers.current.onError?.(err),
    };
    engineRef.current = createSurveyV2Engine(engineOpts);
  }
  const engine = engineRef.current;

  // Tear down on unmount.
  useEffect(() => {
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subscribe = useCallback((onChange: () => void) => engine.subscribe(onChange), [engine]);
  const getSnapshot = useCallback(() => engine.getState(), [engine]);
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
    setAnswer: (qid, value) => engine.setAnswer(qid, value),
    patientInfo: state.patientInfo,
    setPatientInfo: (patch) => engine.setPatientInfo(patch),
    submitting: state.busy,
    validationError: state.validationError,
    next: () => engine.next(),
    back: () => engine.back(),
    submit: () => engine.submit(),
    restart: () => engine.restart(),
    engine,
  };
}
