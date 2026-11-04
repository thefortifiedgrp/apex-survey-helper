import { createElement, StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSurveyV2Flow } from './useSurveyV2Flow';

// Runs the hook against the REAL core engine (no module mock) inside
// <StrictMode>, where React mounts, unmounts and remounts every effect in
// development. A hook that builds its engine during render and destroys it in
// the effect cleanup is left holding a destroyed engine after the remount: the
// engine's deferred load() sees `destroyed` and never fetches, so the survey
// sits on "loading" forever.

const SURVEY = {
  version: 'v2',
  drugIds: ['drug-A'],
  mode: 'initial',
  sections: [
    {
      sectionId: 's1',
      order: 0,
      title: 'Section 1',
      steps: [{ stepId: 'st1', order: 0, questions: [{ questionId: 'q1', text: 'Q?', type: 'text' }] }],
    },
  ],
};

// createElement, not JSX: the root vitest config's Solid plugin would compile
// JSX in this file as Solid.
const strict = ({ children }: { children: ReactNode }) => createElement(StrictMode, null, children);

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  window.localStorage.clear();
  fetchMock = vi.fn(async () => new Response(JSON.stringify(SURVEY), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useSurveyV2Flow — React StrictMode', () => {
  it('loads the survey after the development double-mount', async () => {
    const { result } = renderHook(
      () => useSurveyV2Flow({ apiBaseUrl: 'http://example.test/api', drugIds: ['drug-A'] }),
      { wrapper: strict },
    );

    await waitFor(() => expect(result.current.outcome.kind).toBe('questions'));
    expect(result.current.currentStep?.stepId).toBe('st1');
  });

  it('fetches the survey exactly once (no orphaned engine left loading)', async () => {
    const { result } = renderHook(
      () => useSurveyV2Flow({ apiBaseUrl: 'http://example.test/api', drugIds: ['drug-A'] }),
      { wrapper: strict },
    );

    await waitFor(() => expect(result.current.outcome.kind).toBe('questions'));
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('actions reach the live engine after the remount', async () => {
    const { result } = renderHook(
      () => useSurveyV2Flow({ apiBaseUrl: 'http://example.test/api', drugIds: ['drug-A'] }),
      { wrapper: strict },
    );
    await waitFor(() => expect(result.current.outcome.kind).toBe('questions'));

    result.current.setAnswer('q1', 'hello');
    await waitFor(() => expect(result.current.answers.q1).toBe('hello'));
  });
});
