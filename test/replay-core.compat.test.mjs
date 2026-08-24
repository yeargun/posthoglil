import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"
import { bundleOfficialReplayCore } from "../scripts/official-bundle.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const lilPath = resolve(root, process.env.POSTHOGLIL_REPLAY_CORE_ARTIFACT ?? ".tmp/replay-core.dev.js")
const officialPath = resolve(root, ".tmp/official-replay-core.js")

function anchor() {
  const value = {}
  Object.defineProperty(value, "href", {
    set(input) {
      const parsed = new URL(input, "https://app.example.test/")
      this.pathname = parsed.pathname
      this.hostname = parsed.hostname
      this.protocol = parsed.protocol
      this._href = parsed.href
    },
    get() {
      return this._href
    },
  })
  return value
}

globalThis.window = { location: { href: "https://app.example.test/" } }
globalThis.document = { createElement: (tag) => (tag === "a" ? anchor() : undefined) }

mkdirSync(resolve(root, ".tmp"), { recursive: true })
writeFileSync(officialPath, await bundleOfficialReplayCore(root))
const official = await import(`${pathToFileURL(officialPath).href}?official-replay`)
const lil = await import(`${pathToFileURL(lilPath).href}?lil-replay`)

function same(name, args) {
  const expected = official[name](...args)
  const actual = lil[name](...args)
  assert.deepEqual(actual, expected, name)
  return actual
}

function withoutFunctions(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item !== "function"))
}

function options(config = {}, remote = {}, endpoint) {
  return {
    official: official.buildNetworkRequestOptions(structuredClone(config), structuredClone(remote), endpoint),
    lil: lil.buildNetworkRequestOptions(structuredClone(config), structuredClone(remote), endpoint),
  }
}

