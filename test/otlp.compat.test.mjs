import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { describe, it } from "node:test"
import { bundleOfficialOtlp } from "../scripts/official-bundle.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const lilPath = resolve(root, process.env.POSTHOGLIL_OTLP_ARTIFACT ?? ".tmp/otlp.dev.js")
const officialPath = resolve(root, ".tmp/official-otlp.js")
mkdirSync(resolve(root, ".tmp"), { recursive: true })
writeFileSync(officialPath, await bundleOfficialOtlp(root))

const official = await import(pathToFileURL(officialPath).href)
const lil = await import(pathToFileURL(lilPath).href)

function sameCall(name, args = []) {
  const expected = official[name](...args)
  const actual = lil[name](...args)
  assert.deepEqual(actual, expected, name)
  return actual
}

function sameFactory(name, factory, trailingArgs = []) {
  const expected = official[name](factory(), ...trailingArgs)
  const actual = lil[name](factory(), ...trailingArgs)
  assert.deepEqual(actual, expected, name)
  return actual
}

function logger(logs) {
  return {
    debug(...args) {
      logs.push(["debug", ...args])
    },
    info(...args) {
      logs.push(["info", ...args])
    },
    warn(...args) {
      logs.push(["warn", ...args])
    },
    error(...args) {
      logs.push(["error", ...args])
    },
    critical(...args) {
      logs.push(["critical", ...args])
    },
  }
}

function compareFactoryWithLogs(name, factory) {
  const officialLogs = []
  const lilLogs = []
  const expected = official[name](factory(), logger(officialLogs))
  const actual = lil[name](factory(), logger(lilLogs))
  assert.deepEqual(actual, expected, name)
  assert.deepEqual(lilLogs, officialLogs, `${name} logger calls`)
  return actual
}

