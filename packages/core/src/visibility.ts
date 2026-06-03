import type { V2Question, V2VisibilityCondition } from './types';

const TRUTHY = new Set(['yes', 'true', '1']);
const FALSY = new Set(['no', 'false', '0']);

function normalizeBoolean(value: string): string {
  if (TRUTHY.has(value)) return 'yes';
  if (FALSY.has(value)) return 'no';
  return value;
}

function evaluateCondition(
  condition: V2VisibilityCondition,
  answers: Record<string, unknown>,
): boolean {
  const answer = answers[condition.questionId];
  if (answer === undefined || answer === null || answer === '') return false;

  const answerStr = normalizeBoolean(String(answer).toLowerCase());
  const conditionValue = normalizeBoolean(condition.value.toLowerCase());

  switch (condition.operator.toLowerCase()) {
    case 'equals':
    case 'eq':
    case '=':
    case '==':
      return answerStr === conditionValue;
    case 'not_equals':
    case 'neq':
    case 'ne':
    case '!=':
      return answerStr !== conditionValue;
    case 'contains':
      if (Array.isArray(answer)) {
        return answer.some((v) => normalizeBoolean(String(v).toLowerCase()) === conditionValue);
      }
      return answerStr.includes(conditionValue);
    default:
      return answerStr === conditionValue;
  }
}

export function isQuestionVisible(
  question: V2Question,
  answers: Record<string, unknown>,
): boolean {
  if (!question.visibilityConditions || question.visibilityConditions.length === 0) return true;
  return question.visibilityConditions.every((c) => evaluateCondition(c, answers));
}
