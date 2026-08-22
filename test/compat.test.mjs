import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { existsSync } from "node:fs"
import { bundleOfficialKernel } from "../scripts/official-bundle.mjs"
import { writeFileSync, mkdirSync } from "node:fs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const lilPath = existsSync(resolve(root, "dist/posthog.esm.js"))
  ? resolve(root, "dist/posthog.esm.js")
  : resolve(root, "dist/posthog.dev.js")

mkdirSync(resolve(root, ".tmp"), { recursive: true })
const officialPath = resolve(root, ".tmp/official-kernel.js")
writeFileSync(officialPath, await bundleOfficialKernel(root))

const official = await import(pathToFileURL(officialPath).href)
const lil = await import(pathToFileURL(lilPath).href)

describe("uuid", () => {
  it("parses the official hyphenated, hex, brace, and urn forms", () => {
    const canonical = "0189dcd5-5311-7d40-8db0-9496a2eef37b"
    for (const input of [
      canonical,
      "0189dcd553117d408db09496a2eef37b",
      "{0189dcd5-5311-7d40-8db0-9496a2eef37b}",
      "urn:uuid:0189dcd5-5311-7d40-8db0-9496a2eef37b",
    ]) {
      assert.equal(lil.parseUuid(input), official.parseUuid(input))
      assert.equal(lil.parseUuid(input), canonical)
    }
  })

  it("matches official fromFieldsV7", () => {
    assert.equal(
      lil.uuidFromFieldsV7(0x0189dcd55311, 0xd40, 0x0db09496, 0xa2eef37b),
      official.uuidFromFieldsV7(0x0189dcd55311, 0xd40, 0x0db09496, 0xa2eef37b),
    )
  })

  it("generates version-7 and version-4 strings", () => {
    const v7 = lil.uuidv7()
    const v4 = lil.uuidv4()
    assert.match(v7, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    assert.match(v4, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    assert.equal(lil.parseUuid(v7), v7)
    assert.notEqual(lil.uuidv7(), v7)
  })
})

describe("feature flags", () => {
  const v2 = {
    flags: {
      "flag-1": {
        key: "flag-1",
        enabled: true,
        variant: undefined,
        reason: undefined,
        metadata: { payload: '{"key":"value1"}' },
      },
      "flag-2": {
        key: "flag-2",
        enabled: true,
        variant: "variant-1",
        reason: undefined,
        metadata: { payload: '{"key":"value2"}' },
      },
      "flag-3": {
        key: "flag-3",
        enabled: false,
        variant: undefined,
        reason: undefined,
        metadata: {},
      },
    },
    errorsWhileComputingFlags: false,
    featureFlags: {},
    featureFlagPayloads: {},
  }

  it("normalizes v2 flags the same way", () => {
    assert.deepEqual(lil.normalizeFlagsResponse(v2), official.normalizeFlagsResponse(v2))
  })

  it("normalizes v1 flags the same way", () => {
    const v1 = {
      featureFlags: { "flag-1": true, "flag-2": "variant-1", "flag-3": false },
      featureFlagPayloads: { "flag-1": { key: "value1" }, "flag-2": { key: "value2" } },
      errorsWhileComputingFlags: false,
    }
    const lilV1 = lil.normalizeFlagsResponse(v1)
    const officialV1 = official.normalizeFlagsResponse(v1)
    assert.deepEqual(Object.keys(lilV1.flags), Object.keys(officialV1.flags))
    assert.deepEqual(lilV1, officialV1)
  })

  it("minimizes $feature_flag_called properties from the same allowlist", () => {
    const properties = {
      $feature_flag: "exp",
      $feature_flag_response: true,
      $set: { email: "a@b.c" },
      token: "phc_secret",
      distinct_id: "user",
      extra: 1,
    }
    assert.deepEqual(
      lil.minimizeFlagCalledEventProperties(properties, ["token", "distinct_id"]),
      official.minimizeFlagCalledEventProperties(properties, ["token", "distinct_id"]),
    )
    assert.deepEqual(lil.MINIMAL_FLAG_CALLED_EVENT_PROPERTIES, official.MINIMAL_FLAG_CALLED_EVENT_PROPERTIES)
  })
})

describe("cookies and consent", () => {
  it("sanitizes cookie names", () => {
    for (const key of ["phc_abc123", "abc+def", "abc/def", "abc=def", "a+b/c=d"]) {
      assert.equal(lil.getPostHogCookieName(key), official.getPostHogCookieName(key))
    }
  })

  it("parses official cookie fixtures", () => {
    const identified = JSON.stringify({
      distinct_id: "user_123",
      $device_id: "device_abc",
      $user_state: "identified",
    })
    assert.deepEqual(lil.parsePostHogCookie(identified), official.parsePostHogCookie(identified))
    const withSession = JSON.stringify({
      distinct_id: "user_123",
      $device_id: "device_abc",
      $sesid: [1708700000000, "session-uuid-v7", 1708700000000],
    })
    assert.deepEqual(lil.parsePostHogCookie(withSession), official.parsePostHogCookie(withSession))
    assert.equal(lil.parsePostHogCookie(""), official.parsePostHogCookie(""))
    assert.equal(lil.parsePostHogCookie("not-json"), official.parsePostHogCookie("not-json"))
  })

  it("roundtrips serialize → parse as anonymous", () => {
    const serialized = lil.serializePostHogCookie("anon-id")
    const parsed = lil.parsePostHogCookie(serialized)
    assert.equal(parsed.distinctId, "anon-id")
    assert.equal(parsed.isIdentified, false)
    assert.equal(typeof parsed.sessionId, "string")
  })

  it("reads cookies from a header store", () => {
    const value = JSON.stringify({ distinct_id: "lambda-user", $device_id: "lambda-user", $user_state: "anonymous" })
    const header = `ph_phc_test_posthog=${encodeURIComponent(value)}`
    assert.deepEqual(lil.readPostHogCookie(lil.cookieStoreFromHeader(header), "phc_test"), official.readPostHogCookie(official.cookieStoreFromHeader(header), "phc_test"))
  })

  it("matches consent cookie names and opt-out", () => {
    assert.equal(lil.getConsentCookieName("phc_abc123"), official.getConsentCookieName("phc_abc123"))
    assert.equal(
      lil.getConsentCookieName("phc_abc123", { consent_persistence_name: "my_consent" }),
      official.getConsentCookieName("phc_abc123", { consent_persistence_name: "my_consent" }),
    )
    const store = lil.cookieStoreFromHeader("__ph_opt_in_out_phc_test=0")
    const officialStore = official.cookieStoreFromHeader("__ph_opt_in_out_phc_test=0")
    assert.equal(lil.isOptedOut(store, "phc_test"), official.isOptedOut(officialStore, "phc_test"))
    assert.equal(lil.isOptedOut(lil.cookieStoreFromHeader(""), "phc_test", { opt_out_capturing_by_default: true }), true)
  })
})

describe("router, rate limit, queue", () => {
  it("routes US, EU, custom, and app hosts", () => {
    const cases = [
      ["https://us.i.posthog.com", "us", "api", "/e/", "https://us.i.posthog.com/e/"],
      ["https://eu.posthog.com", "eu", "api", "e/", "https://eu.i.posthog.com/e/"],
      ["https://app.posthog.com", "us", "ui", "/project", "https://us.posthog.com/project"],
      ["https://ingest.example.com", "custom", "flags", "/flags", "https://ingest.example.com/flags"],
    ]
    for (const [host, region, target, path, url] of cases) {
      assert.equal(lil.regionForHost(host), official.regionForHost(host))
      assert.equal(lil.regionForHost(host), region)
      assert.equal(lil.endpointFor({ api_host: host }, target, path), official.endpointFor({ api_host: host }, target, path))
      assert.equal(lil.endpointFor({ api_host: host }, target, path), url)
    }
    assert.equal(
      lil.endpointFor({ api_host: "https://us.i.posthog.com", asset_host: "https://cdn.example" }, "assets", "/static/x.js"),
      "https://cdn.example/static/x.js",
    )
  })

  it("matches the token-bucket updates", () => {
    const args = [null, 1_000, 10, 100, false]
    assert.deepEqual(lil.rateLimitContext(...args), official.rateLimitContext(...args))
    const next = lil.rateLimitContext({ tokens: 0.5, last: 1_000, dropped: 2 }, 1_000, 10, 100, false)
    assert.deepEqual(next, official.rateLimitContext({ tokens: 0.5, last: 1_000, dropped: 2 }, 1_000, 10, 100, false))
    assert.equal(next.isRateLimited, true)
    assert.equal(next.bucket.dropped, 3)
  })

  it("batches, offsets, and sorts unload requests", () => {
    const items = [
      { url: "/e/", data: { timestamp: 100, event: "a" } },
      { url: "/e/", data: { timestamp: 140, event: "b" } },
      { url: "/i/v0/e/", batchKey: "replay", data: { timestamp: 90 } },
    ]
    assert.deepEqual(lil.formatQueue(items), official.formatQueue(items))
    const data = [
      { timestamp: 100, event: "a" },
      { timestamp: 140, event: "b" },
    ]
    assert.deepEqual(lil.applyOffsets(data, 200), official.applyOffsets(data, 200))
    const unload = [{ url: "/i/v0/e/" }, { url: "/e/" }, { url: "/flags/" }]
    assert.deepEqual(lil.sortUnloadRequests(unload), official.sortUnloadRequests(unload))
    assert.equal(lil.clampFlushInterval(10), official.clampFlushInterval(10))
    assert.equal(lil.clampFlushInterval(9000), official.clampFlushInterval(9000))
    assert.equal(lil.clampFlushInterval("x"), official.clampFlushInterval("x"))
  })
})