describe("PostHog pure OTLP logs and metrics compatibility", () => {
  it("exports the exact benchmark surface and severity mapping", () => {
    assert.deepEqual(Object.keys(lil).sort(), Object.keys(official).sort())
    assert.deepEqual(lil.DEFAULT_HISTOGRAM_BOUNDS, official.DEFAULT_HISTOGRAM_BOUNDS)

    for (const level of [
      "trace",
      "debug",
      "info",
      "warn",
      "error",
      "fatal",
      "bogus",
      "",
      undefined,
      null,
      "__proto__",
    ]) {
      sameCall("getOtlpSeverityText", [level])
      sameCall("getOtlpSeverityNumber", [level])
    }
  })

  it("matches AnyValue primitives, exact integers, dates, and string sanitization", () => {
    const values = [
      "hello",
      "ok\ud83d",
      "a\ud800b",
      0,
      -7,
      3.14,
      Number.MAX_SAFE_INTEGER,
      9223372036854774784,
      2 ** 63,
      -(2 ** 63),
      -(2 ** 64),
      1e21,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      true,
      false,
      new Boolean(false),
      1n,
      null,
      undefined,
      Symbol("x"),
      () => 1,
      new Date("2026-08-20T10:00:00.000Z"),
      new Date("invalid"),
    ]
    for (const value of values) sameCall("toOtlpAnyValue", [value])

    compareFactoryWithLogs("toOtlpAnyValue", () => 2 ** 63)
    compareFactoryWithLogs("toOtlpAnyValue", () => ({ nested: { ratio: Number.NaN } }))

    sameFactory("toOtlpAnyValue", () => {
      const broken = new Date("2026-08-20T10:00:00.000Z")
      broken.toISOString = () => ({})
      return broken
    })
    sameFactory("toOtlpAnyValue", () => ({
      toString() {
        throw new Error("cannot stringify")
      },
    }))
  })

  it("matches recursive object, array, toJSON, cycle, and encoder-budget rules", () => {
    const factories = [
      () => [1, "x", true],
      () => {
        const value = [1, , 3]
        return value
      },
      () => [1, null, undefined, 3],
      () => ({ a: 1, b: "two", gone: null, alsoGone: undefined }),
      () => ({ outer: { inner: 1 } }),
      () => ({ handler: () => 1, sym: Symbol("x"), retries: 2 }),
      () => ({ toJSON: () => ({ amount: 5 }) }),
      () => ({
        kept: 1,
        toJSON() {
          throw new Error("nope")
        },
      }),
      () => {
        const shared = { id: 1 }
        return { a: shared, b: shared }
      },
      () => {
        const cyclic = { name: "root" }
        cyclic.self = cyclic
        return cyclic
      },
      () => {
        const cyclic = {}
        cyclic.toJSON = () => ({ inner: cyclic })
        return cyclic
      },
      () => Object.create(null),
    ]
    for (const factory of factories) sameFactory("toOtlpAnyValue", factory)

    sameFactory("toOtlpAnyValue", () => {
      let deep = { end: true }
      for (let index = 0; index < 25; index++) deep = { next: deep }
      return deep
    })

    sameFactory("toOtlpAnyValue", () => {
      const row = {}
      for (let index = 0; index < 20; index++) row[`k${index}`] = index
      return Array.from({ length: 1000 }, () => ({ ...row }))
    })

    const officialLogs = []
    const lilLogs = []
    const makeWide = () => {
      const wide = {}
      for (let index = 0; index < 1500; index++) wide[`k${index}`] = index
      return wide
    }
    const expected = official.toOtlpAnyValue(makeWide(), logger(officialLogs))
    const actual = lil.toOtlpAnyValue(makeWide(), logger(lilLogs))
    assert.deepEqual(actual, expected)
    assert.deepEqual(lilLogs, officialLogs)
  })

  it("matches key/value enumeration, throwing getters, inherited keys, and reserved names", () => {
    const factories = [
      () => ({ a: 1, b: "two", nil: null, missing: undefined }),
      () => {
        const attrs = Object.create({ inherited: "must not leak" })
        attrs.own = 1
        return attrs
      },
      () => {
        const attrs = { ok: 1 }
        Object.defineProperty(attrs, "hidden", { value: 2, enumerable: false })
        Object.defineProperty(attrs, "bad", {
          enumerable: true,
          get() {
            throw new Error("getter failed")
          },
        })
        return attrs
      },
      () => JSON.parse('{"__proto__":{"a":1},"constructor":"literal","key\\ud83d":2}'),
    ]
    for (const factory of factories) sameFactory("toOtlpKeyValueList", factory)
  })

  it("matches log records, resource layering, and OTLP log envelopes", () => {
    const originalNow = Date.now
    Date.now = () => 1_725_000_123_456
    try {
      const options = {
        body: 12345,
        level: "warn",
        attributes: JSON.parse('{"__proto__":{"safe":true},"custom":"yes","count":3}'),
        trace_id: "trace-1",
        span_id: "span-1",
        trace_flags: 0,
      }
      const context = {
        distinctId: "user-1",
        sessionId: "session-1",
        windowId: "window-1",
        sessionStartTimestamp: 123,
        lastActivityTimestamp: 0,
        currentUrl: "https://example.com",
        screenName: "Home",
        appState: "foreground",
        activeFeatureFlags: ["alpha", "beta"],
      }
      const officialLogs = []
      const lilLogs = []
      assert.deepEqual(
        lil.buildOtlpLogRecord(options, context, logger(lilLogs)),
        official.buildOtlpLogRecord(options, context, logger(officialLogs)),
      )
      assert.deepEqual(lilLogs, officialLogs)

      sameFactory("buildOtlpLogRecord", () => ({
        body: {
          toString() {
            throw new Error("boom")
          },
        },
      }), [{}])

      sameFactory("buildOtlpLogRecord", () => {
        const attributes = { ok: 1 }
        Object.defineProperty(attributes, "bad", {
          enumerable: true,
          get() {
            throw new Error("disposed")
          },
        })
        return { body: "x", attributes }
      }, [{}])
    } finally {
      Date.now = originalNow
    }

    const configs = [
      {},
      { serviceName: "web" },
      {
        serviceName: "web",
        serviceVersion: "1.2.3",
        environment: "production",
        resourceAttributes: {
          "service.name": "user-supplied",
          region: "eu",
        },
      },
    ]
    for (const config of configs) {
      const resource = sameCall("buildResourceAttributes", [config, "posthog-js", "1.418.10"])
      sameCall("buildOtlpLogsPayload", [[{ body: { stringValue: "hello" } }], resource, "scope", "1"])
    }
  })

  it("matches pure metrics keys, buckets, config precedence, resources, and envelopes", () => {
    for (const milliseconds of [0, 1, -1, 1.25, 1_725_000_123_456]) {
      sameCall("msToUnixNano", [milliseconds])
    }
    for (const args of [
      ["counter", "requests", undefined, undefined],
      ["histogram", "latency", "ms", { route: "/", method: "GET" }],
      ["gauge", "temperature", "", { z: 1, a: "first", nil: null }],
    ]) {
      sameCall("seriesKey", args)
    }
    for (const value of [-1, 0, 1, 5, 6, 10_000, 10_001, Number.NaN, Number.POSITIVE_INFINITY]) {
      sameCall("bucketIndexFor", [value, official.DEFAULT_HISTOGRAM_BOUNDS])
    }

    const beforeSend = (payload) => payload
    const configs = [
      undefined,
      {},
      { flushIntervalMs: 0, maxSeriesPerFlush: 0 },
      {
        serviceName: "named-service",
        serviceVersion: "named-version",
        environment: "named-environment",
        resourceAttributes: {
          "service.name": "attribute-service",
          "service.version": "attribute-version",
          "deployment.environment": "attribute-environment",
          region: "eu",
        },
        beforeSend,
        flushIntervalMs: 250,
        maxSeriesPerFlush: 12,
      },
      {
        serviceName: "fallback-service",
        resourceAttributes: { "service.name": null },
      },
    ]
    for (const config of configs) {
      const resolved = sameCall("resolveMetricsConfig", [config])
      const resource = sameCall("buildMetricsResourceAttributes", [resolved, "posthog-js", "1.418.10"])
      const metrics = [
        {
          name: "requests",
          sum: {
            dataPoints: [{ asDouble: 2, timeUnixNano: "123000000", attributes: [] }],
            aggregationTemporality: 1,
            isMonotonic: true,
          },
        },
      ]
      sameCall("buildOtlpMetricsPayload", [metrics, resource, "scope", "1"])
    }
  })
})
