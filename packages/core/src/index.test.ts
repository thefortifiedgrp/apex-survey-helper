import { describe, it, expect } from 'vitest';
import * as core from './index';

describe('@apextelemed/survey-core barrel', () => {
  it('re-exports the public surface', () => {
    expect(typeof core.createSurveyV2Engine).toBe('function');
    expect(typeof core.createEmbedApiClient).toBe('function');
    expect(typeof core.flattenComposedSurvey).toBe('function');
    expect(typeof core.draftKey).toBe('function');
    expect(typeof core.loadDraft).toBe('function');
    expect(typeof core.saveDraft).toBe('function');
    expect(typeof core.clearDraft).toBe('function');
    expect(core.EmbedApiError).toBeTypeOf('function');
  });
});
