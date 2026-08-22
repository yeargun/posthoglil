import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { describe, it } from "node:test"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const lilPath = existsSync(resolve(root, "dist/posthog.esm.js"))
  ? resolve(root, "dist/posthog.esm.js")
  : resolve(root, "dist/posthog.dev.js")
const source = readFileSync(lilPath, "utf8")

const names = [
  "uuidv7",
  "uuidv4",
  "parseUuid",
  "uuidFromFieldsV7",
  "uuidToHex",
  "normalizeFlagsResponse",
  "getFeatureFlagValue",
  "getFlagValuesFromFlags",
  "getPayloadsFromFlags",
  "createFlagsResponseFromFlagsAndPayloads",
  "minimizeFlagCalledEventProperties",
  "parsePayload",
  "updateFlagValue",
  "flagDetailsToResults",
  "MINIMAL_FLAG_CALLED_EVENT_PROPERTIES",
  "MINIMAL_FLAG_CALLED_EVENT_CAMPAIGN_PROPERTIES",
  "getPostHogCookieName",
  "serializePostHogCookie",
  "parsePostHogCookie",
  "cookieStoreFromHeader",
  "readPostHogCookie",
  "cookieStateToProperties",
  "getConsentCookieName",
  "isOptedOut",
  "apiHostFromConfig",
  "flagsApiHostFromConfig",
  "uiHostFromConfig",
  "regionForHost",
  "endpointFor",
  "rateLimitContext",
  "clampFlushInterval",
  "formatQueue",
  "applyOffsets",
  "sortUnloadRequests",
]

describe("@itslil/posthog-js JS library API", () => {
  it("keeps every public kernel name exact in the compiler output", () => {
    const exports = source.match(/export\{[^}]+\}/)?.[0] ?? ""
    for (const name of names) {
      assert.match(exports, new RegExp(` as ${name}[},]`), `export ${name}`)
    }
  })

  it("exposes the same named surface as default", async () => {
    const mod = await import(pathToFileURL(lilPath).href)
    for (const name of names) {
      assert.notEqual(mod[name], undefined, name)
      assert.equal(mod.default[name], mod[name], `default.${name}`)
    }
  })
})
