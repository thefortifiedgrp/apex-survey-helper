import { useSurveyV2Flow } from '@apextelemed/survey-react';

const DRUG_IDS = (import.meta.env.VITE_APEX_DRUG_IDS ?? 'drug-A')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Minimal, intentionally unstyled integration. Everything visual is up to you —
 * see docs/partners/theming.md. This renders each phase of the flow with plain
 * HTML controls.
 */
export function Survey() {
  const flow = useSurveyV2Flow({
    apiBaseUrl: import.meta.env.VITE_APEX_API_BASE ?? 'https://api.apextelemed.com/api',
    publishableKey: import.meta.env.VITE_APEX_PUBLISHABLE_KEY,
    drugIds: DRUG_IDS,
    onComplete: (r) => console.log('[example] submitted', r),
    onError: (e) => console.error('[example] error', e),
  });

  switch (flow.outcome.kind) {
    case 'loading':
      return <p>Loading survey…</p>;
    case 'load_failed':
      return <p role="alert">Couldn't load the survey: {flow.outcome.error}</p>;
    case 'disqualified':
      return (
        <div>
          <h2>Not eligible</h2>
          <ul>
            {flow.outcome.drugResults.map((d) => (
              <li key={d.drugId}>
                {d.drugName ?? d.drugId}: {d.disqualificationReason ?? 'not qualified'}
              </li>
            ))}
          </ul>
          <button onClick={flow.restart}>Start over</button>
        </div>
      );
    case 'complete':
      return (
        <div>
          <h2>Thank you!</h2>
          <p>Response ID: {flow.outcome.result.responseId}</p>
        </div>
      );
  }

  if (flow.outcome.kind === 'patient_info') {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void flow.submit();
        }}
      >
        <h2>Your details</h2>
        <Field label="First name" value={flow.patientInfo.firstName ?? ''}
          onChange={(v) => flow.setPatientInfo({ firstName: v })} />
        <Field label="Last name" value={flow.patientInfo.lastName ?? ''}
          onChange={(v) => flow.setPatientInfo({ lastName: v })} />
        <Field label="Email" type="email" value={flow.patientInfo.email ?? ''}
          onChange={(v) => flow.setPatientInfo({ email: v })} />
        <Field label="Date of birth" type="date" value={flow.patientInfo.dob ?? ''}
          onChange={(v) => flow.setPatientInfo({ dob: v })} />
        <Field label="State (2-letter)" value={flow.patientInfo.state ?? ''}
          onChange={(v) => flow.setPatientInfo({ state: v.toUpperCase() })} />
        {flow.validationError && <p role="alert">{flow.validationError}</p>}
        <div style={{ marginTop: 16 }}>
          <button type="button" onClick={flow.back}>Back</button>{' '}
          <button type="submit" disabled={flow.submitting}>
            {flow.submitting ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </form>
    );
  }

  // questions phase
  const step = flow.currentStep;
  return (
    <div>
      <p>Step {flow.stepIndex + 1} of {flow.totalSteps}</p>
      <h2>{step?.stepTitle ?? step?.sectionTitle}</h2>
      {step?.stepDescription && <p>{step.stepDescription}</p>}
      {flow.visibleQuestions.map((q) => (
        <div key={q.questionId} style={{ margin: '12px 0' }}>
          <label style={{ display: 'block', fontWeight: 600 }}>{q.text}</label>
          {q.helpText && <small>{q.helpText}</small>}
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
        </div>
      ))}
      {flow.validationError && <p role="alert">{flow.validationError}</p>}
      <div style={{ marginTop: 16 }}>
        <button onClick={flow.back} disabled={flow.stepIndex === 0}>Back</button>{' '}
        <button onClick={flow.next} disabled={flow.submitting}>
          {flow.submitting ? 'Checking…' : 'Next'}
        </button>
      </div>
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div style={{ margin: '8px 0' }}>
      <label style={{ display: 'block' }}>{props.label}</label>
      <input
        type={props.type ?? 'text'}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
  );
}
