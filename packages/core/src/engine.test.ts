import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSurveyV2Engine } from './engine';
import type { EmbedApiClient } from './api';

class InMemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  key(i: number): string | null { return [...this.map.keys()][i] ?? null; }
  getItem(k: string): string | null { return this.map.get(k) ?? null; }
  setItem(k: string, v: string): void { this.map.set(k, v); }
  removeItem(k: string): void { this.map.delete(k); }
  clear(): void { this.map.clear(); }
}

function stubClient(overrides: Partial<EmbedApiClient> = {}): EmbedApiClient {
  return {
    composeSurvey: vi.fn(),
    composeSurveyByToken: vi.fn(),
    checkQualification: vi.fn(),
    submitSurvey: vi.fn(),
    selectDrug: vi.fn(),
    ...overrides,
  } as EmbedApiClient;
}

const TINY_SURVEY = {
  version: 'v2',
  drugIds: ['drug-A'],
  sections: [
    {
      sectionId: 's1',
      order: 0,
      title: 'Section 1',
      steps: [
        { stepId: 'st1', order: 0, questions: [{ questionId: 'q1', text: 'Q?', type: 'text', required: true }] },
      ],
    },
    {
      sectionId: 's2',
      order: 1,
      title: 'Section 2',
      steps: [
        { stepId: 'st2', order: 0, questions: [{ questionId: 'q2', text: 'Q2?', type: 'text' }] },
      ],
    },
  ],
  mode: 'initial' as const,
};

async function tick() {
  // queueMicrotask + await Promise lets the engine's deferred load() complete.
  await new Promise((r) => setTimeout(r, 0));
}

let storage: InMemoryStorage;
beforeEach(() => {
  storage = new InMemoryStorage();
});

describe('createSurveyV2Engine — guards', () => {
  it('throws when neither token nor drugIds is provided', () => {
    expect(() =>
      createSurveyV2Engine({
        publishableKey: 'pk',
        apiBaseUrl: 'http://x',
        client: stubClient(),
        storage,
        autoLoad: false,
      } as any),
    ).toThrow(/token.*drugIds/i);
  });
});

describe('createSurveyV2Engine — load', () => {
  it('drugIds path transitions loading → questions', async () => {
    const client = stubClient({
      composeSurvey: vi.fn().mockResolvedValue(TINY_SURVEY),
    });
    const engine = createSurveyV2Engine({
      publishableKey: 'pk', apiBaseUrl: 'http://x',
      drugIds: ['drug-A'], client, storage,
    });
    await tick();
    expect(engine.getState().phase).toBe('questions');
    expect(engine.getState().flatSteps).toHaveLength(2);
  });

  it('token path pre-fills patientInfo + memberId', async () => {
    const client = stubClient({
      composeSurveyByToken: vi.fn().mockResolvedValue({
        composed: TINY_SURVEY,
        patientInfo: { firstName: 'Ana', email: 'a@t.com' },
        memberId: 'mem-1',
        mode: 'initial',
      }),
    });
    const engine = createSurveyV2Engine({
      publishableKey: 'pk', apiBaseUrl: 'http://x',
      token: 'tok', client, storage,
    });
    await tick();
    expect(engine.getState().phase).toBe('questions');
    expect(engine.getState().patientInfo.firstName).toBe('Ana');
    expect(engine.getState().memberId).toBe('mem-1');
  });

  it('load failure transitions to error + calls onError', async () => {
    const onError = vi.fn();
    const client = stubClient({
      composeSurvey: vi.fn().mockRejectedValue(new Error('boom')),
    });
    const engine = createSurveyV2Engine({
      publishableKey: 'pk', apiBaseUrl: 'http://x',
      drugIds: ['drug-A'], client, storage, onError,
    });
    await tick();
    expect(engine.getState().phase).toBe('error');
    expect(engine.getState().error).toBe('boom');
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('emits survey:loaded once load succeeds', async () => {
    const onEvent = vi.fn();
    const client = stubClient({ composeSurvey: vi.fn().mockResolvedValue(TINY_SURVEY) });
    createSurveyV2Engine({
      publishableKey: 'pk', apiBaseUrl: 'http://x',
      drugIds: ['drug-A'], client, storage, onEvent,
    });
    await tick();
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'survey:loaded' }));
  });
});

