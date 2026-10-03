export interface SurveyLogger {
  debug(message: string): void
  info(message: string): void
}

export type SurveyValidationType = "min_length" | "max_length"

export interface SurveyValidationRule {
  type: SurveyValidationType
  value?: number
  errorMessage?: string | null
}

export type SurveyResponseValue = string | number | string[] | null
export type SurveyResponses = Record<string, SurveyResponseValue | undefined>

export interface SurveyWithIteration {
  id: string
  current_iteration?: number | null
}

export interface SurveyQuestionTranslation {
  question?: string
  description?: string | null
  buttonText?: string
  link?: string | null
  lowerBoundLabel?: string
  upperBoundLabel?: string
  choices?: string[]
}

export interface SurveyTranslation extends SurveyQuestionTranslation {
  name?: string
  thankYouMessageHeader?: string | null
  thankYouMessageDescription?: string | null
  thankYouMessageCloseButtonText?: string | null
  introScreenHeader?: string | null
  introScreenDescription?: string | null
  introScreenButtonText?: string | null
  submitButtonText?: string | null
  backButtonText?: string | null
}

export interface TranslatableSurveyQuestion {
  id?: string
  question: string
  originalQuestionIndex?: number
  description?: string | null
  buttonText?: string
  link?: string | null
  lowerBoundLabel?: string
  upperBoundLabel?: string
  choices?: string[]
  translations?: Record<string, SurveyQuestionTranslation>
  [key: string]: unknown
}

export interface TranslatableSurvey<TQuestion extends TranslatableSurveyQuestion = TranslatableSurveyQuestion> {
  id?: string
  name: string
  current_iteration?: number | null
  schedule?: string | null
  conditions?: {
    events?: {
      repeatedActivation?: boolean
      values?: Array<{ name: string }>
    } | null
  } | null
  translations?: Record<string, SurveyTranslation>
  appearance?: Record<string, unknown> | null
  questions: TQuestion[]
  [key: string]: unknown
}

export interface DetectSurveyLanguageOptions {
  overrideLanguage?: unknown
  storedPersonProperties?: unknown
  locale?: unknown
}

export const SURVEY_LANGUAGE_PROPERTY: "$survey_language"
export function getValidationError(
  value: string,
  rules: SurveyValidationRule[] | undefined,
  optional: boolean | undefined,
): string | false
export function getLengthFromRules(
  rules: SurveyValidationRule[] | undefined,
  type: SurveyValidationType,
): number | undefined
export function getRequirementsHint(
  minLength: number | undefined,
  maxLength: number | undefined,
): string | undefined
export function getSurveyResponseKey(questionId: string): string
export function getSurveyOldResponseKey(originalQuestionIndex: number): string
export function getSurveyResponseValue(
  responses: SurveyResponses,
  questionId?: string,
): SurveyResponseValue | undefined
export function buildSurveyResponseProperties(
  responses: SurveyResponses | undefined,
  survey: { questions: Array<Pick<TranslatableSurveyQuestion, "id" | "question" | "originalQuestionIndex">> },
  questionSnapshots?: Record<string, string>,
): Record<string, unknown>
export function surveyHasResponses(responses?: SurveyResponses): boolean
export function getSurveyInteractionProperty(survey: SurveyWithIteration, action: string): string
export function getLanguageFromStoredPersonProperties(storedPersonProperties: unknown): string | null
export function detectSurveyLanguage(
  options: DetectSurveyLanguageOptions,
  logger?: SurveyLogger,
): string | null
export function normalizeLanguageCode(languageCode: string): string
export function getBaseLanguage(languageCode: string): string
export function findBestTranslationMatch(
  translations: Record<string, unknown> | undefined,
  targetLanguage: string,
  logger?: SurveyLogger,
): string | null
export function applySurveyTranslation<
  TQuestion extends TranslatableSurveyQuestion,
  TSurvey extends TranslatableSurvey<TQuestion>,
>(survey: TSurvey, targetLanguage: string, logger?: SurveyLogger): { survey: TSurvey; matchedKey: string | null }
export function doesSurveyActivateByEvent(survey: TranslatableSurvey): boolean
export function canSurveyActivateRepeatedly(survey: TranslatableSurvey): boolean
export function isSurveyIterationBased(survey: TranslatableSurvey): boolean
export function isSurveyKeyForSurvey(key: string, surveyId: string): boolean
export function getSurveyIterationKey(survey: SurveyWithIteration): string

export interface SurveyQuestionForResponses { id?: string; question: string; originalQuestionIndex?: number }
export function recordSurveyAnswer(state: { responses: SurveyResponses; questionSnapshots?: Record<string, string> }, questionId: string, response: SurveyResponseValue, question?: SurveyQuestionForResponses): { responses: SurveyResponses; questionSnapshots: Record<string, string> }
export function buildSurveyResponseEventProperties(options: { event: 'sent' | 'dismissed' | 'abandoned'; survey: { questions: SurveyQuestionForResponses[] }; responses?: SurveyResponses; submissionId?: string; completed?: boolean; surveyLanguage?: string | null; questionSnapshots?: Record<string, string> }): Record<string, unknown>
export type PropertyOperator = 'exact' | 'is_not' | 'regex' | 'not_regex' | 'icontains' | 'not_icontains' | 'gt' | 'lt'
export type PropertyFilters = Record<string, { operator: PropertyOperator; values: Array<string | number | boolean> }>
export function isValidRegex(pattern: string): boolean
export function isMatchingRegex(value: string, pattern: string): boolean
export const propertyComparisons: Record<PropertyOperator, (targets: string[], values: string[]) => boolean>
export function matchPropertyFilters(filters: PropertyFilters | undefined, properties: Record<string, unknown> | undefined): boolean
export function shuffle<T>(array: readonly T[]): T[]
export function getDisplayOrderChoices(question: { choices: string[]; hasOpenChoice?: boolean; shuffleOptions?: boolean }): string[]
