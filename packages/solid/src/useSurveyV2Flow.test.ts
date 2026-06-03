import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'solid-js';
import type { SurveyV2Engine, SurveyV2State, V2DrugResult, V2SubmitResult } from '@apextelemed/survey-core';

// ── Fake engine ───────────────────────────────────────────────────────────
// A controllable engine that lets tests push state and assert the hook mirrors
// it into the Solid store. The real engine is covered exhaustively by
// @apextelemed/survey-core's own suite.

interface FakeEngine extends SurveyV2Engine {
  setState(patch: Partial<SurveyV2State>): void;
  mocks: Record<string, ReturnType<typeof vi.fn>>;
}

function createFakeEngine(initial: Partial<SurveyV2State> = {}): FakeEngine {
  let state: SurveyV2State = {
    phase: 'loading',
    composed: null,
    flatSteps: [],
    stepIndex: 0,
    answers: {},
    patientInfo: {},
    memberId: null,
    qualification: null,
    result: null,
    disqualifiedResult: null,
    validationError: null,
    busy: false,
    error: null,
    ...initial,
  };
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const mocks = {
    subscribe: vi.fn(),
    destroy: vi.fn(),
    next: vi.fn(),
    back: vi.fn(),
    submit: vi.fn(),
    restart: vi.fn(),
    setAnswer: vi.fn(),
    setPatientInfo: vi.fn(),
  };
  return {
    getState: () => state,
    subscribe(l) {
      mocks.subscribe();
      listeners.add(l);
      return () => listeners.delete(l);
    },
    setAnswer(q, v) {
      mocks.setAnswer(q, v);
      state = { ...state, answers: { ...state.answers, [q]: v } };
      emit();
    },
    setPatientInfo(patch) {
      mocks.setPatientInfo(patch);
      state = { ...state, patientInfo: { ...state.patientInfo, ...patch } };
      emit();
    },
    next: vi.fn(async () => {
      mocks.next();
    }),
    back: () => {
      mocks.back();
    },
    submit: vi.fn(async () => {
      mocks.submit();
    }),
    restart: () => {
      mocks.restart();
    },
    destroy: () => {
      mocks.destroy();
      listeners.clear();
    },
    setState(patch) {
      state = { ...state, ...patch };
      emit();
    },
    mocks,
  };
}

const sampleDrugResult: V2DrugResult = { drugId: 'drug-A', qualified: true };
const sampleSubmitResult: V2SubmitResult = {
  responseId: 'resp-1',
  qualified: true,
  drugResults: [sampleDrugResult],
};

let engineInstance: FakeEngine = createFakeEngine();
let createCalls: any[] = [];

vi.mock('@apextelemed/survey-core', async () => {
  const actual = await vi.importActual<typeof import('@apextelemed/survey-core')>(
    '@apextelemed/survey-core',
  );
  return {
    ...actual,
    createSurveyV2Engine: vi.fn((opts: any) => {
      createCalls.push(opts);
      return engineInstance;
    }),
  };
});

import { useSurveyV2Flow } from './useSurveyV2Flow';

beforeEach(() => {
  engineInstance = createFakeEngine();
  createCalls = [];
});

// ── Engine construction ─────────────────────────────────────────────────────

describe('useSurveyV2Flow — engine construction', () => {
  it('forwards options + connection fields into engine opts', () => {
    const onEvent = vi.fn();
    createRoot((dispose) => {
      useSurveyV2Flow({
        apiBaseUrl: 'http://example.test/api',
        publishableKey: 'pk_abc',
        tenantKey: 'tnt_1',
        drugIds: ['drug-A', 'drug-B'],
        templateId: 'tpl-1',
        mode: 'refill',
        token: 'tok',
        draftTtlMs: 60_000,
        onEvent,
      });
      const passed = createCalls[0];
      expect(passed.apiBaseUrl).toBe('http://example.test/api');
      expect(passed.publishableKey).toBe('pk_abc');
      expect(passed.tenantKey).toBe('tnt_1');
      expect(passed.drugIds).toEqual(['drug-A', 'drug-B']);
      expect(passed.templateId).toBe('tpl-1');
      expect(passed.mode).toBe('refill');
      expect(passed.token).toBe('tok');
      expect(passed.draftTtlMs).toBe(60_000);
      expect(passed.onEvent).toBe(onEvent);
      dispose();
    });
  });
});

// ── Outcome derivation ──────────────────────────────────────────────────────