describe('createSurveyV2Engine — answers + persistence', () => {
  it('setAnswer persists to storage on every call', async () => {
    const client = stubClient({ composeSurvey: vi.fn().mockResolvedValue(TINY_SURVEY) });
    const engine = createSurveyV2Engine({
      publishableKey: 'pk', apiBaseUrl: 'http://x',
      drugIds: ['drug-A'], client, storage,
    });
    await tick();
    engine.setAnswer('q1', 'hello');
    expect(engine.getState().answers.q1).toBe('hello');
    // Persisted to storage
    const keys = [...new Array(storage.length)].map((_, i) => storage.key(i));
    expect(keys.some((k) => k && k.includes('apex:draft'))).toBe(true);
  });
});

describe('createSurveyV2Engine — navigation', () => {
  it('next() with missing required → validationError, no advance', async () => {
    const client = stubClient({
      composeSurvey: vi.fn().mockResolvedValue(TINY_SURVEY),
      checkQualification: vi.fn(),
    });
    const engine = createSurveyV2Engine({
      publishableKey: 'pk', apiBaseUrl: 'http://x',
      drugIds: ['drug-A'], client, storage,
    });
    await tick();

    await engine.next();
    expect(engine.getState().validationError).toMatch(/required/i);
    expect(engine.getState().stepIndex).toBe(0);
    expect(client.checkQualification).not.toHaveBeenCalled();
  });

  it('next() advances stepIndex on qualified check', async () => {
    const client = stubClient({
      composeSurvey: vi.fn().mockResolvedValue(TINY_SURVEY),
      checkQualification: vi.fn().mockResolvedValue({
        qualified: true,
        drugResults: [{ drugId: 'drug-A', qualified: true }],
      }),
    });
    const engine = createSurveyV2Engine({
      publishableKey: 'pk', apiBaseUrl: 'http://x',
      drugIds: ['drug-A'], client, storage,
    });
    await tick();

    engine.setAnswer('q1', 'answered');
    await engine.next();
    expect(engine.getState().stepIndex).toBe(1);
  });

  it('next() short-circuits to disqualified when all drugs fail', async () => {
    const client = stubClient({
      composeSurvey: vi.fn().mockResolvedValue(TINY_SURVEY),
      checkQualification: vi.fn().mockResolvedValue({
        qualified: false,
        drugResults: [{ drugId: 'drug-A', qualified: false, disqualificationReason: 'Under 18' }],
      }),
    });
    const onEvent = vi.fn();
    const engine = createSurveyV2Engine({
      publishableKey: 'pk', apiBaseUrl: 'http://x',
      drugIds: ['drug-A'], client, storage, onEvent,
    });
    await tick();
    engine.setAnswer('q1', 'ans');
    await engine.next();
    expect(engine.getState().phase).toBe('disqualified');
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'disqualified' }));
  });

  it('drops the draft on disqualification so a return visit starts fresh', async () => {
    const client = stubClient({
      composeSurvey: vi.fn().mockResolvedValue(TINY_SURVEY),
      checkQualification: vi.fn().mockResolvedValue({
        qualified: false,
        drugResults: [{ drugId: 'drug-A', qualified: false, disqualificationReason: 'Under 18' }],
      }),
    });
    const engine = createSurveyV2Engine({
      publishableKey: 'pk', apiBaseUrl: 'http://x',
      drugIds: ['drug-A'], client, storage,
    });
    await tick();
    engine.setAnswer('q1', 'ans');
    const draftKeys = () =>
      [...new Array(storage.length)]
        .map((_, i) => storage.key(i))
        .filter((k): k is string => !!k && k.includes('apex:draft'));
    // The answer was persisted, so its absence below is the clear, not a
    // draft that was never written.
    expect(draftKeys()).toHaveLength(1);

    await engine.next();

    expect(engine.getState().phase).toBe('disqualified');
    expect(draftKeys()).toHaveLength(0);
  });

  it('next() on the last step transitions to patient_info phase', async () => {
    const client = stubClient({
      composeSurvey: vi.fn().mockResolvedValue(TINY_SURVEY),
      checkQualification: vi.fn().mockResolvedValue({
        qualified: true,
        drugResults: [{ drugId: 'drug-A', qualified: true }],
      }),
    });
    const engine = createSurveyV2Engine({
      publishableKey: 'pk', apiBaseUrl: 'http://x',
      drugIds: ['drug-A'], client, storage,
    });
    await tick();
    engine.setAnswer('q1', 'ans');
    await engine.next();
    // now on step 2 (last); answer + next
    await engine.next();
    expect(engine.getState().phase).toBe('patient_info');
  });

  it('back() from patient_info returns to questions without rewinding stepIndex', async () => {
    const client = stubClient({
      composeSurvey: vi.fn().mockResolvedValue(TINY_SURVEY),
      checkQualification: vi.fn().mockResolvedValue({
        qualified: true,
        drugResults: [{ drugId: 'drug-A', qualified: true }],
      }),
    });
    const engine = createSurveyV2Engine({
      publishableKey: 'pk', apiBaseUrl: 'http://x',
      drugIds: ['drug-A'], client, storage,
    });
    await tick();
    engine.setAnswer('q1', 'ans');
    await engine.next();
    await engine.next();
    expect(engine.getState().phase).toBe('patient_info');
    const idxBefore = engine.getState().stepIndex;
    engine.back();
    expect(engine.getState().phase).toBe('questions');
    expect(engine.getState().stepIndex).toBe(idxBefore);
  });
});

