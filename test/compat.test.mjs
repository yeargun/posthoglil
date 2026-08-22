import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { existsSync } from "node:fs"
import { bundleOfficialKernel } from "../scripts/official-bundle.mjs"
import { writeFileSync, mkdirSync } from "node:fs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const lilPath = process.env.POSTHOGLIL_ARTIFACT
  ? resolve(root, process.env.POSTHOGLIL_ARTIFACT)
  : existsSync(resolve(root, "dist/posthog.esm.js"))
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

describe("bot detection", () => {
  it("matches the default blocked UA list and lookups", () => {
    assert.deepEqual(lil.DEFAULT_BLOCKED_UA_STRS, official.DEFAULT_BLOCKED_UA_STRS)
    const bots = [
      "Mozilla/5.0 AppleWebKit/537.36 (compatible; Googlebot/2.1)",
      "Mozilla/5.0 (compatible; GPTBot/1.0)",
      "HeadlessChrome/122.0.0.0",
      "Slackbot-LinkExpanding 1.0",
    ]
    const humans = [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:129.0) Gecko/20100101 Firefox/129.0",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.6478.127 Electron/31.2.1 Safari/537.36",
    ]
    for (const ua of bots) {
      assert.equal(lil.isBlockedUA(ua), official.isBlockedUA(ua))
      assert.equal(lil.isBlockedUA(ua), true)
      assert.equal(lil.isBlockedUA(ua.toUpperCase()), true)
    }
    for (const ua of humans) {
      assert.equal(lil.isBlockedUA(ua), official.isBlockedUA(ua))
      assert.equal(lil.isBlockedUA(ua), false)
    }
    assert.equal(lil.isBlockedUA(undefined), official.isBlockedUA(undefined))
    assert.equal(lil.isBlockedUA("Mozilla/5.0 testington", ["testington"]), true)
  })
})

describe("strings, numbers, types, json, url", () => {
  it("matches string helpers and person-property hashes", () => {
    assert.equal(lil.includes("feature_flag", "flag"), official.includes("feature_flag", "flag"))
    assert.equal(lil.includes(["a", "b"], "b"), official.includes(["a", "b"], "b"))
    assert.equal(lil.trim("  \u00A0hi\uFEFF  "), official.trim("  \u00A0hi\uFEFF  "))
    assert.equal(lil.stripLeadingDollar("$set"), official.stripLeadingDollar("$set"))
    assert.equal(lil.stripLeadingDollar("set"), official.stripLeadingDollar("set"))
    assert.equal(lil.isDistinctIdStringLike("Distinct_ID"), official.isDistinctIdStringLike("Distinct_ID"))
    assert.equal(lil.isDistinctIdStringLike("user"), official.isDistinctIdStringLike("user"))
    assert.equal(
      lil.getPersonPropertiesHash("user-1", { b: "value-b", a: "value-a" }),
      official.getPersonPropertiesHash("user-1", { b: "value-b", a: "value-a" }),
    )
    assert.equal(
      lil.getPersonPropertiesHash("user-1", { nested: { z: 1, a: 2 } }, { other: { y: 3, b: 4 } }),
      official.getPersonPropertiesHash("user-1", { nested: { z: 1, a: 2 } }, { other: { y: 3, b: 4 } }),
    )
    assert.equal(lil.getPersonPropertiesHash("user-1"), official.getPersonPropertiesHash("user-1"))
  })

  it("matches clamp, remote config, and sample-rate checks", () => {
    const silent = { warn() {} }
    const cases = [
      [null, 10, 100, undefined],
      ["not-a-number", 10, 100, undefined],
      [150, 10, 100, undefined],
      [5, 10, 100, undefined],
      [50, 10, 100, undefined],
      ["invalid", 10, 100, 20],
      [Number.NaN, 10, 100, 20],
      [Number.POSITIVE_INFINITY, 10, 100, undefined],
      [Number.NEGATIVE_INFINITY, 10, 100, undefined],
    ]
    for (const [value, min, max, fallback] of cases) {
      assert.equal(
        lil.clampToRange(value, min, max, silent, fallback),
        official.clampToRange(value, min, max, silent, fallback),
      )
    }
    assert.equal(lil.clampToRange(50, 100, 10, silent), official.clampToRange(50, 100, 10, silent))
    assert.equal(lil.getRemoteConfigBool(undefined, "key"), official.getRemoteConfigBool(undefined, "key"))
    assert.equal(lil.getRemoteConfigBool(undefined, "key", false), official.getRemoteConfigBool(undefined, "key", false))
    assert.equal(lil.getRemoteConfigBool(false, "key", true), official.getRemoteConfigBool(false, "key", true))
    assert.equal(
      lil.getRemoteConfigBool({ autocaptureExceptions: false }, "autocaptureExceptions"),
      official.getRemoteConfigBool({ autocaptureExceptions: false }, "autocaptureExceptions"),
    )
    assert.equal(
      lil.getRemoteConfigNumber({ sampleRate: "0.5" }, "sampleRate"),
      official.getRemoteConfigNumber({ sampleRate: "0.5" }, "sampleRate"),
    )
    assert.equal(
      lil.getRemoteConfigNumber({ sampleRate: "   " }, "sampleRate"),
      official.getRemoteConfigNumber({ sampleRate: "   " }, "sampleRate"),
    )
    for (const value of [0, 0.5, 1, -0.1, 1.1, Number.POSITIVE_INFINITY, Number.NaN, "0.5", null]) {
      assert.equal(lil.isValidSampleRate(value), official.isValidSampleRate(value))
    }
  })

  it("matches portable type, json, and url helpers", () => {
    assert.equal(lil.isNumber(1), official.isNumber(1))
    assert.equal(lil.isNumber(Number.NaN), official.isNumber(Number.NaN))
    assert.equal(lil.isNumber(Number.POSITIVE_INFINITY), official.isNumber(Number.POSITIVE_INFINITY))
    assert.equal(lil.isEmptyObject({}), official.isEmptyObject({}))
    assert.equal(lil.isEmptyObject({ a: 1 }), official.isEmptyObject({ a: 1 }))
    assert.equal(lil.isEmptyObject([]), official.isEmptyObject([]))
    assert.equal(lil.isEmptyString("  "), official.isEmptyString("  "))
    assert.equal(lil.isEmptyString("x"), official.isEmptyString("x"))
    assert.equal(lil.isPositiveNumber(1), official.isPositiveNumber(1))
    assert.equal(lil.isPositiveNumber(0), official.isPositiveNumber(0))
    assert.equal(lil.isPrimitive(null), official.isPrimitive(null))
    assert.equal(lil.isPrimitive({}), official.isPrimitive({}))
    assert.equal(lil.isBuiltin(new Date("2024-01-01"), "Date"), official.isBuiltin(new Date("2024-01-01"), "Date"))
    assert.equal(lil.isYesLike("yes"), official.isYesLike("yes"))
    assert.equal(lil.isNoLike(0), official.isNoLike(0))
    assert.deepEqual(lil.yesLikeValues, official.yesLikeValues)
    assert.deepEqual(lil.noLikeValues, official.noLikeValues)
    assert.deepEqual(lil.knownUnsafeEditableEvent, official.knownUnsafeEditableEvent)
    assert.equal(lil.isKnownUnsafeEditableEvent("$pageview"), official.isKnownUnsafeEditableEvent("$pageview"))
    assert.equal(lil.isKnownUnsafeEditableEvent("clicked"), official.isKnownUnsafeEditableEvent("clicked"))
    assert.equal(lil.isKnownUnsafeEditableEventProperty("token"), official.isKnownUnsafeEditableEventProperty("token"))
    assert.equal(lil.sanitizeString("ok"), official.sanitizeString("ok"))
    assert.equal(lil.sanitizeString("\uD800"), official.sanitizeString("\uD800"))
    assert.equal(lil.sanitizeString("😀"), official.sanitizeString("😀"))
    assert.equal(lil.removeTrailingSlash("me/wat///"), official.removeTrailingSlash("me/wat///"))
    assert.equal(lil.removeTrailingSlash("/me"), official.removeTrailingSlash("/me"))
    assert.equal(lil.stripUrlHash("https://example.com/path#section"), official.stripUrlHash("https://example.com/path#section"))
    assert.equal(lil.stripUrlHash(undefined), official.stripUrlHash(undefined))
  })
})

