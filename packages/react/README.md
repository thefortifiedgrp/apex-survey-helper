# @apextelemed/survey-react

React hook for the **Apex Telemed survey-v2 embed flow**, built on
[`@apextelemed/survey-core`](https://www.npmjs.com/package/@apextelemed/survey-core).
Headless — you own all markup and styling.

```bash
npm install @apextelemed/survey-core @apextelemed/survey-react
```

`react >= 18` is a peer dependency (the hook uses `useSyncExternalStore`).

## Usage

```tsx
import { useSurveyV2Flow } from '@apextelemed/survey-react';

export function Survey() {
  const flow = useSurveyV2Flow({
    apiBaseUrl: 'https://api.apextelemed.com/api',
    publishableKey: 'pk_live_xxx',
    drugIds: ['drug-A'],
  });

  if (flow.outcome.kind === 'loading') return <p>Loading…</p>;
  if (flow.outcome.kind === 'load_failed') return <p>Error: {flow.outcome.error}</p>;
  if (flow.outcome.kind === 'complete') return <p>Thanks! ({flow.outcome.result.responseId})</p>;
  if (flow.outcome.kind === 'disqualified') return <p>Not eligible.</p>;

  if (flow.outcome.kind === 'patient_info') {
    return (
      <form onSubmit={(e) => { e.preventDefault(); flow.submit(); }}>
        <input
          value={flow.patientInfo.firstName ?? ''}
          onChange={(e) => flow.setPatientInfo({ firstName: e.target.value })}
        />
        {/* lastName, email, dob, state … */}
        {flow.validationError && <p role="alert">{flow.validationError}</p>}
        <button type="submit" disabled={flow.submitting}>Submit</button>
      </form>
    );
  }

  // questions phase
  return (
    <div>
      {flow.visibleQuestions.map((q) => (
        <label key={q.questionId}>
          {q.text}
          <input
            value={(flow.answers[q.questionId] as string) ?? ''}
            onChange={(e) => flow.setAnswer(q.questionId, e.target.value)}
          />
        </label>
      ))}
      {flow.validationError && <p role="alert">{flow.validationError}</p>}
      <button onClick={flow.back} disabled={flow.stepIndex === 0}>Back</button>
      <button onClick={flow.next} disabled={flow.submitting}>Next</button>
    </div>
  );
}
```

> The engine is constructed once when the component mounts. To restart with
> different options, remount the component (e.g. change its React `key`).

See the [React adapter docs](https://github.com/apextelemed/apex-survey-helper/blob/main/docs/partners/react.md)
for the full `SurveyV2Flow` shape and the
[runnable example](https://github.com/apextelemed/apex-survey-helper/tree/main/examples/react-vite).