describe('createSurveyV2Engine — submit', () => {
  it('validates required patient-info fields', async () => {
    const client = stubClient({
      composeSurvey: vi.fn().mockResolvedValue(TINY_SURVEY),
      checkQualification: vi.fn().mockResolvedValue({
        qualified: true,
        drugResults: [{ drugId: 'drug-A', qualified: true }],
      }),
      submitSurvey: vi.fn(),
    });
    const engine = createSurveyV2Engine({
      publishableKey: 'pk', apiBaseUrl: 'http://x',
      drugIds: ['drug-A'], client, storage,
    });
    await tick();
    engine.setAnswer('q1', 'a');
    await engine.next();
    await engine.next();
    // patient_info now; submit without filling
    await engine.submit();
    expect(engine.getState().validationError).toMatch(/firstName|lastName|email|dob|state/i);
    expect(client.submitSurvey).not.toHaveBeenCalled();
  });

  it('submit() success → complete phase, clears draft, fires onComplete + onEvent', async () => {
    const client = stubClient({
      composeSurvey: vi.fn().mockResolvedValue(TINY_SURVEY),
      checkQualification: vi.fn().mockResolvedValue({
        qualified: true,
        drugResults: [{ drugId: 'drug-A', qualified: true }],
      }),
      submitSurvey: vi.fn().mockResolvedValue({
        responseId: 'resp-1',
        qualified: true,
        drugResults: [{ drugId: 'drug-A', qualified: true }],
      }),
    });
    const onComplete = vi.fn();
    const onEvent = vi.fn();
    const engine = createSurveyV2Engine({
      publishableKey: 'pk', apiBaseUrl: 'http://x',
      drugIds: ['drug-A'], client, storage, onComplete, onEvent,
    });
    await tick();
    engine.setAnswer('q1', 'a');
    await engine.next();
    await engine.next();
    engine.setPatientInfo({
      firstName: 'F', lastName: 'L', email: 'a@b.com', dob: '1990-01-01', state: 'CA',
    });
    await engine.submit();
    expect(engine.getState().phase).toBe('complete');
    expect(engine.getState().result?.responseId).toBe('resp-1');
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ responseId: 'resp-1' }));
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'submit:succeeded' }));
    // Draft cleared
    const keys = [...new Array(storage.length)].map((_, i) => storage.key(i));
    expect(keys.filter((k) => k && k.includes('apex:draft'))).toHaveLength(0);
  });
});

