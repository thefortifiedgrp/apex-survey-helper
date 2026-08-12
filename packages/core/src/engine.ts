import { createEmbedApiClient, EmbedApiError, type EmbedApiClient, type FetchLike } from './api';
import { flattenComposedSurvey } from './flatten';
import { createLocalDraftStore, draftKey, type DraftStore } from './storage';
import { isQuestionVisible } from './visibility';
import type {
  EmbedEvent,
  FlatStep,
  PatientInfo,
  V2Answer,
  V2ComposedSurvey,
  V2DrugResult,
  V2SubmitResult,
} from './types';

// ── Public state shape ─────────────────────────────────────────────────────

export type SurveyV2Phase =
  | 'loading'
  | 'questions'
  | 'patient_info'
  | 'submitting'
  | 'complete'
  | 'disqualified'
  | 'error';

export interface SurveyV2State {
  phase: SurveyV2Phase;
  composed: V2ComposedSurvey | null;
  flatSteps: FlatStep[];
  stepIndex: number;
  answers: Record<string, unknown>;
  patientInfo: PatientInfo;
  memberId: string | null;
  /** Mid-stream qualification snapshot, refreshed on each `next()`. */
  qualification: { qualified: boolean; drugResults: V2DrugResult[] } | null;
  result: V2SubmitResult | null;
  disqualifiedResult: { drugResults: V2DrugResult[] } | null;
  validationError: string | null;
  /** True while a network call is in flight (next, submit). */
  busy: boolean;
  error: string | null;
}

export interface SurveyV2Engine {
  getState(): SurveyV2State;
  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;

  setAnswer(questionId: string, value: unknown): void;
  setPatientInfo(patch: Partial<PatientInfo>): void;
  next(): Promise<void>;
  back(): void;
  submit(): Promise<void>;
  restart(): void;
  destroy(): void;
}

// ── Options ────────────────────────────────────────────────────────────────

export interface CreateSurveyV2EngineOptions {
  /**
   * Optional. When set, the engine attaches `x-apex-publishable-key` on each
   * request — for browser-direct embeds against Apex `/api/v2/embed/*`.
   * Omit when proxying through a partner backend that injects its own
   * server-side credentials.
   */
  publishableKey?: string;
  /**
   * Optional. When set, attaches `X-Tenant-Key` on each request — required
   * when proxying through the-backend so it can resolve the tenant's Apex
   * credentials. Ignored on browser-direct embeds.
   */
  tenantKey?: string;
  apiBaseUrl: string;

  // Anonymous flow:
  drugIds?: string[];
  templateId?: string;
  mode?: 'initial' | 'refill';
  // Returning-member flow (overrides drugIds/templateId/mode):
  token?: string;

  // ── Returning/known-customer patient-info skip (opt-in, default OFF) ────────
  /**
   * Opt-in. When true AND the composed survey's partner has not vetoed it
   * (`surveyPreferences.skipPatientInfoWhenComplete !== false`) AND the required
   * identity fields are already present, the engine AUTO-SUBMITS at the end of
   * the questionnaire instead of rendering the patient-info form — so a returning
   * customer whose identity is already known confirms nothing.
   *
   * Default OFF three ways: this defaults false; the partner flag can veto it
   * centrally; and the runtime completeness guard blocks it unless identity is
   * fully present — so an anonymous/new customer (whose patientInfo is `{}`) can
   * never skip. A host must only pass true once it has supplied a complete
   * `knownPatientInfo` covering `requiredPatientInfoFields`.
   */
  skipPatientInfoWhenComplete?: boolean;
  /**
   * Known identity for a returning/authenticated customer on the anonymous
   * `drugIds` path (the `token` path already seeds identity server-side). Seeds
   * the engine's patient info so the skip guard can pass. The host should NOT
   * include fields its survey collects as its own questions (those are set from
   * the answers). Ignored fields the survey later overwrites via setPatientInfo.
   */
  knownPatientInfo?: Partial<PatientInfo>;
  /**
   * The identity fields that must ALL be present for the skip to fire. Defaults
   * to the engine's minimum (firstName/lastName/email/dob/state). A host whose
   * downstream (e.g. request creation) needs more — like a shipping address —
   * MUST widen this to its real superset, so the skip never drops a field the
   * form would otherwise force. This is the completeness floor, not the ceiling.
   */
  requiredPatientInfoFields?: Array<keyof PatientInfo>;

