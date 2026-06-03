# @apextelemed/survey-core

Framework-agnostic state machine and API client for the **Apex Telemed
survey-v2 embed flow**. Zero runtime dependencies. Use it directly for a
no-framework integration, or pair it with [`@apextelemed/survey-react`](https://www.npmjs.com/package/@apextelemed/survey-react)
/ [`@apextelemed/survey-solid`](https://www.npmjs.com/package/@apextelemed/survey-solid).

```bash
npm install @apextelemed/survey-core
```

## Quick start

```ts
import { createSurveyV2Engine } from '@apextelemed/survey-core';

const engine = createSurveyV2Engine({
  apiBaseUrl: 'https://api.apextelemed.com/api',
  publishableKey: 'pk_live_xxx',
  drugIds: ['drug-A'],
  onComplete: (result) => console.log('submitted', result.responseId),
});

const unsubscribe = engine.subscribe(() => render(engine.getState()));
// engine.setAnswer(...) / engine.next() / engine.submit() / engine.restart()
// engine.destroy() when you tear the flow down.
```

The engine walks a survey through these phases: `loading → questions →
patient_info → submitting → complete` (or `disqualified` / `error`). It
persists a draft to `localStorage` so a refresh resumes mid-flow.

See the [full docs](https://github.com/apextelemed/apex-survey-helper/tree/main/docs/partners)
— [headless guide](https://github.com/apextelemed/apex-survey-helper/blob/main/docs/partners/headless.md),
[auth & modes](https://github.com/apextelemed/apex-survey-helper/blob/main/docs/partners/auth-and-modes.md),
[API contract](https://github.com/apextelemed/apex-survey-helper/blob/main/docs/partners/api-contract.md).

## API surface

- `createSurveyV2Engine(opts)` → `SurveyV2Engine` (`getState`, `subscribe`,
  `setAnswer`, `setPatientInfo`, `next`, `back`, `submit`, `restart`, `destroy`)
- `createEmbedApiClient(opts)` → low-level `EmbedApiClient`
- `flattenComposedSurvey(survey)` → `FlatStep[]`
- `isQuestionVisible(question, answers)` → `boolean`
- `draftKey` / `loadDraft` / `saveDraft` / `clearDraft` — draft persistence
- Types: `SurveyV2State`, `SurveyV2Phase`, `V2ComposedSurvey`, `V2Question`,
  `V2QualificationResult`, `V2SubmitResult`, `PatientInfo`, …
