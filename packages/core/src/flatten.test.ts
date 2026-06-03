import { describe, it, expect } from 'vitest';
import { flattenComposedSurvey } from './flatten';
import type { V2ComposedSurvey } from './types';

function makeSurvey(sections: any[]): V2ComposedSurvey {
  return { version: 'v2', drugIds: [], sections, mode: 'initial' };
}

describe('flattenComposedSurvey', () => {
  it('emits one FlatStep per (section, step) pair with questions', () => {
    const survey = makeSurvey([
      {
        sectionId: 's1', order: 0, title: 'A',
        steps: [
          { stepId: 'st1', order: 0, questions: [{ questionId: 'q1', text: 'q', type: 'text' }] },
        ],
      },
      {
        sectionId: 's2', order: 1, title: 'B',
        steps: [
          { stepId: 'st2', order: 0, questions: [{ questionId: 'q2', text: 'q', type: 'text' }] },
          { stepId: 'st3', order: 1, questions: [{ questionId: 'q3', text: 'q', type: 'text' }] },
        ],
      },
    ]);
    const flat = flattenComposedSurvey(survey);
    expect(flat).toHaveLength(3);
    expect(flat.map((f) => f.sectionId)).toEqual(['s1', 's2', 's2']);
    expect(flat.map((f) => f.stepId)).toEqual(['st1', 'st2', 'st3']);
  });

  it('drops steps with no questions', () => {
    const survey = makeSurvey([
      {
        sectionId: 's1', order: 0, title: 'A',
        steps: [
          { stepId: 'empty', order: 0, questions: [] },
          { stepId: 'real', order: 1, questions: [{ questionId: 'q', text: 'q', type: 'text' }] },
        ],
      },
    ]);
    const flat = flattenComposedSurvey(survey);
    expect(flat).toHaveLength(1);
    expect(flat[0].stepId).toBe('real');
  });

  it('sorts sections then steps then questions by `order`', () => {
    const survey = makeSurvey([
      {
        sectionId: 's1', order: 5, title: 'A',
        steps: [{ stepId: 'st', order: 0, questions: [{ questionId: 'q', order: 0, text: 'q', type: 'text' }] }],
      },
      {
        sectionId: 's2', order: 1, title: 'B',
        steps: [
          { stepId: 'st_b1', order: 10, questions: [{ questionId: 'b1', order: 0, text: 'q', type: 'text' }] },
          { stepId: 'st_b2', order: 1, questions: [{ questionId: 'b2', order: 0, text: 'q', type: 'text' }] },
        ],
      },
    ]);
    const flat = flattenComposedSurvey(survey);
    expect(flat.map((f) => f.stepId)).toEqual(['st_b2', 'st_b1', 'st']);
  });

  it('carries section + step metadata into each FlatStep', () => {
    const survey = makeSurvey([
      {
        sectionId: 's1', order: 0, title: 'Section title', description: 'Section desc',
        steps: [
          {
            stepId: 'st', order: 0,
            title: 'Step title', description: 'Step desc',
            questions: [{ questionId: 'q', text: 'q', type: 'text' }],
          },
        ],
      },
    ]);
    const [flat] = flattenComposedSurvey(survey);
    expect(flat.sectionTitle).toBe('Section title');
    expect(flat.sectionDescription).toBe('Section desc');
    expect(flat.stepTitle).toBe('Step title');
    expect(flat.stepDescription).toBe('Step desc');
  });

  it('returns [] for an empty survey', () => {
    expect(flattenComposedSurvey({ version: 'v2', drugIds: [], sections: [], mode: 'initial' })).toEqual([]);
    expect(flattenComposedSurvey({ version: 'v2', drugIds: [], mode: 'initial' } as any)).toEqual([]);
  });
});