describe("bucketed rate limiter", () => {
  it("resolves config and consumes tokens the same way", () => {
    assert.deepEqual(lil.resolveExceptionRateLimiterConfig(), official.resolveExceptionRateLimiterConfig())
    assert.deepEqual(
      lil.resolveExceptionRateLimiterConfig({
        exceptionRateLimiterRefillRate: 5,
        __exceptionRateLimiterRefillRate: 3,
        exceptionRateLimiterBucketSize: 50,
        __exceptionRateLimiterBucketSize: 30,
      }),
      official.resolveExceptionRateLimiterConfig({
        exceptionRateLimiterRefillRate: 5,
        __exceptionRateLimiterRefillRate: 3,
        exceptionRateLimiterBucketSize: 50,
        __exceptionRateLimiterBucketSize: 30,
      }),
    )
    const lilBuckets = {}
    const officialBuckets = {}
    const args = [1000, 1, 3, 1000]
    assert.equal(
      lil.consumeBucketedRateLimit(lilBuckets, "ResizeObserver", ...args),
      official.consumeBucketedRateLimit(officialBuckets, "ResizeObserver", ...args),
    )
    assert.deepEqual(lilBuckets, officialBuckets)
    assert.equal(
      lil.consumeBucketedRateLimit(lilBuckets, "ResizeObserver", ...args),
      official.consumeBucketedRateLimit(officialBuckets, "ResizeObserver", ...args),
    )
    assert.equal(
      lil.consumeBucketedRateLimit(lilBuckets, "ResizeObserver", ...args),
      official.consumeBucketedRateLimit(officialBuckets, "ResizeObserver", ...args),
    )
    assert.equal(
      lil.consumeBucketedRateLimit(lilBuckets, "ResizeObserver", ...args),
      official.consumeBucketedRateLimit(officialBuckets, "ResizeObserver", ...args),
    )
    assert.deepEqual(lilBuckets, officialBuckets)
    assert.equal(
      lil.consumeBucketedRateLimit(lilBuckets, "ResizeObserver", 4000, 1, 3, 1000),
      official.consumeBucketedRateLimit(officialBuckets, "ResizeObserver", 4000, 1, 3, 1000),
    )
    assert.deepEqual(lilBuckets, officialBuckets)
  })
})
