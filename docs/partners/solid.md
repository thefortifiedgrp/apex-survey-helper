# Solid adapter

```bash
npm install @apextelemed/survey-core @apextelemed/survey-solid
```

`solid-js ^1.9` is a peer dependency. Engine state is mirrored into a Solid
store via `reconcile()`, so the returned **accessors are fine-grained
reactive** — read them inside JSX / effects.

## `useSurveyV2Flow(options)`

The options are identical to the [React adapter](./react.md#options-usesurveyv2flowoptions)
(`apiBaseUrl`, `publishableKey`, `tenantKey`, `drugIds`, `templateId`, `mode`,
`token`, `draftTtlMs`, `onEvent`, `onComplete`, `onError`).

> Call the hook inside a reactive owner (a component or `createRoot`). The
> engine is constructed once; it is destroyed automatically via `onCleanup`.

### Returned `SurveyV2Flow`

Same shape as React, except every read is an **accessor** (call it):

| Field | Type |
| --- | --- |
| `state` | `SurveyV2State` (Solid store — reactive on direct field read) |
| `outcome` | `Accessor<SurveyV2Outcome>` |
| `flatSteps` | `Accessor<FlatStep[]>` |
| `stepIndex` | `Accessor<number>` |
| `totalSteps` | `Accessor<number>` |
| `currentStep` | `Accessor<FlatStep \| null>` |
| `visibleQuestions` | `Accessor<V2Question[]>` |
| `answers` | `Accessor<Record<string, unknown>>` |
| `patientInfo` | `Accessor<PatientInfo>` |
| `submitting` | `Accessor<boolean>` |
| `validationError` | `Accessor<string \| null>` |
| `setAnswer` / `setPatientInfo` | functions |
| `next` / `back` / `submit` / `restart` | functions |
| `engine` | `SurveyV2Engine` |

The `outcome().kind` values and `onEvent` events are the same as
[React](./react.md#outcomekind).

## Example

```tsx
import { useSurveyV2Flow } from '@apextelemed/survey-solid';
import { Switch, Match, For } from 'solid-js';

export function Intake() {
  const flow = useSurveyV2Flow({
    apiBaseUrl: 'https://api.apextelemed.com/api',
    publishableKey: 'pk_live_xxx',
    drugIds: ['drug-A'],
  });

  return (
    <Switch fallback={<p>Loading…</p>}>
      <Match when={flow.outcome().kind === 'load_failed'}>
        <p>Error.</p>
      </Match>
      <Match when={flow.outcome().kind === 'questions'}>
        <h2>{flow.currentStep()?.stepTitle ?? flow.currentStep()?.sectionTitle}</h2>
        <For each={flow.visibleQuestions()}>
          {(q) => (
            <label>
              {q.text}
              <input
                value={(flow.answers()[q.questionId] as string) ?? ''}
                onInput={(e) => flow.setAnswer(q.questionId, e.currentTarget.value)}
              />
            </label>
          )}
        </For>
        {flow.validationError() && <p role="alert">{flow.validationError()}</p>}
        <button onClick={flow.back} disabled={flow.stepIndex() === 0}>Back</button>
        <button onClick={flow.next} disabled={flow.submitting()}>Next</button>
      </Match>
      <Match when={flow.outcome().kind === 'disqualified'}><p>Not eligible.</p></Match>
      <Match when={flow.outcome().kind === 'complete'}><p>Thanks!</p></Match>
    </Switch>
  );
}
```

See [`examples/solid-vite`](../../examples/solid-vite) for a runnable app.
