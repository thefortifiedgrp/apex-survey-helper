import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { SurveyV2Engine, SurveyV2State, V2DrugResult, V2SubmitResult } from '@apextelemed/survey-core';

// ── Fake engine ───────────────────────────────────────────────────────────
// Mirrors the Solid adapter's test harness: a controllable engine that lets
// tests push state and assert the hook re-derives. The real engine is covered
// exhaustively by @apextelemed/survey-core's own suite.

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
    renderHook(() =>
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
      }),
    );
    const passed = createCalls[0];
    expect(passed.apiBaseUrl).toBe('http://example.test/api');
    expect(passed.publishableKey).toBe('pk_abc');
    expect(passed.tenantKey).toBe('tnt_1');
    expect(passed.drugIds).toEqual(['drug-A', 'drug-B']);
    expect(passed.templateId).toBe('tpl-1');
    expect(passed.mode).toBe('refill');
    expect(passed.token).toBe('tok');
    expect(passed.draftTtlMs).toBe(60_000);
  });

  it('constructs the engine exactly once across re-renders', () => {
    const { rerender } = renderHook((p: { apiBaseUrl: string }) => useSurveyV2Flow(p), {
      initialProps: { apiBaseUrl: 'http://example.test/api' },
    });
    rerender({ apiBaseUrl: 'http://changed.test/api' });
    expect(createCalls).toHaveLength(1);
  });
});

// ── Outcome derivation ──────────────────────────────────────────────────────

describe('useSurveyV2Flow — outcome derivation', () => {
  it('starts with outcome.kind === "loading"', () => {
    const { result } = renderHook(() => useSurveyV2Flow({ apiBaseUrl: 'http://x/api', drugIds: ['a'] }));
    expect(result.current.outcome.kind).toBe('loading');
  });

  it('flips to "questions" when the engine reports the questions phase', () => {
    const { result } = renderHook(() => useSurveyV2Flow({ apiBaseUrl: 'http://x/api', drugIds: ['a'] }));
    act(() => engineInstance.setState({ phase: 'questions' }));
    expect(result.current.outcome.kind).toBe('questions');
  });

  it('synthesizes "load_failed" with the engine error string', () => {
    const { result } = renderHook(() => useSurveyV2Flow({ apiBaseUrl: 'http://x/api', drugIds: ['a'] }));
    act(() => engineInstance.setState({ phase: 'error', error: 'boom' }));
    const o = result.current.outcome;
    expect(o.kind).toBe('load_failed');
    if (o.kind === 'load_failed') expect(o.error).toBe('boom');
  });

  it('synthesizes "disqualified" carrying drugResults', () => {
    const { result } = renderHook(() => useSurveyV2Flow({ apiBaseUrl: 'http://x/api', drugIds: ['a'] }));
    act(() =>
      engineInstance.setState({
        phase: 'disqualified',
        disqualifiedResult: { drugResults: [{ ...sampleDrugResult, qualified: false }] },
      }),
    );
    const o = result.current.outcome;
    expect(o.kind).toBe('disqualified');
    if (o.kind === 'disqualified') {
      expect(o.drugResults).toHaveLength(1);
      expect(o.drugResults[0].qualified).toBe(false);
    }
  });

  it('synthesizes "complete" carrying the result', () => {
    const { result } = renderHook(() => useSurveyV2Flow({ apiBaseUrl: 'http://x/api', drugIds: ['a'] }));
    act(() => engineInstance.setState({ phase: 'complete', result: sampleSubmitResult }));
    const o = result.current.outcome;
    expect(o.kind).toBe('complete');
    if (o.kind === 'complete') expect(o.result.responseId).toBe('resp-1');
  });
});

// ── Reactive values ─────────────────────────────────────────────────────────

