import { onCleanup, onMount, type Accessor } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
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
 * Backwards-compatible outcome shape, kept in lockstep with the React adapter
 * so consumers can pattern-match on `outcome.kind` regardless of framework.
 * New code can read `state.phase` directly instead.
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
  /** Raw engine state — Solid store, fields are reactive on direct read. */
  state: SurveyV2State;

  /** Backwards-compatible discriminated union derived from `state.phase`. */
  outcome: Accessor<SurveyV2Outcome>;

  // Navigation
  flatSteps: Accessor<FlatStep[]>;
  stepIndex: Accessor<number>;
  totalSteps: Accessor<number>;
  currentStep: Accessor<FlatStep | null>;
  visibleQuestions: Accessor<V2Question[]>;

  // Answers
  answers: Accessor<Record<string, unknown>>;
  setAnswer: (questionId: string, value: unknown) => void;

  // Patient info
  patientInfo: Accessor<PatientInfo>;
  setPatientInfo: (patch: Partial<PatientInfo>) => void;

  // UI state
  submitting: Accessor<boolean>;
  validationError: Accessor<string | null>;

  // Actions
  next: () => Promise<void>;
  back: () => void;
  submit: () => Promise<void>;
  restart: () => void;

  /** Underlying engine — exposed for advanced use cases / tests. */
  engine: SurveyV2Engine;
}

// ── Hook ────────────────────────────────────────────────────────────────────

/**
 * Solid adapter over the headless survey-v2 engine. The engine is constructed
 * once when the hook runs from the options passed at that time — later changes
 * to `opts` are NOT re-applied (re-create the owning component to start a fresh
 * survey). State is mirrored into a Solid store via `reconcile()` so deep diffs
 * drive the fine-grained accessors.
 */
export function useSurveyV2Flow(opts: UseSurveyV2FlowOptions): SurveyV2Flow {
  const engineOpts: CreateSurveyV2EngineOptions = {
    apiBaseUrl: opts.apiBaseUrl,
    publishableKey: opts.publishableKey,
    tenantKey: opts.tenantKey,
    drugIds: opts.drugIds,
    templateId: opts.templateId,
    mode: opts.mode,
    token: opts.token,
    draftTtlMs: opts.draftTtlMs,
    onEvent: opts.onEvent,
    onComplete: opts.onComplete,
    onError: opts.onError,
  };

  const engine = createSurveyV2Engine(engineOpts);

  // Mirror engine state into a Solid store using reconcile() so deep diffs
  // update fine-grained accessors. Subscribe immediately so the synchronous
  // load-kickoff (queueMicrotask) doesn't miss us.
  const [store, setStore] = createStore<SurveyV2State>(engine.getState());
  const unsubscribe = engine.subscribe(() => {
    setStore(reconcile(engine.getState()));
  });

  onMount(() => {
    // Re-sync once on mount in case the engine fired before the listener
    // attached (defensive; subscribe runs synchronously above so this is a no-op).
    setStore(reconcile(engine.getState()));
  });

  onCleanup(() => {
    unsubscribe();
    engine.destroy();
  });

  // Memoized accessors — Solid store deep-reactivity makes these light-weight.
  const flatSteps: Accessor<FlatStep[]> = () => store.flatSteps;
  const stepIndex: Accessor<number> = () => store.stepIndex;
  const totalSteps: Accessor<number> = () => store.flatSteps.length;
  const currentStep: Accessor<FlatStep | null> = () =>
    store.flatSteps[store.stepIndex] ?? null;
  const visibleQuestions: Accessor<V2Question[]> = () => {
    const step = currentStep();
    if (!step) return [];
    return step.questions.filter((q) => isQuestionVisible(q, store.answers));
  };
  const answers: Accessor<Record<string, unknown>> = () => store.answers;
  const patientInfo: Accessor<PatientInfo> = () => store.patientInfo;
  const submitting: Accessor<boolean> = () => store.busy;
  const validationError: Accessor<string | null> = () => store.validationError;

  const outcome: Accessor<SurveyV2Outcome> = () => {
    switch (store.phase) {
      case 'loading':
        return { kind: 'loading' };
      case 'error':
        return { kind: 'load_failed', error: store.error ?? 'Unknown error' };
      case 'questions':
        return { kind: 'questions' };
      case 'patient_info':
        return { kind: 'patient_info' };
      case 'submitting':
        return { kind: 'submitting' };
      case 'disqualified':
        return { kind: 'disqualified', drugResults: store.disqualifiedResult?.drugResults ?? [] };
      case 'complete':
        return { kind: 'complete', result: store.result! };
    }
  };

  return {
    state: store,
    outcome,
    flatSteps,
    stepIndex,
    totalSteps,
    currentStep,
    visibleQuestions,
    answers,
    setAnswer: (qid, value) => engine.setAnswer(qid, value),
    patientInfo,
    setPatientInfo: (patch) => engine.setPatientInfo(patch),
    submitting,
    validationError,
    next: () => engine.next(),
    back: () => engine.back(),
    submit: () => engine.submit(),
    restart: () => engine.restart(),
    engine,
  };
}