describe('createSurveyV2Engine — submit answer completeness', () => {
  // st2 has a shown optional multi_select (mc) and a reproductive multi_select
  // (repro) gated on sex=='f' — with sex unanswered, repro is hidden.
  const COMPLETENESS_SURVEY = {
    version: 'v2',
    drugIds: ['drug-A'],
    sections: [
      {
        sectionId: 's1', order: 0, title: 'S1',
        steps: [{ stepId: 'st1', order: 0, questions: [{ questionId: 'q1', text: 'Q?', type: 'text', required: true }] }],
      },
      {
        sectionId: 's2', order: 1, title: 'S2',
        steps: [{
          stepId: 'st2', order: 0, questions: [
            { questionId: 'mc', text: 'Conditions?', type: 'multi_select' },
            {
              questionId: 'repro', text: 'Reproductive?', type: 'multi_select',
              visibilityConditions: [{ questionId: 'sex', operator: 'equals', value: 'f' }],
            },
          ],
        }],
      },
    ],
    mode: 'initial' as const,
  };

  function completenessClient(submitSurvey: EmbedApiClient['submitSurvey']) {
    return stubClient({
      composeSurvey: vi.fn().mockResolvedValue(COMPLETENESS_SURVEY),
      checkQualification: vi.fn().mockResolvedValue({
        qualified: true, drugResults: [{ drugId: 'drug-A', qualified: true }],
      }),
      submitSurvey,
    });
  }

  const PATIENT = { firstName: 'F', lastName: 'L', email: 'a@b.com', dob: '1990-01-01', state: 'CA' };

  it('records a shown-but-unselected multi_select as [] and omits a hidden one', async () => {
    const submitSurvey = vi.fn().mockResolvedValue({
      responseId: 'r1', qualified: true, drugResults: [{ drugId: 'drug-A', qualified: true }],
    });
    const engine = createSurveyV2Engine({
      publishableKey: 'pk', apiBaseUrl: 'http://x', drugIds: ['drug-A'],
      client: completenessClient(submitSurvey), storage,
    });
    await tick();
    engine.setAnswer('q1', 'a');
    await engine.next(); // st1 -> st2
    await engine.next(); // st2 -> patient_info (mc + repro left blank)
    engine.setPatientInfo(PATIENT);
    await engine.submit();

    const sent = (submitSurvey.mock.calls[0][0] as any).answers;
    // "no conditions" is a real answer, recorded explicitly.
    expect(sent).toEqual(expect.arrayContaining([{ questionId: 'mc', value: [] }]));
    // touched answers preserved verbatim.
    expect(sent).toEqual(expect.arrayContaining([{ questionId: 'q1', value: 'a' }]));
    // a visibility-hidden question is never fabricated.
    expect(sent.find((a: any) => a.questionId === 'repro')).toBeUndefined();
  });

  it('leaves a real multi_select selection unchanged', async () => {
    const submitSurvey = vi.fn().mockResolvedValue({
      responseId: 'r2', qualified: true, drugResults: [{ drugId: 'drug-A', qualified: true }],
    });
    const engine = createSurveyV2Engine({
      publishableKey: 'pk', apiBaseUrl: 'http://x', drugIds: ['drug-A'],
      client: completenessClient(submitSurvey), storage,
    });
    await tick();
    engine.setAnswer('q1', 'a');
    await engine.next();
    engine.setAnswer('mc', ['type_2_diabetes']);
    await engine.next();
    engine.setPatientInfo(PATIENT);
    await engine.submit();

    const sent = (submitSurvey.mock.calls[0][0] as any).answers;
    expect(sent).toEqual(expect.arrayContaining([{ questionId: 'mc', value: ['type_2_diabetes'] }]));
  });
});

