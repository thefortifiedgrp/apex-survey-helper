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
