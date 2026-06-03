# Headless / no framework

If you're not on React or Solid — or you want to drive the flow from vanilla JS,
Vue, Svelte, web components, etc. — use `@apextelemed/survey-core` directly.

```bash
npm install @apextelemed/survey-core
```

## The engine

`createSurveyV2Engine(options)` returns a small imperative state machine. It
takes the same options as the framework adapters (`apiBaseUrl`,
`publishableKey` / `tenantKey`, `drugIds` / `token`, `templateId`, `mode`,
`draftTtlMs`, `onEvent`, `onComplete`, `onError`) plus a few injectables useful
for testing/SSR (`client`, `fetch`, `storage`, `autoLoad`).

```ts
import { createSurveyV2Engine, isQuestionVisible } from '@apextelemed/survey-core';

const engine = createSurveyV2Engine({
  apiBaseUrl: 'https://api.apextelemed.com/api',
  publishableKey: 'pk_live_xxx',
  drugIds: ['drug-A'],
  onComplete: (r) => console.log('done', r.responseId),
});

const unsubscribe = engine.subscribe(render);
render();

function render() {
  const s = engine.getState();
  switch (s.phase) {
    case 'loading':       /* spinner */ return;
    case 'error':         /* show s.error */ return;
    case 'disqualified':  /* show s.disqualifiedResult.drugResults */ return;
    case 'complete':      /* show s.result */ return;
    case 'questions': {
      const step = s.flatSteps[s.stepIndex];
      const visible = step.questions.filter((q) => isQuestionVisible(q, s.answers));
      // render `visible`; wire inputs to engine.setAnswer(q.questionId, value)
      // wire a Next button to engine.next(), Back to engine.back()
      return;
    }
    case 'patient_info':
      // render patient-info form; wire to engine.setPatientInfo({...})
      // wire Submit to engine.submit()
      return;
  }
}

// when tearing down:
unsubscribe();
engine.destroy();
```

### Engine surface

```ts
interface SurveyV2Engine {
  getState(): SurveyV2State;
  subscribe(listener: () => void): () => void;  // returns unsubscribe
  setAnswer(questionId: string, value: unknown): void;
  setPatientInfo(patch: Partial<PatientInfo>): void;
  next(): Promise<void>;
  back(): void;
  submit(): Promise<void>;
  restart(): void;
  destroy(): void;
}
```

`getState()` returns a **stable reference** that only changes when the state
changes — ideal for `useSyncExternalStore`-style adapters or simple dirty
checks.

### Phases (`state.phase`)

`loading → questions → patient_info → submitting → complete`, with `disqualified`
and `error` as terminal branches. `next()` validates required visible questions,
runs a qualification check, and either advances, moves to `patient_info` (last
step), or short-circuits to `disqualified`. `submit()` validates patient info
then posts the response.

## Other exports

- `flattenComposedSurvey(survey)` → `FlatStep[]` — flatten a raw composed survey
  if you call the API yourself.
- `isQuestionVisible(question, answers)` — evaluate a question's visibility
  conditions (AND semantics, boolean-normalized).
- `createEmbedApiClient(opts)` — the low-level API client the engine uses.
- `draftKey` / `loadDraft` / `saveDraft` / `clearDraft` — draft persistence
  helpers (pass `storage: null` to disable, or your own `Storage`).

## Writing your own framework adapter

An adapter is ~30 lines: construct the engine, subscribe to mirror
`getState()` into your framework's reactivity, expose `setAnswer` / `next` /
etc., and call `destroy()` on teardown. The
[React](../../packages/react/src/useSurveyV2Flow.ts) and
[Solid](../../packages/solid/src/useSurveyV2Flow.ts) adapters are good
references — copy one and swap the reactivity primitive.
