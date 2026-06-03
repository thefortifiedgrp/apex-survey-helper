# React adapter

```bash
npm install @apextelemed/survey-core @apextelemed/survey-react
```

`react >= 18` is a peer dependency — the hook is built on `useSyncExternalStore`.

## `useSurveyV2Flow(options)`

### Options (`UseSurveyV2FlowOptions`)

| Option | Type | Notes |
| --- | --- | --- |
| `apiBaseUrl` | `string` | **Required.** Apex backend base incl. `/api`, or your proxy base. |
| `publishableKey` | `string?` | `pk_*` for [browser-direct mode](./auth-and-modes.md). Omit when proxying. |
| `tenantKey` | `string?` | Sent as `X-Tenant-Key` in [proxy mode](./auth-and-modes.md). |
| `drugIds` | `string[]?` | Drugs to compose the survey for. Required unless `token` is set. |
| `templateId` | `string?` | Optional partner survey template. |
| `mode` | `'initial' \| 'refill'?` | Defaults to `initial`. |
| `token` | `string?` | Returning-member token; overrides `drugIds`/`templateId`/`mode`. |
| `draftTtlMs` | `number?` | Draft `localStorage` TTL (default 24h). |
| `onEvent` | `(e: EmbedEvent) => void` | Lifecycle events (see below). |
| `onComplete` | `(r: V2SubmitResult) => void` | Fired once on successful submit. |
| `onError` | `(err: Error) => void` | Fired on load/submit error. |

> The engine is constructed **once** when the component mounts. Later changes to
> `options` are ignored — to start a different survey, remount with a new React
> `key`.

### Returned `SurveyV2Flow`

All values are plain (non-function) and update on re-render.

| Field | Type | Description |
| --- | --- | --- |
| `state` | `SurveyV2State` | Raw engine snapshot. |
| `outcome` | `SurveyV2Outcome` | Discriminated union on `.kind` (see below). |
| `flatSteps` | `FlatStep[]` | All steps (section × step), in order. |
| `stepIndex` | `number` | Current step index. |
| `totalSteps` | `number` | `flatSteps.length`. |
| `currentStep` | `FlatStep \| null` | The active step. |
| `visibleQuestions` | `V2Question[]` | Questions on the current step visible for the current answers. |
| `answers` | `Record<string, unknown>` | Answer map keyed by `questionId`. |
| `setAnswer` | `(questionId, value) => void` | Record an answer. |
| `patientInfo` | `PatientInfo` | Collected patient fields. |
| `setPatientInfo` | `(patch) => void` | Merge patient fields. |
| `submitting` | `boolean` | A network call (next/submit) is in flight. |
| `validationError` | `string \| null` | Current client-side validation message. |
| `next` | `() => Promise<void>` | Validate + qualification-check + advance. |
| `back` | `() => void` | Step back (or from patient-info back to questions). |
| `submit` | `() => Promise<void>` | Validate patient info + submit. |
| `restart` | `() => void` | Clear draft + return to the first step. |
| `engine` | `SurveyV2Engine` | Underlying engine for advanced use. |

### `outcome.kind`

`loading` · `load_failed` (`.error`) · `questions` · `patient_info` ·
`submitting` · `disqualified` (`.drugResults`) · `complete` (`.result`).

### Lifecycle events (`onEvent`)

`survey:loaded` · `qualification:checked` · `disqualified` · `submit:succeeded`
· `submit:failed`. Each event is `{ type, data? }`.

## Phase-by-phase rendering

See [getting-started](./getting-started.md#2-render-the-flow-react) for a full
component, and [`examples/react-vite`](../../examples/react-vite) for a runnable
app. The required patient-info fields validated before submit are `firstName`,
`lastName`, `email`, `dob` (`YYYY-MM-DD`), and `state` (2-letter).
