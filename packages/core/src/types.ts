// Wire shape of a v2 composed survey.
//
// The backend composition service returns a sections → steps → questions
// hierarchy (mirroring v1 for renderer back-compat). Section.steps[].questions
// is where the actual question definitions live.

export interface V2QuestionOption {
  optionId?: string;
  text?: string;
  value: string;
}

export interface V2Question {
  questionId: string;
  order?: number;
  text: string;
  type: string;
  required?: boolean;
  options?: V2QuestionOption[];
  helpText?: string;
  visibilityConditions?: V2VisibilityCondition[];
  [k: string]: unknown;
}

export interface V2VisibilityCondition {
  questionId: string;
  operator: string;
  value: string;
}

export interface V2Step {
  stepId: string;
  order?: number;
  title?: string;
  description?: string;
  questions: V2Question[];
}

export interface V2Section {
  sectionId: string;
  order?: number;
  title: string;
  description?: string;
  steps: V2Step[];
}

export interface V2ComposedSurvey {
  version?: string;
  partnerId?: string;
  drugIds?: string[];
  templateId?: string | null;
  mode?: 'initial' | 'refill';
  sections?: V2Section[];
  drugs?: { drugId: string; name?: string; description?: string }[];
  branding?: {
    logoUrl?: string;
    primaryColor?: string;
    companyDisplayName?: string;
  };
  [k: string]: unknown;
}

export interface V2DrugResult {
  drugId: string;
  drugName?: string;
  qualified: boolean;
  /** Legacy singular reason. The backend now sends `disqualificationReasons`
   *  (plural); prefer {@link disqualificationReasonText} which reads both. */
  disqualificationReason?: string;
  /** Per-drug disqualification reasons as sent on the wire (may be empty
   *  strings). Present alongside the legacy singular field. */
  disqualificationReasons?: string[];
  /** Non-blocking clinical flags surfaced to the prescriber. */
  flags?: unknown[];
  isRecommended?: boolean;
  recommendationReasons?: string[];
}

export interface V2QualificationResult {
  qualified: boolean;
  drugResults: V2DrugResult[];
}

export interface V2SubmitResult extends V2QualificationResult {
  responseId: string;
  promotion?: unknown;
  callbackUrl?: string | null;
}

export interface V2Answer {
  questionId: string;
  value: unknown;
}

export interface PatientInfo {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  dob?: string;
  state?: string;
  street1?: string;
  street2?: string;
  city?: string;
  zipCode?: string;
  [k: string]: string | undefined;
}

// A flattened navigation unit — one (section, step) pair with its questions.
// Engines walk these one at a time; the UI shows the section title alongside.
export interface FlatStep {
  sectionId: string;
  sectionTitle: string;
  sectionDescription?: string;
  stepId: string;
  stepTitle?: string;
  stepDescription?: string;
  questions: V2Question[];
}

// Lifecycle events emitted by the engine. Only a subset is emitted today; the
// rest are reserved so consumer code subscribing broadly doesn't break later.
export type EmbedEventType =
  | 'survey:loaded'
  | 'submit:succeeded'
  | 'submit:failed'
  | 'step:shown'
  | 'step:completed'
  | 'qualification:checked'
  | 'disqualified'
  | 'abandoned';

export interface EmbedEvent {
  type: EmbedEventType;
  data?: unknown;
}
