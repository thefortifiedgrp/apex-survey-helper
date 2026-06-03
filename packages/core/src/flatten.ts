import type { FlatStep, V2ComposedSurvey } from './types';

/**
 * Walk the composed survey's sections × steps in order, emitting one FlatStep
 * per (section, step) pair that has at least one question. Empty steps are
 * dropped so the user doesn't see a blank screen with just a Next button.
 */
export function flattenComposedSurvey(survey: V2ComposedSurvey): FlatStep[] {
  const out: FlatStep[] = [];
  const sections = [...(survey.sections ?? [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );
  for (const section of sections) {
    const steps = [...(section.steps ?? [])].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0),
    );
    for (const step of steps) {
      const questions = [...(step.questions ?? [])].sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0),
      );
      if (questions.length === 0) continue;
      out.push({
        sectionId: section.sectionId,
        sectionTitle: section.title,
        sectionDescription: section.description,
        stepId: step.stepId,
        stepTitle: step.title,
        stepDescription: step.description,
        questions,
      });
    }
  }
  return out;
}