describe("browser replay core compatibility", () => {
  it("exports the complete two-module surface, constants, and defaults", () => {
    assert.deepEqual(Object.keys(lil).sort(), Object.keys(official).sort())
    for (const name of [
      "CONSOLE_LOG_PLUGIN_NAME",
      "FULL_SNAPSHOT_EVENT_TYPE",
      "INCREMENTAL_SNAPSHOT_EVENT_TYPE",
      "MAX_MESSAGE_SIZE",
      "MAX_PAYLOAD_SIZE_BYTES",
      "META_EVENT_TYPE",
      "MUTATION_SOURCE_TYPE",
      "PLUGIN_EVENT_TYPE",
      "SEVEN_MEGABYTES",
      "replacementImageURI",
    ]) {
      assert.equal(lil[name], official[name], name)
    }
    assert.deepEqual(withoutFunctions(lil.defaultNetworkOptions), withoutFunctions(official.defaultNetworkOptions))
    assert.deepEqual(lil.defaultNetworkOptions.maskRequestFn({ name: "x" }), { name: "x" })
    for (const value of [undefined, null, 0, 100, 999999, 1000000, 2000000]) {
      same("effectivePayloadLimitBytes", [{ payloadSizeLimitBytes: value }])
    }
  })

  it("matches circular serialization and UTF-8 size estimation", () => {
    const direct = { text: "hello 🌍", nested: { ok: true }, list: [1, "two", null] }
    same("estimateSize", [direct])
    same("estimateSize", [undefined])
    same("estimateSize", ["é"])
    const officialCycle = { name: "root", child: {} }
    officialCycle.child.parent = officialCycle
    const lilCycle = { name: "root", child: {} }
    lilCycle.child.parent = lilCycle
    assert.equal(official.estimateSize(officialCycle), lil.estimateSize(lilCycle))
    assert.equal(
      JSON.stringify(lilCycle, lil.circularReferenceReplacer()),
      JSON.stringify(officialCycle, official.circularReferenceReplacer()),
    )
  })

  it("matches compressed-event estimates and oversized data-URI replacement", () => {
    for (const value of [
      null,
      undefined,
      true,
      false,
      0,
      -12.5,
      "abc",
      [1, undefined, null, "x"],
      { a: 1, missing: undefined, nested: { ok: true } },
      () => {},
    ]) {
      same("estimateCompressedEventSize", [value])
    }
    same("ensureMaxMessageSize", [{ type: 2, data: { text: "small" } }])
    const largeImage = { type: 2, data: { src: `data:image/png;base64,${"a".repeat(5_100_000)}` } }
    assert.deepEqual(lil.ensureMaxMessageSize(largeImage), official.ensureMaxMessageSize(largeImage))
    const largeBinary = { type: 2, data: { src: `data:application/octet-stream;base64,${"b".repeat(5_100_000)}` } }
    assert.deepEqual(lil.ensureMaxMessageSize(largeBinary), official.ensureMaxMessageSize(largeBinary))
  })

  it("matches console truncation and recursive buffer splitting", () => {
    const events = [
      { type: 1, data: {} },
      { type: 6, data: { plugin: "other", payload: { payload: ["x"] } } },
      {
        type: 6,
        data: {
          plugin: "rrweb/console@1",
          payload: { payload: ["a".repeat(2100), null, ...Array.from({ length: 11 }, (_, i) => `line-${i}`)] },
        },
      },
    ]
    for (const event of events) {
      const expectedInput = structuredClone(event)
      const actualInput = structuredClone(event)
      assert.deepEqual(lil.truncateLargeConsoleLogs(actualInput), official.truncateLargeConsoleLogs(expectedInput))
      assert.deepEqual(actualInput, expectedInput)
    }
    for (const buffer of [
      { size: 3, data: ["a"], sizes: [3], sessionId: "s", windowId: "w" },
      { size: 12, data: ["a", "b", "c", "d"], sizes: [3, 3, 3, 3], sessionId: "s", windowId: "w" },
      { size: 13, data: ["a", "b", "c"], sizes: [3, 4, 6], sessionId: "s", windowId: "w" },
    ]) {
      same("splitBuffer", [buffer, 6])
    }
  })

  it("matches default network cleaning, endpoint suppression, and recording gates", () => {
    const config = {
      api_host: "https://us.i.posthog.com",
      capture_performance: true,
      session_recording: { recordHeaders: true, recordBody: true, streamNetworkBody: true },
    }
    const remote = {
      recordHeaders: true,
      recordBody: true,
      recordPerformance: true,
      payloadHostDenyList: ["private.example"],
    }
    const built = options(config, remote)
    assert.deepEqual(withoutFunctions(built.lil), withoutFunctions(built.official))

    const requests = [
      {
        name: "https://api.example.test/users",
        requestHeaders: { Authorization: "Bearer secret", "x-custom-token": "x", accept: "json" },
        responseHeaders: { "set-cookie": "sid=x", "content-type": "json" },
        requestBody: '{"name":"Ada"}',
        responseBody: '{"ok":true}',
      },
      { name: "https://us.i.posthog.com/e/?ip=1", requestBody: "event" },
      { name: "https://api.example.test/login", requestBody: "password=hunter2" },
      {
        name: "https://api.example.test/upload",
        requestHeaders: { "content-length": "1000001" },
        requestBody: "x",
      },
    ]
    for (const request of requests) {
      assert.deepEqual(
        built.lil.maskRequestFn(structuredClone(request)),
        built.official.maskRequestFn(structuredClone(request)),
      )
    }
    const endpoint = (url) => url.includes("internal-ingest")
    const withEndpoint = options(config, remote, endpoint)
    const request = { name: "https://example.test/internal-ingest", requestBody: "x" }
    assert.deepEqual(
      withEndpoint.lil.maskRequestFn(structuredClone(request)),
      withEndpoint.official.maskRequestFn(structuredClone(request)),
    )

    const disabled = options(
      { api_host: "/ingest", capture_performance: false, session_recording: { recordHeaders: false, recordBody: false } },
      remote,
    )
    assert.deepEqual(withoutFunctions(disabled.lil), withoutFunctions(disabled.official))
  })

  it("matches custom and deprecated mask callbacks, including initial-entry fallback", () => {
    const makeConfig = (mask) => ({
      api_host: "https://us.i.posthog.com",
      session_recording: { maskCapturedNetworkRequestFn: mask },
    })
    const remote = { recordHeaders: true, recordBody: true, recordPerformance: true }
    const officialBuilt = official.buildNetworkRequestOptions(makeConfig(() => null), remote)
    const lilBuilt = lil.buildNetworkRequestOptions(makeConfig(() => null), remote)
    const initial = {
      name: "https://api.example.test/customer?q=private",
      entryType: "resource",
      startTime: 1,
      duration: 2,
      endTime: 3,
      timeOrigin: 4,
      timestamp: 5,
      isInitial: true,
      serverTiming: [{ name: "private" }],
      requestBody: "secret",
    }
    const expected = officialBuilt.maskRequestFn(structuredClone(initial))
    const actual = lilBuilt.maskRequestFn(structuredClone(initial))
    assert.deepEqual(actual, expected)
    assert.equal(official.isInitialMaskFallback(expected), true)
    assert.equal(lil.isInitialMaskFallback(actual), true)
    assert.equal(lil.isInitialMaskFallback(structuredClone(actual)), false)

    const deprecated = (request) => (request.url.includes("drop") ? null : { url: request.url.replace("private", "masked") })
    const officialConfig = { api_host: "https://us.i.posthog.com", session_recording: { maskNetworkRequestFn: deprecated } }
    const lilConfig = { api_host: "https://us.i.posthog.com", session_recording: { maskNetworkRequestFn: deprecated } }
    const officialDeprecated = official.buildNetworkRequestOptions(officialConfig, remote)
    const lilDeprecated = lil.buildNetworkRequestOptions(lilConfig, remote)
    for (const request of [
      { name: "https://private.example/path" },
      { name: "https://drop.example/path" },
      { name: "https://drop.example/path", isInitial: true, entryType: "resource" },
    ]) {
      assert.deepEqual(
        lilDeprecated.maskRequestFn(structuredClone(request)),
        officialDeprecated.maskRequestFn(structuredClone(request)),
      )
    }
  })
})
