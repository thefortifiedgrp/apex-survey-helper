# API contract

The adapters and core talk to five embed endpoints under `apiBaseUrl`. You only
need this if you're [proxying through your own backend](./auth-and-modes.md#mode-b--proxy-through-your-backend-tenant-key)
or calling the API directly — the SDK handles all of this for you otherwise.

All paths below are relative to `apiBaseUrl` (which already includes `/api`), so
the full path is e.g. `https://api.apextelemed.com/api/v2/embed/surveys`.

## Auth headers

Every request carries one of:

- `x-apex-publishable-key: pk_live_…` — browser-direct mode, **or**
- `X-Tenant-Key: …` — proxy mode (your backend swaps this for real credentials).

`POST` bodies are JSON (`Content-Type: application/json`). Errors return a
non-2xx status with `{ "error": "message" }`; the SDK surfaces this as an
`EmbedApiError` (`.status`, `.message`, `.body`).

## Endpoints

### 1. Compose a survey

```
GET /v2/embed/surveys?drugIds=drug-A,drug-B&templateId=tpl-1&mode=initial
→ 200 V2ComposedSurvey
```

`drugIds` is a comma-joined list. `templateId` and `mode` are optional.

### 2. Compose by returning-member token

```
GET /v2/embed/surveys/by-token?token=…
→ 200 { composed: V2ComposedSurvey, patientInfo: PatientInfo, memberId: string, mode: 'initial'|'refill' }
```

### 3. Mid-stream qualification check

```
POST /v2/embed/surveys/check-qualification
{ drugIds?, templateId?, mode?, token?, answers: V2Answer[] }
→ 200 V2QualificationResult
```

Called on every `next()`. The server evaluates with `partial: true`, so
unanswered questions further down the survey do **not** disqualify the patient
mid-flow. If `drugResults` is non-empty and every entry has `qualified: false`,
the flow short-circuits to `disqualified`.

### 4. Submit the response

```
POST /v2/embed/surveys/responses
{ drugIds?, templateId?, mode?, token?, answers: V2Answer[], patientInfo: PatientInfo }
→ 200 V2SubmitResult
```

### 5. Select a drug (multi-drug results)

```
POST /v2/embed/surveys/responses/:id/select-drug
{ drugId: string }
→ 200
```

Used when a submission qualifies for multiple drugs and the patient picks one.

## Payload shapes

```ts
interface V2ComposedSurvey {
  version?: string;
  partnerId?: string;
  drugIds?: string[];
  templateId?: string | null;
  mode?: 'initial' | 'refill';
  sections?: V2Section[];            // sections → steps → questions
  drugs?: { drugId: string; name?: string; description?: string }[];
  branding?: { logoUrl?: string; primaryColor?: string; companyDisplayName?: string };
}

interface V2Section { sectionId: string; order?: number; title: string; description?: string; steps: V2Step[] }
interface V2Step    { stepId: string; order?: number; title?: string; description?: string; questions: V2Question[] }

interface V2Question {
  questionId: string;
  order?: number;
  text: string;
  type: string;                       // text, select, radio, checkbox, … (render by type)
  required?: boolean;
  options?: V2QuestionOption[];
  helpText?: string;
  visibilityConditions?: V2VisibilityCondition[];
}

// NOTE: option label lives in `text`, the submitted value in `value`.
interface V2QuestionOption { optionId?: string; text?: string; value: string }

interface V2VisibilityCondition { questionId: string; operator: string; value: string }

interface V2Answer { questionId: string; value: unknown }

interface PatientInfo {
  firstName?: string; lastName?: string; email?: string; phone?: string;
  dob?: string;         // YYYY-MM-DD
  state?: string;       // 2-letter
  street1?: string; street2?: string; city?: string; zipCode?: string;
}

interface V2DrugResult {
  drugId: string; drugName?: string; qualified: boolean;
  disqualificationReason?: string; isRecommended?: boolean; recommendationReasons?: string[];
}
interface V2QualificationResult { qualified: boolean; drugResults: V2DrugResult[] }
interface V2SubmitResult extends V2QualificationResult {
  responseId: string; promotion?: unknown; callbackUrl?: string | null;
}
```

> **Rendering options:** read the label from `option.text ?? option.value` and
> submit `option.value`. Don't display `value` directly — it's often a slug.

All of these types are exported from `@apextelemed/survey-core` (and re-exported
from the React/Solid adapters), so you get them for free in TypeScript.

### Question visibility

A question is shown only when **all** its `visibilityConditions` match the
current answers (AND semantics). The `equals` / `not_equals` / `contains`
operators are supported, and boolean-ish values are normalized
(`yes`/`true`/`1` are equivalent, as are `no`/`false`/`0`). The SDK evaluates
this for you via `isQuestionVisible` / `flow.visibleQuestions`.