describe('useSurveyV2Flow — reactive values', () => {
  it('answers reflect engine state changes', () => {
    const { result } = renderHook(() => useSurveyV2Flow({ apiBaseUrl: 'http://x/api', drugIds: ['a'] }));
    expect(result.current.answers).toEqual({});
    act(() => result.current.setAnswer('q1', 'hello'));
    expect(result.current.answers.q1).toBe('hello');
  });

  it('patientInfo reflects engine state changes', () => {
    const { result } = renderHook(() => useSurveyV2Flow({ apiBaseUrl: 'http://x/api', drugIds: ['a'] }));
    act(() => result.current.setPatientInfo({ firstName: 'Ana' }));
    expect(result.current.patientInfo.firstName).toBe('Ana');
  });

  it('submitting reflects state.busy', () => {
    const { result } = renderHook(() => useSurveyV2Flow({ apiBaseUrl: 'http://x/api', drugIds: ['a'] }));
    expect(result.current.submitting).toBe(false);
    act(() => engineInstance.setState({ busy: true }));
    expect(result.current.submitting).toBe(true);
  });

  it('validationError reflects state.validationError', () => {
    const { result } = renderHook(() => useSurveyV2Flow({ apiBaseUrl: 'http://x/api', drugIds: ['a'] }));
    expect(result.current.validationError).toBeNull();
    act(() => engineInstance.setState({ validationError: 'fill X' }));
    expect(result.current.validationError).toBe('fill X');
  });

  it('flatSteps / stepIndex / totalSteps / currentStep all update on state change', () => {
    const { result } = renderHook(() => useSurveyV2Flow({ apiBaseUrl: 'http://x/api', drugIds: ['a'] }));
    const stepA = { sectionId: 'sec', sectionTitle: 'S', stepId: 'a', questions: [] };
    const stepB = { sectionId: 'sec', sectionTitle: 'S', stepId: 'b', questions: [] };
    act(() => engineInstance.setState({ flatSteps: [stepA, stepB], stepIndex: 1 }));
    expect(result.current.flatSteps).toHaveLength(2);
    expect(result.current.stepIndex).toBe(1);
    expect(result.current.totalSteps).toBe(2);
    expect(result.current.currentStep?.stepId).toBe('b');
  });

  it('visibleQuestions filters by visibility conditions against answers', () => {
    const { result } = renderHook(() => useSurveyV2Flow({ apiBaseUrl: 'http://x/api', drugIds: ['a'] }));
    const step = {
      sectionId: 'sec',
      sectionTitle: 'S',
      stepId: 'a',
      questions: [
        { questionId: 'always', text: 'Q', type: 'text' },
        {
          questionId: 'conditional',
          text: 'Q2',
          type: 'text',
          visibilityConditions: [{ questionId: 'always', operator: 'equals', value: 'yes' }],
        },
      ],
    };
    act(() => engineInstance.setState({ phase: 'questions', flatSteps: [step], stepIndex: 0 }));
    expect(result.current.visibleQuestions.map((q) => q.questionId)).toEqual(['always']);
    act(() => result.current.setAnswer('always', 'yes'));
    expect(result.current.visibleQuestions.map((q) => q.questionId)).toEqual(['always', 'conditional']);
  });
});

// ── Action delegation ───────────────────────────────────────────────────────

describe('useSurveyV2Flow — action delegation', () => {
  it('delegates next/back/submit/restart to the engine', async () => {
    const { result } = renderHook(() => useSurveyV2Flow({ apiBaseUrl: 'http://x/api', drugIds: ['a'] }));
    await act(async () => {
      await result.current.next();
    });
    expect(engineInstance.mocks.next).toHaveBeenCalledOnce();
    act(() => result.current.back());
    expect(engineInstance.mocks.back).toHaveBeenCalledOnce();
    await act(async () => {
      await result.current.submit();
    });
    expect(engineInstance.mocks.submit).toHaveBeenCalledOnce();
    act(() => result.current.restart());
    expect(engineInstance.mocks.restart).toHaveBeenCalledOnce();
  });

  it('exposes the raw engine for advanced use', () => {
    const { result } = renderHook(() => useSurveyV2Flow({ apiBaseUrl: 'http://x/api', drugIds: ['a'] }));
    expect(result.current.engine).toBe(engineInstance);
  });
});

// ── Cleanup ─────────────────────────────────────────────────────────────────

describe('useSurveyV2Flow — cleanup', () => {
  it('subscribes on mount and destroys the engine on unmount', () => {
    const { unmount } = renderHook(() => useSurveyV2Flow({ apiBaseUrl: 'http://x/api', drugIds: ['a'] }));
    expect(engineInstance.mocks.subscribe).toHaveBeenCalled();
    expect(engineInstance.mocks.destroy).not.toHaveBeenCalled();
    unmount();
    expect(engineInstance.mocks.destroy).toHaveBeenCalledOnce();
  });
});
