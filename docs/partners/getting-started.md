# Getting started

This guide gets a working Apex survey-v2 intake flow rendering on your site in a
few minutes. You'll need:

1. An **Apex publishable key** (`pk_live_…` / `pk_test_…`) — issued by Apex from
   your partner settings.
2. Your site's origin **allow-listed** by Apex (e.g. `https://app.yourco.com`).
   Browser-direct requests from a non-allow-listed origin are rejected.
3. One or more **drug IDs** the survey should ask about (provided by Apex), or a
   **returning-member token** for a refill flow.

> Don't have a publishable key, or need to keep all keys server-side? See
> [Authentication & modes](./auth-and-modes.md) for the proxy integration.

## 1. Install

Pick your framework adapter; both depend on the headless core.

```bash
# React
npm install @apextelemed/survey-core @apextelemed/survey-react

# Solid
npm install @apextelemed/survey-core @apextelemed/survey-solid
```

## 2. Render the flow (React)

```tsx
import { useSurveyV2Flow } from '@apextelemed/survey-react';

export function Intake() {
  const flow = useSurveyV2Flow({
    apiBaseUrl: 'https://api.apextelemed.com/api',
    publishableKey: import.meta.env.VITE_APEX_PUBLISHABLE_KEY,
    drugIds: ['drug-A'],
    onComplete: (r) => console.log('response', r.responseId),
  });

  switch (flow.outcome.kind) {
    case 'loading':
      return <p>Loading…</p>;
    case 'load_failed':
      return <p>Something went wrong: {flow.outcome.error}</p>;
    case 'disqualified':
      return <p>Unfortunately you're not eligible at this time.</p>;
    case 'complete':
      return <p>All set — we'll be in touch shortly.</p>;
  }

  if (flow.outcome.kind === 'patient_info') {
    return (
      <form onSubmit={(e) => { e.preventDefault(); flow.submit(); }}>
        <input placeholder="First name" value={flow.patientInfo.firstName ?? ''}
          onChange={(e) => flow.setPatientInfo({ firstName: e.target.value })} />
        {/* lastName, email, dob (YYYY-MM-DD), state (2-letter) are required */}
        {flow.validationError && <p role="alert">{flow.validationError}</p>}
        <button disabled={flow.submitting}>Submit</button>
      </form>
    );
  }

  // questions phase
  return (
    <div>
      <h2>{flow.currentStep?.stepTitle ?? flow.currentStep?.sectionTitle}</h2>
      {flow.visibleQuestions.map((q) => (
        <label key={q.questionId}>
          <span>{q.text}</span>
          {q.options?.length ? (
            <select
              value={(flow.answers[q.questionId] as string) ?? ''}
              onChange={(e) => flow.setAnswer(q.questionId, e.target.value)}
            >
              <option value="" disabled>Select…</option>
              {q.options.map((o) => (
                <option key={o.value} value={o.value}>{o.text ?? o.value}</option>
              ))}
            </select>
          ) : (
            <input
              value={(flow.answers[q.questionId] as string) ?? ''}
              onChange={(e) => flow.setAnswer(q.questionId, e.target.value)}
            />
          )}
        </label>
      ))}
      {flow.validationError && <p role="alert">{flow.validationError}</p>}
      <button onClick={flow.back} disabled={flow.stepIndex === 0}>Back</button>
      <button onClick={flow.next} disabled={flow.submitting}>Next</button>
    </div>
  );
}
```

That's the whole integration. The hook:

- composes the survey for your `drugIds` on mount,
- walks the patient through one **step** at a time (`flow.currentStep`),
- shows only the **visible** questions for the current answers
  (`flow.visibleQuestions`),
- runs a **qualification check** on every `next()` — if every requested drug is
  disqualified, the flow short-circuits to `disqualified`,
- collects patient info on the final step, then `submit()`s,
- persists a **draft to `localStorage`** so a refresh resumes where they left
  off.

Using Solid? The API is identical except accessors are called as functions
(`flow.outcome()`, `flow.visibleQuestions()`). See [Solid](./solid.md).

## 3. Next steps

- [Authentication & integration modes](./auth-and-modes.md) — browser-direct vs.
  proxy-through-your-backend, the security model, refills.
- [React adapter reference](./react.md) / [Solid adapter reference](./solid.md)
- [Headless / no framework](./headless.md)
- [API contract](./api-contract.md)
- [Theming](./theming.md)
- Runnable examples: [`examples/react-vite`](../../examples/react-vite),
  [`examples/solid-vite`](../../examples/solid-vite)