describe('useSurveyV2Flow — outcome derivation', () => {
  it('starts with outcome.kind === "loading"', () => {
    createRoot((dispose) => {
      const flow = useSurveyV2Flow({ apiBaseUrl: 'http://x/api', drugIds: ['a'] });
      expect(flow.outcome().kind).toBe('loading');
      dispose();
    });
  });

  it('flips to "questions" when the engine reports the questions phase', () => {
    createRoot((dispose) => {
      const flow = useSurveyV2Flow({ apiBaseUrl: 'http://x/api', drugIds: ['a'] });
      engineInstance.setState({ phase: 'questions' });
      expect(flow.outcome().kind).toBe('questions');
      dispose();
    });
  });

  it('synthesizes "load_failed" with the engine error string', () => {
    createRoot((dispose) => {
      const flow = useSurveyV2Flow({ apiBaseUrl: 'http://x/api', drugIds: ['a'] });
      engineInstance.setState({ phase: 'error', error: 'boom' });
      const o = flow.outcome();
      expect(o.kind).toBe('load_failed');
      if (o.kind === 'load_failed') expect(o.error).toBe('boom');
      dispose();
    });
  });

  it('synthesizes "disqualified" carrying drugResults', () => {
    createRoot((dispose) => {
      const flow = useSurveyV2Flow({ apiBaseUrl: 'http://x/api', drugIds: ['a'] });
      engineInstance.setState({
        phase: 'disqualified',
        disqualifiedResult: { drugResults: [{ ...sampleDrugResult, qualified: false }] },
      });
      const o = flow.outcome();
      expect(o.kind).toBe('disqualified');
      if (o.kind === 'disqualified') {
        expect(o.drugResults).toHaveLength(1);
        expect(o.drugResults[0].qualified).toBe(false);
      }
      dispose();
    });
  });

  it('synthesizes "complete" carrying the result', () => {
    createRoot((dispose) => {
      const flow = useSurveyV2Flow({ apiBaseUrl: 'http://x/api', drugIds: ['a'] });
      engineInstance.setState({ phase: 'complete', result: sampleSubmitResult });
      const o = flow.outcome();
      expect(o.kind).toBe('complete');
      if (o.kind === 'complete') expect(o.result.responseId).toBe('resp-1');
      dispose();
    });
  });
});

// ── Reactive accessors ──────────────────────────────────────────────────────

describe('useSurveyV2Flow — reactive accessors', () => {
  it('answers() reflects engine state changes', () => {
    createRoot((dispose) => {
      const flow = useSurveyV2Flow({ apiBaseUrl: 'http://x/api', drugIds: ['a'] });
      expect(flow.answers()).toEqual({});
      flow.setAnswer('q1', 'hello');
      expect(flow.answers().q1).toBe('hello');
      dispose();
    });
  });

  it('patientInfo() reflects engine state changes', () => {
    createRoot((dispose) => {
      const flow = useSurveyV2Flow({ apiBaseUrl: 'http://x/api', drugIds: ['a'] });
      flow.setPatientInfo({ firstName: 'Ana' });
      expect(flow.patientInfo().firstName).toBe('Ana');
      dispose();
    });
  });

  it('submitting() reflects state.busy', () => {
    createRoot((dispose) => {
      const flow = useSurveyV2Flow({ apiBaseUrl: 'http://x/api', drugIds: ['a'] });
      expect(flow.submitting()).toBe(false);
      engineInstance.setState({ busy: true });
      expect(flow.submitting()).toBe(true);
      dispose();
    });
  });

  it('validationError() reflects state.validationError', () => {
    createRoot((dispose) => {
      const flow = useSurveyV2Flow({ apiBaseUrl: 'http://x/api', drugIds: ['a'] });
      expect(flow.validationError()).toBeNull();
      engineInstance.setState({ validationError: 'fill X' });
      expect(flow.validationError()).toBe('fill X');
      dispose();
    });
  });

  it('flatSteps / stepIndex / totalSteps / currentStep all update on state change', () => {
    createRoot((dispose) => {
      const flow = useSurveyV2Flow({ apiBaseUrl: 'http://x/api', drugIds: ['a'] });
      const stepA = { sectionId: 'sec', sectionTitle: 'S', stepId: 'a', questions: [] };
      const stepB = { sectionId: 'sec', sectionTitle: 'S', stepId: 'b', questions: [] };
      engineInstance.setState({ flatSteps: [stepA, stepB], stepIndex: 1 });
      expect(flow.flatSteps()).toHaveLength(2);
      expect(flow.stepIndex()).toBe(1);
      expect(flow.totalSteps()).toBe(2);
      expect(flow.currentStep()?.stepId).toBe('b');
      dispose();
    });
  });
});

// ── Action delegation ───────────────────────────────────────────────────────

describe('useSurveyV2Flow — action delegation', () => {
  it('delegates next/back/submit/restart to the engine', async () => {
    await new Promise<void>((resolve) =>
      createRoot(async (dispose) => {
        const flow = useSurveyV2Flow({ apiBaseUrl: 'http://x/api', drugIds: ['a'] });
        await flow.next();
        expect(engineInstance.mocks.next).toHaveBeenCalledOnce();
        flow.back();
        expect(engineInstance.mocks.back).toHaveBeenCalledOnce();
        await flow.submit();
        expect(engineInstance.mocks.submit).toHaveBeenCalledOnce();
        flow.restart();
        expect(engineInstance.mocks.restart).toHaveBeenCalledOnce();
        dispose();
        resolve();
      }),
    );
  });

  it('exposes the raw engine for advanced use', () => {
    createRoot((dispose) => {
      const flow = useSurveyV2Flow({ apiBaseUrl: 'http://x/api', drugIds: ['a'] });
      expect(flow.engine).toBe(engineInstance);
      dispose();
    });
  });
});

// ── Cleanup ─────────────────────────────────────────────────────────────────

describe('useSurveyV2Flow — cleanup', () => {
  it('unsubscribes and destroys the engine on root dispose', () => {
    createRoot((dispose) => {
      useSurveyV2Flow({ apiBaseUrl: 'http://x/api', drugIds: ['a'] });
      expect(engineInstance.mocks.subscribe).toHaveBeenCalled();
      expect(engineInstance.mocks.destroy).not.toHaveBeenCalled();
      dispose();
      expect(engineInstance.mocks.destroy).toHaveBeenCalledOnce();
    });
  });
});