describe('createSurveyV2Engine — funnel events', () => {
  function qualifiedClient() {
    return stubClient({
      composeSurvey: vi.fn().mockResolvedValue(TINY_SURVEY),
      checkQualification: vi.fn().mockResolvedValue({
        qualified: true,
        drugResults: [{ drugId: 'drug-A', qualified: true }],
      }),
    });
  }

  it('emits step:shown for the initial step, on advance, and on back', async () => {
    const onEvent = vi.fn();
    const engine = createSurveyV2Engine({
      publishableKey: 'pk', apiBaseUrl: 'http://x',
      drugIds: ['drug-A'], client: qualifiedClient(), storage, onEvent,
    });
    await tick();
    expect(onEvent).toHaveBeenCalledWith({
      type: 'step:shown',
      data: { stepIndex: 0, stepCount: 2, phase: 'questions' },
    });

    engine.setAnswer('q1', 'a');
    await engine.next();
    expect(onEvent).toHaveBeenCalledWith({
      type: 'step:completed',
      data: { stepIndex: 0, stepCount: 2 },
    });
    expect(onEvent).toHaveBeenCalledWith({
      type: 'step:shown',
      data: { stepIndex: 1, stepCount: 2, phase: 'questions' },
    });

    onEvent.mockClear();
    engine.back();
    expect(onEvent).toHaveBeenCalledWith({
      type: 'step:shown',
      data: { stepIndex: 0, stepCount: 2, phase: 'questions' },
    });
  });

  it('emits qualification:checked on next() and patient_info as the pseudo-step', async () => {
    const onEvent = vi.fn();
    const engine = createSurveyV2Engine({
      publishableKey: 'pk', apiBaseUrl: 'http://x',
      drugIds: ['drug-A'], client: qualifiedClient(), storage, onEvent,
    });
    await tick();
    engine.setAnswer('q1', 'a');
    await engine.next();
    expect(onEvent).toHaveBeenCalledWith({
      type: 'qualification:checked',
      data: expect.objectContaining({ qualified: true }),
    });

    await engine.next(); // last question step → patient_info
    expect(onEvent).toHaveBeenCalledWith({
      type: 'step:shown',
      data: { stepIndex: 2, stepCount: 2, phase: 'patient_info' },
    });
  });

  it('emits abandoned on pagehide while in progress, but not after destroy or completion', async () => {
    const onEvent = vi.fn();
    const engine = createSurveyV2Engine({
      publishableKey: 'pk', apiBaseUrl: 'http://x',
      drugIds: ['drug-A'], client: qualifiedClient(), storage, onEvent,
    });
    await tick();

    window.dispatchEvent(new Event('pagehide'));
    expect(onEvent).toHaveBeenCalledWith({
      type: 'abandoned',
      data: { phase: 'questions', stepIndex: 0, stepCount: 2 },
    });

    onEvent.mockClear();
    engine.destroy();
    window.dispatchEvent(new Event('pagehide'));
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('does not emit abandoned once the survey is complete', async () => {
    const onEvent = vi.fn();
    const submitSurvey = vi.fn().mockResolvedValue({ responseId: 'r1', qualified: true, drugResults: [] });
    const client = stubClient({
      composeSurvey: vi.fn().mockResolvedValue(TINY_SURVEY),
      checkQualification: vi.fn().mockResolvedValue({
        qualified: true,
        drugResults: [{ drugId: 'drug-A', qualified: true }],
      }),
      submitSurvey,
    });
    const engine = createSurveyV2Engine({
      publishableKey: 'pk', apiBaseUrl: 'http://x',
      drugIds: ['drug-A'], client, storage, onEvent,
    });
    await tick();
    engine.setAnswer('q1', 'a');
    await engine.next();
    await engine.next();
    engine.setPatientInfo({
      firstName: 'P', lastName: 'D', email: 'p@d.com', dob: '1990-01-01', state: 'TX',
    });
    await engine.submit();
    expect(engine.getState().phase).toBe('complete');

    onEvent.mockClear();
    window.dispatchEvent(new Event('pagehide'));
    expect(onEvent).not.toHaveBeenCalled();
  });
});

describe('createSurveyV2Engine — lifecycle', () => {
  it('restart() resets state + clears draft', async () => {
    const client = stubClient({
      composeSurvey: vi.fn().mockResolvedValue(TINY_SURVEY),
      checkQualification: vi.fn().mockResolvedValue({
        qualified: false,
        drugResults: [{ drugId: 'drug-A', qualified: false }],
      }),
    });
    const engine = createSurveyV2Engine({
      publishableKey: 'pk', apiBaseUrl: 'http://x',
      drugIds: ['drug-A'], client, storage,
    });
    await tick();
    engine.setAnswer('q1', 'ans');
    await engine.next();
    expect(engine.getState().phase).toBe('disqualified');
    engine.restart();
    expect(engine.getState().phase).toBe('questions');
    expect(engine.getState().answers).toEqual({});
    expect(engine.getState().stepIndex).toBe(0);
  });

  it('subscribe returns an unsubscribe; destroy clears all listeners', async () => {
    const client = stubClient({ composeSurvey: vi.fn().mockResolvedValue(TINY_SURVEY) });
    const engine = createSurveyV2Engine({
      publishableKey: 'pk', apiBaseUrl: 'http://x',
      drugIds: ['drug-A'], client, storage,
    });
    await tick();
    const listener = vi.fn();
    const unsub = engine.subscribe(listener);
    engine.setAnswer('q1', 'a');
    expect(listener).toHaveBeenCalled();
    listener.mockClear();
    unsub();
    engine.setAnswer('q1', 'b');
    expect(listener).not.toHaveBeenCalled();

    const survivor = vi.fn();
    engine.subscribe(survivor);
    engine.destroy();
    engine.setAnswer('q1', 'c');
    expect(survivor).not.toHaveBeenCalled();
  });

  it('autoLoad:false keeps phase in loading until manually triggered', async () => {
    // No way to externally trigger load (engine is opinionated), so this just
    // asserts that autoLoad:false leaves the engine idle in 'loading'.
    const client = stubClient({ composeSurvey: vi.fn().mockResolvedValue(TINY_SURVEY) });
    const engine = createSurveyV2Engine({
      publishableKey: 'pk', apiBaseUrl: 'http://x',
      drugIds: ['drug-A'], client, storage, autoLoad: false,
    });
    await tick();
    expect(engine.getState().phase).toBe('loading');
    expect(client.composeSurvey).not.toHaveBeenCalled();
  });
});

// A 3-step survey whose middle step is gated on the first step's answer. Used
// to assert the engine skips steps with no visible questions during navigation.
const GATED_SURVEY = {
  version: 'v2',
  drugIds: ['drug-A'],
  sections: [
    {
      sectionId: 's1', order: 0, title: 'Sex',
      steps: [{
        stepId: 'st1', order: 0,
        questions: [{
          questionId: 'sex', text: 'Sex assigned at birth?', type: 'multiple_choice', required: true,
          options: [{ value: 'male', text: 'Male' }, { value: 'female', text: 'Female' }],
        }],
      }],
    },
    {
      sectionId: 's2', order: 1, title: 'Reproductive Health',
      steps: [{
        stepId: 'st2', order: 0,
        questions: [{
          questionId: 'preg', text: 'Pregnant?', type: 'multi_select', required: true,
          options: [{ value: 'none', text: 'None of these' }],
          visibilityConditions: [{ questionId: 'sex', operator: 'equals', value: 'female' }],
        }],
      }],
    },
    {
      sectionId: 's3', order: 2, title: 'Almost done',
      steps: [{ stepId: 'st3', order: 0, questions: [{ questionId: 'q3', text: 'Q3?', type: 'text' }] }],
    },
  ],
  mode: 'initial' as const,
};

function gatedClient() {
  return stubClient({
    composeSurvey: vi.fn().mockResolvedValue(GATED_SURVEY),
    checkQualification: vi.fn().mockResolvedValue({
      qualified: true, drugResults: [{ drugId: 'drug-A', qualified: true }],
    }),
  });
}

describe('createSurveyV2Engine — skips steps with no visible questions', () => {
  it('next() jumps over a gated step that is hidden for the current answers', async () => {
    const engine = createSurveyV2Engine({
      publishableKey: 'pk', apiBaseUrl: 'http://x', drugIds: ['drug-A'], client: gatedClient(), storage,
    });
    await tick();
    expect(engine.getState().flatSteps).toHaveLength(3);
    engine.setAnswer('sex', 'male'); // reproductive step (idx 1) becomes hidden
    await engine.next();
    expect(engine.getState().stepIndex).toBe(2); // skipped idx 1
    expect(engine.getState().phase).toBe('questions');
  });

  it('next() stops on the gated step when its condition is met', async () => {
    const engine = createSurveyV2Engine({
      publishableKey: 'pk', apiBaseUrl: 'http://x', drugIds: ['drug-A'], client: gatedClient(), storage,
    });
    await tick();
    engine.setAnswer('sex', 'female'); // reproductive step stays visible
    await engine.next();
    expect(engine.getState().stepIndex).toBe(1);
  });

  it('back() also jumps over the hidden step', async () => {
    const engine = createSurveyV2Engine({
      publishableKey: 'pk', apiBaseUrl: 'http://x', drugIds: ['drug-A'], client: gatedClient(), storage,
    });
    await tick();
    engine.setAnswer('sex', 'male');
    await engine.next();
    expect(engine.getState().stepIndex).toBe(2);
    engine.back();
    expect(engine.getState().stepIndex).toBe(0); // skipped idx 1 going back
  });
});

describe('createSurveyV2Engine — skip patient-info when identity complete', () => {
  const QUALIFIED = { qualified: true, drugResults: [{ drugId: 'drug-A', qualified: true }] };
  const FULL_ID = { firstName: 'Ana', lastName: 'Lee', email: 'a@t.com', dob: '1990-01-01', state: 'CA' };

  function build(overrides: any = {}, opts: any = {}) {
    const client = stubClient({
      composeSurvey: vi.fn().mockResolvedValue(overrides.composed ?? TINY_SURVEY),
      checkQualification: vi.fn().mockResolvedValue(QUALIFIED),
      submitSurvey: overrides.submitSurvey ?? vi.fn().mockResolvedValue({ responseId: 'resp-1', ...QUALIFIED }),
    });
    const engine = createSurveyV2Engine({
      publishableKey: 'pk', apiBaseUrl: 'http://x', drugIds: ['drug-A'], client, storage, ...opts,
    });
    return { engine, client };
  }

  async function driveToEnd(engine: any) {
    engine.setAnswer('q1', 'x'); // q1 is required
    await engine.next(); // step 0 → step 1
    await engine.next(); // step 1 → patient_info OR auto-submit
  }

  it('(a) flag OFF → lands on patient_info form, never auto-submits (regression anchor)', async () => {
    // Complete identity but no opt-in: must behave byte-identically to today.
    const { engine, client } = build({}, { knownPatientInfo: FULL_ID });
    await tick();
    await driveToEnd(engine);
    expect(engine.getState().phase).toBe('patient_info');
    expect(client.submitSurvey).not.toHaveBeenCalled();
  });

  it('(b) flag ON + complete identity → auto-submits to complete', async () => {
    const onComplete = vi.fn();
    const { engine, client } = build({}, { skipPatientInfoWhenComplete: true, knownPatientInfo: FULL_ID, onComplete });
    await tick();
    await driveToEnd(engine);
    expect(client.submitSurvey).toHaveBeenCalledTimes(1);
    expect(engine.getState().phase).toBe('complete');
    expect(engine.getState().result?.responseId).toBe('resp-1');
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ responseId: 'resp-1' }));
  });

  it('(c) flag ON + INCOMPLETE identity → renders patient_info (guard blocks)', async () => {
    const { engine, client } = build({}, { skipPatientInfoWhenComplete: true, knownPatientInfo: { firstName: 'Ana' } });
    await tick();
    await driveToEnd(engine);
    expect(engine.getState().phase).toBe('patient_info');
    expect(client.submitSurvey).not.toHaveBeenCalled();
  });

  it('(d) flag ON + complete + submit fails → falls back to patient_info form', async () => {
    const { engine, client } = build(
      { submitSurvey: vi.fn().mockRejectedValue(new Error('net')) },
      { skipPatientInfoWhenComplete: true, knownPatientInfo: FULL_ID },
    );
    await tick();
    await driveToEnd(engine);
    expect(client.submitSurvey).toHaveBeenCalledTimes(1);
    expect(engine.getState().phase).toBe('patient_info');
    expect(engine.getState().error).toBeNull();
    expect(engine.getState().validationError).toMatch(/try again/i);
  });

  it('(e) partner veto (surveyPreferences.skipPatientInfoWhenComplete=false) → does NOT skip', async () => {
    const vetoed = { ...TINY_SURVEY, surveyPreferences: { skipPatientInfoWhenComplete: false } };
    const { engine, client } = build({ composed: vetoed }, { skipPatientInfoWhenComplete: true, knownPatientInfo: FULL_ID });
    await tick();
    await driveToEnd(engine);
    expect(engine.getState().phase).toBe('patient_info');
    expect(client.submitSurvey).not.toHaveBeenCalled();
  });

  it('(f) host-widened requiredPatientInfoFields unmet (missing address) → guard blocks skip', async () => {
    const { engine, client } = build({}, {
      skipPatientInfoWhenComplete: true,
      knownPatientInfo: FULL_ID, // the 5 but no street1
      requiredPatientInfoFields: ['firstName', 'lastName', 'email', 'dob', 'state', 'street1'],
    });
    await tick();
    await driveToEnd(engine);
    expect(engine.getState().phase).toBe('patient_info');
    expect(client.submitSurvey).not.toHaveBeenCalled();
  });
});

