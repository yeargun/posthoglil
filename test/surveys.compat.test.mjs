import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { describe, it } from "node:test"
import { bundleOfficialSurveys } from "../scripts/official-bundle.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const lilPath = resolve(root, process.env.POSTHOGLIL_SURVEYS_ARTIFACT ?? ".tmp/surveys.dev.js")
const officialPath = resolve(root, ".tmp/official-surveys.js")
mkdirSync(resolve(root, ".tmp"), { recursive: true })
writeFileSync(officialPath, await bundleOfficialSurveys(root))

const official = await import(pathToFileURL(officialPath).href)
const lil = await import(pathToFileURL(lilPath).href)

function same(name, args) {
  const expected = official[name](...args)
  const actual = lil[name](...args)
  assert.deepEqual(actual, expected, `${name}(${args.map((arg) => JSON.stringify(arg)).join(", ")})`)
  return { expected, actual }
}

describe("@posthog/core/surveys compatibility", () => {
  it("exports the complete pinned runtime surface", () => {
    assert.deepEqual(Object.keys(lil).sort(), Object.keys(official).sort())
    assert.equal(lil.SURVEY_LANGUAGE_PROPERTY, "$survey_language")
  })

  it("matches open-text validation and requirement hints", () => {
    const validationCases = [
      ["", undefined, false],
      ["   ", undefined, undefined],
      ["valid", undefined, false],
      ["", undefined, true],
      ["   ", [], true],
      ["ab", [{ type: "min_length", value: 3 }], false],
      ["abc", [{ type: "min_length", value: 3 }], false],
      ["abcd", [{ type: "max_length", value: 3 }], false],
      ["ab", [{ type: "min_length", value: 3, errorMessage: "Too brief" }], false],
      ["ab", [{ type: "min_length", value: 3, errorMessage: "" }], false],
      ["abcdef", [{ type: "min_length", value: 2 }, { type: "max_length", value: 5 }], false],
      [" ok ", null, false],
      [" ok ", false, false],
    ]
    for (const args of validationCases) same("getValidationError", args)

    const rules = [
      { type: "min_length", value: 2 },
      { type: "max_length", value: 10 },
      { type: "min_length", value: 7 },
    ]
    for (const args of [[undefined, "min_length"], [null, "min_length"], [rules, "min_length"], [rules, "max_length"], [rules, "other"]]) {
      same("getLengthFromRules", args)
    }
    for (const args of [[undefined, undefined], [1, undefined], [1, 8], [2, undefined], [undefined, 1], [undefined, 8], [2, 8], [0, 8], [-2, 8]]) {
      same("getRequirementsHint", args)
    }
  })

  it("matches response properties, legacy keys, array copies, and response detection", () => {
    const survey = {
      id: "survey-1",
      current_iteration: 2,
      questions: [
        { id: "q1", question: "Rate us", originalQuestionIndex: 0 },
        { id: "q2", question: "Anything else?", originalQuestionIndex: 1 },
        { id: "q3", question: "New question" },
      ],
    }
    const responses = {
      $survey_response_q1: 5,
      $survey_response_q2: ["fast", "clear"],
      extra: null,
    }
    same("buildSurveyResponseProperties", [responses, survey])
    same("buildSurveyResponseProperties", [undefined, survey])
    for (const questionId of ["q1", "q2", "", undefined]) {
      const { expected, actual } = same("getSurveyResponseValue", [responses, questionId])
      if (Array.isArray(expected)) {
        assert.notEqual(actual, responses.$survey_response_q2)
      }
    }
    for (const id of ["q1", "", "undefined"]) same("getSurveyResponseKey", [id])
    for (const index of [0, 1, -1, undefined]) same("getSurveyOldResponseKey", [index])
    for (const value of [undefined, {}, { a: null }, { a: undefined }, { a: 0 }, { a: false }, { a: "" }, { a: [] }]) {
      same("surveyHasResponses", [value])
    }
    for (const iteration of [undefined, null, 0, 1, 2, -1]) {
      same("getSurveyInteractionProperty", [{ id: "survey-1", current_iteration: iteration }, "responded"])
    }
  })

  it("matches language detection, matching, logs, and normalization", () => {
    const detectionCases = [
      { overrideLanguage: "de", storedPersonProperties: { language: "es" }, locale: "fr" },
      { storedPersonProperties: { language: " es " }, locale: "fr" },
      { storedPersonProperties: { some_other_property: "value" }, locale: "fr-CA" },
      { storedPersonProperties: { language: "   " } },
      { overrideLanguage: "  it  " },
      {},
    ]
    for (const options of detectionCases) {
      const officialLogs = []
      const lilLogs = []
      const makeLogger = (logs) => ({
        debug(message) { logs.push(["debug", message]) },
        info(message) { logs.push(["info", message]) },
      })
      assert.equal(lil.detectSurveyLanguage(options, makeLogger(lilLogs)), official.detectSurveyLanguage(options, makeLogger(officialLogs)))
      assert.deepEqual(lilLogs, officialLogs)
    }

    for (const stored of [null, undefined, "en", {}, [], { language: "" }, { language: " nl " }]) {
      same("getLanguageFromStoredPersonProperties", [stored])
    }
    for (const language of ["EN", "pt-BR", "zh-Hant-TW", ""]) {
      same("normalizeLanguageCode", [language])
      same("getBaseLanguage", [language])
    }
    const dictionaries = [undefined, {}, { fr: {}, "fr-CA": {} }, { FR: {}, es: {} }]
    for (const translations of dictionaries) {
      for (const target of ["", "FR-ca", "fr-BE", "es", "de"]) {
        const officialLogs = []
        const lilLogs = []
        const o = { debug: (message) => officialLogs.push(message) }
        const l = { debug: (message) => lilLogs.push(message) }
        assert.equal(lil.findBestTranslationMatch(translations, target, l), official.findBestTranslationMatch(translations, target, o))
        assert.deepEqual(lilLogs, officialLogs)
      }
    }
  })

  it("matches survey- and question-level translation without mutating inputs", () => {
    const surveys = [
      {
        id: "none",
        name: "No translations",
        customSurveyField: true,
        questions: [{ question: "Question", customQuestionField: "kept" }],
      },
      {
        id: "survey-level",
        name: "Test Survey",
        appearance: { thankYouMessageHeader: "Thanks", displayIntroScreen: true },
        translations: {
          fr: {
            name: "Enquete",
            thankYouMessageHeader: "Merci",
            introScreenHeader: "Bienvenue",
            submitButtonText: "Envoyer",
            backButtonText: "Retour",
          },
        },
        questions: [{ question: "Question" }],
      },
      {
        id: "question-level",
        name: "Questions",
        questions: [
          {
            question: "How was it?",
            lowerBoundLabel: "Bad",
            upperBoundLabel: "Great",
            translations: { pt: { question: "Como foi?", lowerBoundLabel: "Ruim", upperBoundLabel: "Otimo" } },
          },
          {
            question: "Pick one",
            choices: ["One", "Other"],
            translations: { pt: { choices: ["Um", "Outro"] } },
          },
          { question: "Link", link: "https://example.com", translations: { pt: { link: null } } },
        ],
      },
      {
        id: "appearance-without-appearance",
        name: "No appearance",
        translations: { de: { thankYouMessageHeader: "Danke" } },
        questions: [],
      },
    ]

    for (const survey of surveys) {
      for (const language of ["fr", "pt-BR", "de", "zz"]) {
        const original = structuredClone(survey)
        const officialLogs = []
        const lilLogs = []
        const makeLogger = (logs) => ({
          debug: (message) => logs.push(["debug", message]),
          info: (message) => logs.push(["info", message]),
        })
        const expected = official.applySurveyTranslation(survey, language, makeLogger(officialLogs))
        const actual = lil.applySurveyTranslation(survey, language, makeLogger(lilLogs))
        assert.deepEqual(actual, expected)
        assert.deepEqual(lilLogs, officialLogs)
        assert.deepEqual(survey, original)
        assert.notEqual(actual.survey, survey)
      }
    }
  })

  it("matches activation and iteration key rules", () => {
    const surveys = [
      {},
      { schedule: null, conditions: null },
      { schedule: "always" },
      { schedule: "recurring", current_iteration: 0 },
      { schedule: "once", conditions: { events: null } },
      { schedule: "once", conditions: { events: { values: [] } } },
      { schedule: "once", conditions: { events: { values: [{ name: "event" }] } } },
      { schedule: "once", conditions: { events: { repeatedActivation: true, values: [{ name: "event" }] } } },
    ]
    for (const survey of surveys) {
      same("doesSurveyActivateByEvent", [survey])
      same("canSurveyActivateRepeatedly", [survey])
      same("isSurveyIterationBased", [survey])
    }
    for (const iteration of [undefined, null, 0, 1, 2, -1]) {
      same("getSurveyIterationKey", [{ id: "survey-1", current_iteration: iteration }])
    }
    for (const [key, id] of [["abc", "abc"], ["abc_1", "abc"], ["abc_12", "abc"], ["abcd", "abc"], ["abcd_1", "abc"]]) {
      same("isSurveyKeyForSurvey", [key, id])
    }
  })
})
