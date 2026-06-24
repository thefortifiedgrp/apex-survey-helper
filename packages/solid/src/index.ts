export {
  useSurveyV2Flow,
  type UseSurveyV2FlowOptions,
  type SurveyV2Flow,
  type SurveyV2Outcome,
} from './useSurveyV2Flow';

// Eligibility gating helpers (re-exported from core so a Solid integration can
// depend on just `@apextelemed/survey-solid`).
export {
  qualifiedDrugIds,
  disqualifiedDrugIds,
  disqualificationReasonText,
} from '@apextelemed/survey-core';

// Re-export the core types consumers most commonly need when rendering, so a
// Solid integration can depend on just `@apextelemed/survey-solid` for types.
export type {
  SurveyV2State,
  SurveyV2Phase,
  FlatStep,
  PatientInfo,
  V2Question,
  V2QuestionOption,
  V2Section,
  V2Step,
  V2ComposedSurvey,
  V2DrugResult,
  V2QualificationResult,
  V2SubmitResult,
  EmbedEvent,
  EmbedEventType,
} from '@apextelemed/survey-core';
