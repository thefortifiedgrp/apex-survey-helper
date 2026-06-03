# @apextelemed/survey-solid

Solid hook for the **Apex Telemed survey-v2 embed flow**, built on
[`@apextelemed/survey-core`](https://www.npmjs.com/package/@apextelemed/survey-core).
Headless — you own all markup and styling.

```bash
npm install @apextelemed/survey-core @apextelemed/survey-solid
```

`solid-js ^1.9` is a peer dependency. State is mirrored into a Solid store via
`reconcile()`, so the returned accessors are fine-grained reactive.

## Usage

```tsx
import { useSurveyV2Flow } from '@apextelemed/survey-solid';
import { For, Switch, Match } from 'solid-js';

export function Survey() {
  const flow = useSurveyV2Flow({
    apiBaseUrl: 'https://api.apextelemed.com/api',
    publishableKey: 'pk_live_xxx',
    drugIds: ['drug-A'],
  });

  return (
    <Switch>
      <Match when={flow.outcome().kind === 'loading'}>Loading…</Match>
      <Match when={flow.outcome().kind === 'questions'}>
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
        <button onClick={flow.back} disabled={flow.stepIndex() === 0}>Back</button>
        <button onClick={flow.next} disabled={flow.submitting()}>Next</button>
      </Match>
      <Match when={flow.outcome().kind === 'complete'}>Thanks!</Match>
    </Switch>
  );
}
```

> The engine is constructed once when the hook runs. To restart with different
> options, re-create the owning component.

See the [Solid adapter docs](https://github.com/apextelemed/apex-survey-helper/blob/main/docs/partners/solid.md)
for the full `SurveyV2Flow` shape and the
[runnable example](https://github.com/apextelemed/apex-survey-helper/tree/main/examples/solid-vite).
