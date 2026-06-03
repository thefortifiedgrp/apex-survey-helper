import { Switch, Match, For, Show } from 'solid-js';
import { useSurveyV2Flow } from '@apextelemed/survey-solid';

const DRUG_IDS = (import.meta.env.VITE_APEX_DRUG_IDS ?? 'drug-A')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Minimal, intentionally unstyled integration. Everything visual is up to you —
 * see docs/partners/theming.md.
 */
export function Survey() {
  const flow = useSurveyV2Flow({
    apiBaseUrl: import.meta.env.VITE_APEX_API_BASE ?? 'https://api.apextelemed.com/api',
    publishableKey: import.meta.env.VITE_APEX_PUBLISHABLE_KEY,
    drugIds: DRUG_IDS,
    onComplete: (r) => console.log('[example] submitted', r),
    onError: (e) => console.error('[example] error', e),
  });

  return (
    <Switch fallback={<p>Loading survey…</p>}>
      <Match when={flow.outcome().kind === 'load_failed'}>
        <p role="alert">Couldn't load the survey.</p>
      </Match>

      <Match when={flow.outcome().kind === 'disqualified'}>
        <div>
          <h2>Not eligible</h2>
          <button onClick={flow.restart}>Start over</button>
        </div>
      </Match>

      <Match when={flow.outcome().kind === 'complete'}>
        <div>
          <h2>Thank you!</h2>
          <Show when={flow.state.result}>
            {(r) => <p>Response ID: {r().responseId}</p>}
          </Show>
        </div>
      </Match>

      <Match when={flow.outcome().kind === 'patient_info'}>
        <form onSubmit={(e) => { e.preventDefault(); void flow.submit(); }}>
          <h2>Your details</h2>
          <Field label="First name" value={flow.patientInfo().firstName ?? ''}
            onChange={(v) => flow.setPatientInfo({ firstName: v })} />
          <Field label="Last name" value={flow.patientInfo().lastName ?? ''}
            onChange={(v) => flow.setPatientInfo({ lastName: v })} />
          <Field label="Email" type="email" value={flow.patientInfo().email ?? ''}
            onChange={(v) => flow.setPatientInfo({ email: v })} />
          <Field label="Date of birth" type="date" value={flow.patientInfo().dob ?? ''}
            onChange={(v) => flow.setPatientInfo({ dob: v })} />
          <Field label="State (2-letter)" value={flow.patientInfo().state ?? ''}
            onChange={(v) => flow.setPatientInfo({ state: v.toUpperCase() })} />
          <Show when={flow.validationError()}>
            <p role="alert">{flow.validationError()}</p>
          </Show>
          <div style={{ 'margin-top': '16px' }}>
            <button type="button" onClick={flow.back}>Back</button>{' '}
            <button type="submit" disabled={flow.submitting()}>
              {flow.submitting() ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </form>
      </Match>

      <Match when={flow.outcome().kind === 'questions'}>
        <div>
          <p>Step {flow.stepIndex() + 1} of {flow.totalSteps()}</p>
          <h2>{flow.currentStep()?.stepTitle ?? flow.currentStep()?.sectionTitle}</h2>
          <For each={flow.visibleQuestions()}>
            {(q) => (
              <div style={{ margin: '12px 0' }}>
                <label style={{ display: 'block', 'font-weight': '600' }}>{q.text}</label>
                <Show
                  when={q.options?.length}
                  fallback={
                    <input
                      value={(flow.answers()[q.questionId] as string) ?? ''}
                      onInput={(e) => flow.setAnswer(q.questionId, e.currentTarget.value)}
                    />
                  }
                >
                  <select
                    value={(flow.answers()[q.questionId] as string) ?? ''}
                    onChange={(e) => flow.setAnswer(q.questionId, e.currentTarget.value)}
                  >
                    <option value="" disabled>Select…</option>
                    <For each={q.options}>
                      {(o) => <option value={o.value}>{o.text ?? o.value}</option>}
                    </For>
                  </select>
                </Show>
              </div>
            )}
          </For>
          <Show when={flow.validationError()}>
            <p role="alert">{flow.validationError()}</p>
          </Show>
          <div style={{ 'margin-top': '16px' }}>
            <button onClick={flow.back} disabled={flow.stepIndex() === 0}>Back</button>{' '}
            <button onClick={flow.next} disabled={flow.submitting()}>
              {flow.submitting() ? 'Checking…' : 'Next'}
            </button>
          </div>
        </div>
      </Match>
    </Switch>
  );
}

function Field(props: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div style={{ margin: '8px 0' }}>
      <label style={{ display: 'block' }}>{props.label}</label>
      <input type={props.type ?? 'text'} value={props.value} onInput={(e) => props.onChange(e.currentTarget.value)} />
    </div>
  );
}
