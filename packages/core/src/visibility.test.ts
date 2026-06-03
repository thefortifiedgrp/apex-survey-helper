import { describe, it, expect } from 'vitest';
import { isQuestionVisible } from './visibility';
import type { V2Question } from './types';

function q(overrides: Partial<V2Question> = {}): V2Question {
  return { questionId: 'q1', text: 'Test', type: 'text', ...overrides };
}

describe('isQuestionVisible', () => {
  it('returns true when no visibilityConditions', () => {
    expect(isQuestionVisible(q(), {})).toBe(true);
    expect(isQuestionVisible(q({ visibilityConditions: [] }), {})).toBe(true);
  });

  it('returns false when referenced answer is missing', () => {
    const question = q({
      visibilityConditions: [{ questionId: 'parent', operator: 'equals', value: 'yes' }],
    });
    expect(isQuestionVisible(question, {})).toBe(false);
  });

  it('equals operator matches', () => {
    const question = q({
      visibilityConditions: [{ questionId: 'parent', operator: 'equals', value: 'yes' }],
    });
    expect(isQuestionVisible(question, { parent: 'yes' })).toBe(true);
    expect(isQuestionVisible(question, { parent: 'no' })).toBe(false);
  });

  it('not_equals operator matches', () => {
    const question = q({
      visibilityConditions: [{ questionId: 'parent', operator: 'not_equals', value: 'yes' }],
    });
    expect(isQuestionVisible(question, { parent: 'no' })).toBe(true);
    expect(isQuestionVisible(question, { parent: 'yes' })).toBe(false);
  });

  it('contains operator with array answer', () => {
    const question = q({
      visibilityConditions: [{ questionId: 'parent', operator: 'contains', value: 'diabetes' }],
    });
    expect(isQuestionVisible(question, { parent: ['diabetes', 'hypertension'] })).toBe(true);
    expect(isQuestionVisible(question, { parent: ['hypertension'] })).toBe(false);
  });

  it('contains operator with string answer', () => {
    const question = q({
      visibilityConditions: [{ questionId: 'parent', operator: 'contains', value: 'test' }],
    });
    expect(isQuestionVisible(question, { parent: 'this is a test string' })).toBe(true);
    expect(isQuestionVisible(question, { parent: 'no match' })).toBe(false);
  });

  it('all conditions must be met (AND semantics)', () => {
    const question = q({
      visibilityConditions: [
        { questionId: 'a', operator: 'equals', value: 'yes' },
        { questionId: 'b', operator: 'equals', value: 'yes' },
      ],
    });
    expect(isQuestionVisible(question, { a: 'yes', b: 'yes' })).toBe(true);
    expect(isQuestionVisible(question, { a: 'yes', b: 'no' })).toBe(false);
    expect(isQuestionVisible(question, { a: 'yes' })).toBe(false);
  });

  it('case insensitive', () => {
    const question = q({
      visibilityConditions: [{ questionId: 'parent', operator: 'equals', value: 'Yes' }],
    });
    expect(isQuestionVisible(question, { parent: 'YES' })).toBe(true);
    expect(isQuestionVisible(question, { parent: 'yes' })).toBe(true);
  });

  describe('boolean normalization', () => {
    it('"true" in condition matches "yes" in answer', () => {
      const question = q({
        visibilityConditions: [{ questionId: 'parent', operator: 'equals', value: 'true' }],
      });
      expect(isQuestionVisible(question, { parent: 'yes' })).toBe(true);
    });

    it('"yes" in condition matches "true" in answer', () => {
      const question = q({
        visibilityConditions: [{ questionId: 'parent', operator: 'equals', value: 'yes' }],
      });
      expect(isQuestionVisible(question, { parent: 'true' })).toBe(true);
    });

    it('"false" in condition matches "no" in answer', () => {
      const question = q({
        visibilityConditions: [{ questionId: 'parent', operator: 'equals', value: 'false' }],
      });
      expect(isQuestionVisible(question, { parent: 'no' })).toBe(true);
    });

    it('"no" in condition matches "false" in answer', () => {
      const question = q({
        visibilityConditions: [{ questionId: 'parent', operator: 'equals', value: 'no' }],
      });
      expect(isQuestionVisible(question, { parent: 'false' })).toBe(true);
    });

    it('"1" normalizes to truthy', () => {
      const question = q({
        visibilityConditions: [{ questionId: 'parent', operator: 'equals', value: '1' }],
      });
      expect(isQuestionVisible(question, { parent: 'yes' })).toBe(true);
      expect(isQuestionVisible(question, { parent: 'true' })).toBe(true);
    });

    it('not_equals with boolean normalization', () => {
      const question = q({
        visibilityConditions: [{ questionId: 'parent', operator: 'not_equals', value: 'true' }],
      });
      expect(isQuestionVisible(question, { parent: 'no' })).toBe(true);
      expect(isQuestionVisible(question, { parent: 'yes' })).toBe(false);
    });

    it('non-boolean values pass through unchanged', () => {
      const question = q({
        visibilityConditions: [{ questionId: 'parent', operator: 'equals', value: 'semaglutide' }],
      });
      expect(isQuestionVisible(question, { parent: 'semaglutide' })).toBe(true);
      expect(isQuestionVisible(question, { parent: 'tirzepatide' })).toBe(false);
    });
  });
});