describe('createSurveyV2Engine — pluggable draft store', () => {
  it('loads from an injected store and writes answers/steps back to it', async () => {
    const saved: Array<{ answers: unknown[]; stepIndex: number }> = [];
    const store = {
      load: vi.fn(async () => ({ answers: [{ questionId: 'q1', value: 'restored' }], stepIndex: 1, savedAt: Date.now() })),
      save: vi.fn((d: any) => { saved.push(d); }),
      clear: vi.fn(),
    };
    const client = stubClient({ composeSurvey: vi.fn().mockResolvedValue(TINY_SURVEY) });
    const engine = createSurveyV2Engine({
      publishableKey: 'pk', apiBaseUrl: 'http://x',
      drugIds: ['drug-A'], client, storage, draftStore: store,
    });
    await tick();

    // Restored from the remote store, not localStorage.
    expect(store.load).toHaveBeenCalled();
    expect(engine.getState().answers.q1).toBe('restored');
    expect(engine.getState().stepIndex).toBe(1);

    engine.setAnswer('q1', 'edited');
    expect(store.save).toHaveBeenCalled();
    expect(saved[saved.length - 1].answers).toEqual([{ questionId: 'q1', value: 'edited' }]);
  });

  it('clears the injected store on a terminal outcome', async () => {
    const store = { load: vi.fn(async () => null), save: vi.fn(), clear: vi.fn() };
    const client = stubClient({
      composeSurvey: vi.fn().mockResolvedValue(TINY_SURVEY),
      checkQualification: vi.fn().mockResolvedValue({
        qualified: false,
        drugResults: [{ drugId: 'drug-A', qualified: false }],
      }),
    });
    const engine = createSurveyV2Engine({
      publishableKey: 'pk', apiBaseUrl: 'http://x',
      drugIds: ['drug-A'], client, storage, draftStore: store,
    });
    await tick();
    engine.setAnswer('q1', 'ans');
    await engine.next();

    expect(engine.getState().phase).toBe('disqualified');
    expect(store.clear).toHaveBeenCalled();
  });

  it('defaults to localStorage when no store is injected (unchanged behaviour)', async () => {
    const client = stubClient({ composeSurvey: vi.fn().mockResolvedValue(TINY_SURVEY) });
    const engine = createSurveyV2Engine({
      publishableKey: 'pk', apiBaseUrl: 'http://x',
      drugIds: ['drug-A'], client, storage,
    });
    await tick();
    engine.setAnswer('q1', 'persisted');
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)!);
    const draftKeyName = keys.find((k) => k.startsWith('apex:draft:v1'));
    expect(draftKeyName).toBeTruthy();
    expect(storage.getItem(draftKeyName!)).toContain('persisted');
  });
});
