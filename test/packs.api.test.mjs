import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { describe, it } from "node:test"

const require = createRequire(import.meta.url)
const surfaces = {
  surveys: [
    "SURVEY_LANGUAGE_PROPERTY",
    "applySurveyTranslation",
    "buildSurveyResponseProperties",
    "canSurveyActivateRepeatedly",
    "detectSurveyLanguage",
    "doesSurveyActivateByEvent",
    "findBestTranslationMatch",
    "getBaseLanguage",
    "getLanguageFromStoredPersonProperties",
    "getLengthFromRules",
    "getRequirementsHint",
    "getSurveyInteractionProperty",
    "getSurveyIterationKey",
    "getSurveyOldResponseKey",
    "getSurveyResponseKey",
    "getSurveyResponseValue",
    "getValidationError",
    "isSurveyIterationBased",
    "isSurveyKeyForSurvey",
    "normalizeLanguageCode",
    "surveyHasResponses",
  ],
  "error-tracking": [
    "DEFAULT_EXCEPTION_STEPS_CONFIG",
    "DOMExceptionCoercer",
    "EXCEPTION_STEP_INTERNAL_FIELDS",
    "ErrorCoercer",
    "ErrorEventCoercer",
    "ErrorPropertiesBuilder",
    "EventCoercer",
    "ExceptionStepsBuffer",
    "ObjectCoercer",
    "PrimitiveCoercer",
    "PromiseRejectionEventCoercer",
    "ReduceableCache",
    "StringCoercer",
    "chromeStackLineParser",
    "createDefaultStackParser",
    "createStackParser",
    "geckoStackLineParser",
    "getInjectedReleaseId",
    "getUtf8ByteLength",
    "nodeStackLineParser",
    "opera10StackLineParser",
    "opera11StackLineParser",
    "resolveExceptionStepsConfig",
    "reverseAndStripFrames",
    "stripReservedExceptionStepFields",
    "winjsStackLineParser",
  ],
  otlp: [
    "DEFAULT_HISTOGRAM_BOUNDS",
    "bucketIndexFor",
    "buildMetricsResourceAttributes",
    "buildOtlpLogRecord",
    "buildOtlpLogsPayload",
    "buildOtlpMetricsPayload",
    "buildResourceAttributes",
    "getOtlpSeverityNumber",
    "getOtlpSeverityText",
    "msToUnixNano",
    "resolveMetricsConfig",
    "seriesKey",
    "toOtlpAnyValue",
    "toOtlpKeyValueList",
  ],
}

describe("@itslil/posthog-js pack exports", () => {
  for (const [pack, names] of Object.entries(surfaces)) {
    it(`ships the exact ${pack} surface in ESM and CommonJS`, async () => {
      const esm = await import(`@itslil/posthog-js/${pack}`)
      const cjs = require(`@itslil/posthog-js/${pack}`)
      assert.deepEqual(Object.keys(esm).sort(), [...names].sort())
      assert.deepEqual(Object.keys(cjs).sort(), [...names].sort())
      for (const name of names) {
        assert.notEqual(esm[name], undefined, `${pack} ESM ${name}`)
        assert.notEqual(cjs[name], undefined, `${pack} CJS ${name}`)
      }
    })
  }
})