  // Hooks:
  onEvent?: (e: EmbedEvent) => void;
  onComplete?: (result: V2SubmitResult) => void;
  onError?: (error: Error) => void;

  // Injectables (tests / SSR):
  client?: EmbedApiClient;
  fetch?: FetchLike;
  storage?: Storage | null;
  draftTtlMs?: number;
  /**
   * Where in-progress answers are kept. Defaults to a localStorage store
   * (device-local resume-on-refresh). Supply one backed by a server to let a
   * patient resume on a different device — see `DraftStore`.
   *
   * Takes precedence over `storage`/`draftTtlMs`, which only configure the
   * default store.
   */
  draftStore?: DraftStore;

  /**
   * If true (default), the engine kicks off `load()` immediately when created.
   * Set false for testing if you want to control the load step explicitly.
   */
  autoLoad?: boolean;
}

// ── Engine ─────────────────────────────────────────────────────────────────

const REQUIRED_PATIENT_INFO_FIELDS: Array<keyof PatientInfo> = [
  'firstName',
  'lastName',
  'email',
  'dob',
  'state',
];

export function createSurveyV2Engine(opts: CreateSurveyV2EngineOptions): SurveyV2Engine {
  if (!opts.token && (!opts.drugIds || opts.drugIds.length === 0)) {
    throw new Error('@apextelemed/survey-core: either `token` or non-empty `drugIds` is required');
  }

  const client: EmbedApiClient =
    opts.client ??
    createEmbedApiClient({
      publishableKey: opts.publishableKey,
      tenantKey: opts.tenantKey,
      apiBaseUrl: opts.apiBaseUrl,
      fetch: opts.fetch,
    });

  const dKey = draftKey({
    publishableKey: opts.publishableKey,
    tenantKey: opts.tenantKey,
    token: opts.token,
    drugIds: opts.drugIds,
    templateId: opts.templateId,
    mode: opts.mode,
  });

  const storageOpts = { storage: opts.storage, ttlMs: opts.draftTtlMs };
  const draftStore: DraftStore = opts.draftStore ?? createLocalDraftStore(dKey, storageOpts);

  let state: SurveyV2State = {
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

  const listeners = new Set<() => void>();
  let destroyed = false;

  // `abandoned` fires on pagehide (navigation away / tab close) while the
  // survey is still in progress. pagehide rather than visibilitychange on
  // purpose: tabbing away and coming back is not abandonment, and hosts
  // forward these with fetch keepalive so delivery survives the unload.
  // May fire more than once per session (bfcache restore, leave again) —
  // consumers treat it as "last seen leaving", not a terminal state.
  function onPageHide() {
    if (state.phase === 'questions' || state.phase === 'patient_info' || state.phase === 'submitting') {
      emit({
        type: 'abandoned',
        data: { phase: state.phase, stepIndex: state.stepIndex, stepCount: state.flatSteps.length },
      });
    }
  }
  const hasWindow = typeof window !== 'undefined' && typeof window.addEventListener === 'function';
  if (hasWindow) window.addEventListener('pagehide', onPageHide);

  function setState(patch: Partial<SurveyV2State>) {
    state = { ...state, ...patch };
    notify();
  }
  function notify() {
    for (const l of listeners) {
      try {
        l();
      } catch (err) {
        console.error('[survey-core] listener threw:', err);
      }
    }
  }

  // Completeness floor for the returning-customer skip. Defaults to the engine's
  // minimum; a host widens it (e.g. + shipping address) so the skip never drops
  // a field its downstream needs.
  const requiredPatientInfoFields = opts.requiredPatientInfoFields ?? REQUIRED_PATIENT_INFO_FIELDS;
  function patientInfoComplete(pi: PatientInfo): boolean {
    if (!requiredPatientInfoFields.every((k) => pi[k])) return false;
    if (pi.email && !/^\S+@\S+\.\S+$/.test(pi.email)) return false;
    return true;
  }

  function emit(event: EmbedEvent) {
    if (!opts.onEvent) return;
    try {
      opts.onEvent(event);
    } catch (err) {
      console.error('[survey-core] onEvent threw:', err);
    }
  }

  function answersArr(): V2Answer[] {
    return Object.entries(state.answers).map(([questionId, value]) => ({ questionId, value }));
  }

  // The submit payload must record an answer for every question that was
  // SHOWN, even when the patient left it blank — not checking a box is a real
  // answer ("none of these apply"), not a missing one. Without this, a
  // rendered-but-unselected optional multi_select (e.g. the contraindication
  // screen `merged_conditions`) is omitted entirely, making "reported none"
  // indistinguishable from "never screened" downstream (case notes, AI assist).
  //
  // Preserves every touched answer verbatim (never drops one) and only ADDS a
  // canonical empty for a shown-but-untouched question. Scoped to multi_select
  // (empty = []); scalar types are intentionally NOT filled here — injecting
  // `null` for a scalar is not visibility-safe (the visibility evaluator treats
  // null unlike undefined, and Number(null) === 0 flips numeric gates). Hidden
  // questions (visibilityConditions fail against the final answers) are never
  // fabricated, so e.g. the female-only reproductive screen stays absent for
  // male patients.
  function visibleSubmissionAnswers(): V2Answer[] {
    const out = answersArr();
    const present = new Set(out.map((a) => a.questionId));
    for (const step of state.flatSteps) {
      for (const q of step.questions) {
        if (present.has(q.questionId)) continue;
        if (q.type !== 'multi_select') continue;
        if (!isQuestionVisible(q, state.answers)) continue;
        out.push({ questionId: q.questionId, value: [] });
        present.add(q.questionId);
      }
    }
    return out;
  }

  function persistDraft(overrideStepIndex?: number) {
    draftStore.save({
      answers: answersArr(),
      stepIndex: overrideStepIndex ?? state.stepIndex,
    });
  }

  function currentStep(): FlatStep | null {
    return state.flatSteps[state.stepIndex] ?? null;
  }

  function visibleRequiredMissing(): boolean {
    const step = currentStep();
    if (!step) return false;
    for (const q of step.questions) {
      if (!isQuestionVisible(q, state.answers)) continue;
      if (!q.required) continue;
      const v = state.answers[q.questionId];
      if (
        v === undefined ||
        v === null ||
        v === '' ||
        (Array.isArray(v) && v.length === 0)
      ) {
        return true;
      }
    }
    return false;
  }

  // A step is "empty" when every one of its questions is hidden by the current
  // answers (e.g. a gender-gated section the patient doesn't match). The engine
  // skips such steps during navigation so the UI never renders a blank page.
  function stepHasVisibleQuestions(step: FlatStep, answers: Record<string, unknown>): boolean {
    return step.questions.some((q) => isQuestionVisible(q, answers));
  }

  // Nearest navigable step strictly after `from` with at least one visible
  // question; -1 when the rest of the survey is empty (→ patient info).
  function nextVisibleStepIndex(from: number): number {
    for (let i = from + 1; i < state.flatSteps.length; i++) {
      if (stepHasVisibleQuestions(state.flatSteps[i], state.answers)) return i;
    }
    return -1;
  }

  // Nearest navigable step strictly before `from` with at least one visible
  // question; -1 when there is none (already at the first real step).
  function prevVisibleStepIndex(from: number): number {
    for (let i = from - 1; i >= 0; i--) {
      if (stepHasVisibleQuestions(state.flatSteps[i], state.answers)) return i;
    }
    return -1;
  }

  // First step at or after `from` (then wrapping from 0) with visible questions,
  // used to land a restored draft on a real step. Falls back to `from`.
  function firstVisibleStepIndex(
    flatSteps: FlatStep[],
    answers: Record<string, unknown>,
    from: number,
  ): number {
    for (let i = Math.max(0, from); i < flatSteps.length; i++) {
      if (stepHasVisibleQuestions(flatSteps[i], answers)) return i;
    }
    for (let i = 0; i < flatSteps.length; i++) {
      if (stepHasVisibleQuestions(flatSteps[i], answers)) return i;
    }
    return from;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  async function load() {
    try {
      let composed: V2ComposedSurvey;
      // Seed a returning customer's known identity (anonymous drugIds path); the
      // token path's server-supplied patientInfo still takes precedence below.
      let patientInfo: PatientInfo = { ...opts.knownPatientInfo };
      let memberId: string | null = null;

      if (opts.token) {
        const r = await client.composeSurveyByToken(opts.token);
        composed = r.composed;
        patientInfo = { ...opts.knownPatientInfo, ...(r.patientInfo ?? {}) };
        memberId = r.memberId;
      } else {
        composed = await client.composeSurvey({
          drugIds: opts.drugIds!,
          templateId: opts.templateId,
          mode: opts.mode,
        });
      }
      if (destroyed) return;

      const flatSteps = flattenComposedSurvey(composed);

      // Restore draft if present.
      const draft = await draftStore.load();
      let answers: Record<string, unknown> = {};
      let stepIndex = 0;
      if (draft) {
        for (const a of draft.answers) answers[a.questionId] = a.value;
        stepIndex = Math.min(draft.stepIndex, Math.max(0, flatSteps.length - 1));
      }
      // Never land on a step whose questions are all hidden for these answers.
      stepIndex = firstVisibleStepIndex(flatSteps, answers, stepIndex);

      setState({
        phase: 'questions',
        composed,
        flatSteps,
        stepIndex,
        answers,
        patientInfo,
        memberId,
      });
      emit({ type: 'survey:loaded', data: { resumed: !!draft } });
      emit({
        type: 'step:shown',
        data: { stepIndex, stepCount: flatSteps.length, phase: 'questions' },
      });
    } catch (err) {
      const msg = formatError(err);
      setState({ phase: 'error', error: msg });
      if (opts.onError) {
        try {
          opts.onError(err instanceof Error ? err : new Error(msg));
        } catch {
          /* ignore */
        }
      }
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  function setAnswer(questionId: string, value: unknown) {
    setState({
      answers: { ...state.answers, [questionId]: value },
      validationError: null,
    });
    persistDraft();
  }

  function setPatientInfo(patch: Partial<PatientInfo>) {
    setState({ patientInfo: { ...state.patientInfo, ...patch }, validationError: null });
  }

  function back() {
    if (state.phase === 'patient_info') {
      setState({ phase: 'questions' });
      return;
    }
    const prev = prevVisibleStepIndex(state.stepIndex);
    if (prev !== -1) {
      setState({ stepIndex: prev });
      persistDraft(prev);
      emit({
        type: 'step:shown',
        data: { stepIndex: prev, stepCount: state.flatSteps.length, phase: 'questions' },
      });
    }
  }

  async function next() {
    if (state.busy) return;
    if (state.phase !== 'questions') return;
    if (visibleRequiredMissing()) {
      setState({ validationError: 'Please answer all required questions before continuing.' });
      return;
    }
    setState({ busy: true, validationError: null });
    try {
      const result = await client.checkQualification({
        drugIds: opts.drugIds,
        templateId: opts.templateId,
        mode: opts.mode,
        token: opts.token,
        answers: answersArr(),
      });
      if (destroyed) return;
      emit({
        type: 'qualification:checked',
        data: { qualified: result.qualified, drugResults: result.drugResults },
      });
      const allDisqualified =
        result.drugResults.length > 0 && result.drugResults.every((d) => !d.qualified);
      if (allDisqualified) {
        // Terminal, so the draft goes — same as a successful submit below.
        // Keeping it means a member who leaves and comes back resumes on the
        // denying answers and is denied again the moment they hit Continue,
        // with no way out but "Start over". They should get a fresh survey.
        draftStore.clear();
        setState({
          phase: 'disqualified',
          qualification: result,
          disqualifiedResult: { drugResults: result.drugResults },
          busy: false,
        });
        emit({ type: 'disqualified', data: { drugResults: result.drugResults } });
        return;
      }
      const completedIdx = state.stepIndex;
      const stepCount = state.flatSteps.length;
      const nextIdx = nextVisibleStepIndex(state.stepIndex);
      emit({ type: 'step:completed', data: { stepIndex: completedIdx, stepCount } });
      if (nextIdx === -1) {
        // No further step has visible questions. Normally we render the
        // patient-info form. But a returning/known customer with complete
        // identity skips straight to submit — gated on ALL of: the host opted in
        // (skipPatientInfoWhenComplete), the partner has not centrally vetoed it,
        // and the completeness guard passes. Set phase:'patient_info' first so
        // submit()'s own guard is satisfied (we do NOT relax that guard).
        setState({ phase: 'patient_info', qualification: result, busy: false });
        // The patient-info form is the pseudo-step past the last question step.
        emit({ type: 'step:shown', data: { stepIndex: stepCount, stepCount, phase: 'patient_info' } });
        const partnerVetoed =
          (state.composed?.surveyPreferences as { skipPatientInfoWhenComplete?: boolean } | undefined)
            ?.skipPatientInfoWhenComplete === false;
        if (opts.skipPatientInfoWhenComplete && !partnerVetoed && patientInfoComplete(state.patientInfo)) {
          await submit();
          // submit() sets phase:'error' on failure WITHOUT rethrowing, so a
          // try/catch here would never fire — check the phase instead and fall
          // back to the rendered form rather than stranding the member on a dead
          // error screen with no way to retry. (Cast: TS narrowed `phase` to
          // 'questions' from the guard atop next() and can't see submit() mutate it.)
          if ((state.phase as string) === 'error') {
            setState({
              phase: 'patient_info',
              error: null,
              validationError: 'We couldn’t submit automatically. Please review your details and try again.',
            });
          }
        }
      } else {
        setState({ stepIndex: nextIdx, qualification: result, busy: false });
        persistDraft(nextIdx);
        emit({ type: 'step:shown', data: { stepIndex: nextIdx, stepCount, phase: 'questions' } });
      }
    } catch (err) {
      const msg = formatError(err);
      setState({ phase: 'error', error: msg, busy: false });
    }
  }

  async function submit() {
    if (state.phase !== 'patient_info') return;
    const pi = state.patientInfo;
    const missing = REQUIRED_PATIENT_INFO_FIELDS.filter((k) => !pi[k]);
    if (missing.length > 0) {
      setState({ validationError: `Please complete: ${missing.join(', ')}` });
      return;
    }
    if (pi.email && !/^\S+@\S+\.\S+$/.test(pi.email)) {
      setState({ validationError: 'Please enter a valid email address.' });
      return;
    }

    setState({ phase: 'submitting', validationError: null });
    try {
      const result = await client.submitSurvey({
        drugIds: opts.drugIds,
        templateId: opts.templateId,
        mode: opts.mode,
        token: opts.token,
        answers: visibleSubmissionAnswers(),
        patientInfo: pi,
      });
      if (destroyed) return;
      draftStore.clear();
      setState({ phase: 'complete', result });
      emit({ type: 'submit:succeeded', data: { responseId: result.responseId } });
      if (opts.onComplete) {
        try {
          opts.onComplete(result);
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      const msg = formatError(err);
      setState({ phase: 'error', error: msg });
      emit({ type: 'submit:failed', data: { error: msg } });
      if (opts.onError) {
        try {
          opts.onError(err instanceof Error ? err : new Error(msg));
        } catch {
          /* ignore */
        }
      }
    }
  }

  function restart() {
    draftStore.clear();
    setState({
      phase: 'questions',
      stepIndex: 0,
      answers: {},
      disqualifiedResult: null,
      qualification: null,
      validationError: null,
      error: null,
    });
  }

  function destroy() {
    destroyed = true;
    listeners.clear();
    if (hasWindow) window.removeEventListener('pagehide', onPageHide);
  }

  // ── Subscription ──────────────────────────────────────────────────────────
  const engine: SurveyV2Engine = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setAnswer,
    setPatientInfo,
    next,
    back,
    submit,
    restart,
    destroy,
  };

  if (opts.autoLoad !== false) {
    // Kick off load asynchronously so subscribers can attach first.
    queueMicrotask(() => {
      if (!destroyed) void load();
    });
  }

  return engine;
}

function formatError(err: unknown): string {
  if (err instanceof EmbedApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}
