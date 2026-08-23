import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { describe, it } from "node:test"
import { bundleOfficialErrorTracking } from "../scripts/official-bundle.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const lilPath = resolve(
  root,
  process.env.POSTHOGLIL_ERROR_TRACKING_ARTIFACT ?? ".tmp/error-tracking.dev.js",
)
const officialPath = resolve(root, ".tmp/official-error-tracking.js")
mkdirSync(resolve(root, ".tmp"), { recursive: true })
writeFileSync(officialPath, await bundleOfficialErrorTracking(root))

const official = await import(pathToFileURL(officialPath).href)
const lil = await import(pathToFileURL(lilPath).href)

const COERCERS = [
  "DOMExceptionCoercer",
  "ErrorEventCoercer",
  "ErrorCoercer",
  "PromiseRejectionEventCoercer",
  "EventCoercer",
  "ObjectCoercer",
  "StringCoercer",
  "PrimitiveCoercer",
]

function sameCall(name, args = []) {
  const expected = official[name](...args)
  const actual = lil[name](...args)
  assert.deepEqual(actual, expected, name)
  return actual
}

function makeBuilder(api, modifiers = []) {
  return new api.ErrorPropertiesBuilder(
    COERCERS.map((name) => new api[name]()),
    api.createDefaultStackParser(),
    modifiers,
  )
}

function sameBuild(input, hint = {}) {
  const expected = makeBuilder(official).buildFromUnknown(input, hint)
  const actual = makeBuilder(lil).buildFromUnknown(input, hint)
  assert.deepEqual(actual, expected)
  return actual
}

function restoreGlobal(name, descriptor) {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor)
  else delete globalThis[name]
}

describe("@posthog/core/error-tracking compatibility", () => {
  it("exports the complete pinned runtime surface and matching class shapes", () => {
    assert.deepEqual(Object.keys(lil).sort(), Object.keys(official).sort())
    assert.deepEqual(lil.DEFAULT_EXCEPTION_STEPS_CONFIG, official.DEFAULT_EXCEPTION_STEPS_CONFIG)
    assert.deepEqual(lil.EXCEPTION_STEP_INTERNAL_FIELDS, official.EXCEPTION_STEP_INTERNAL_FIELDS)

    const constructors = [
      ...COERCERS,
      "ErrorPropertiesBuilder",
      "ExceptionStepsBuffer",
      "ReduceableCache",
    ]
    for (const name of constructors) {
      assert.equal(lil[name].name, official[name].name, `${name}.name`)
      assert.equal(lil[name].length, official[name].length, `${name}.length`)
      assert.deepEqual(
        Object.getOwnPropertyNames(lil[name].prototype).sort(),
        Object.getOwnPropertyNames(official[name].prototype).sort(),
        `${name}.prototype`,
      )
      assert.deepEqual(Object.keys(lil[name].prototype), Object.keys(official[name].prototype))
      const actualPrototype = Object.getOwnPropertyDescriptor(lil[name], "prototype")
      const expectedPrototype = Object.getOwnPropertyDescriptor(official[name], "prototype")
      assert.deepEqual(
        {
          writable: actualPrototype.writable,
          enumerable: actualPrototype.enumerable,
          configurable: actualPrototype.configurable,
        },
        {
          writable: expectedPrototype.writable,
          enumerable: expectedPrototype.enumerable,
          configurable: expectedPrototype.configurable,
        },
        `${name}.prototype descriptor`,
      )
      for (const method of Object.getOwnPropertyNames(official[name].prototype)) {
        if (method !== "constructor") {
          assert.equal(
            lil[name].prototype[method].length,
            official[name].prototype[method].length,
            `${name}.prototype.${method}.length`,
          )
        }
      }
      assert.throws(() => lil[name](), TypeError)
      assert.throws(() => official[name](), TypeError)
    }
    assert.equal(lil.createStackParser.length, official.createStackParser.length)
  })

  it("matches exception-step configuration, normalization, byte budgets, and mutation", () => {
    const configs = [
      undefined,
      null,
      false,
      {},
      { enabled: false },
      { enabled: 0, max_bytes: 12.9 },
      { enabled: "yes", max_bytes: -1 },
      { max_bytes: Number.NaN },
      { max_bytes: Number.POSITIVE_INFINITY },
      { max_bytes: 0 },
    ]
    for (const config of configs) sameCall("resolveExceptionStepsConfig", [config])

    const properties = {
      $message: "reserved",
      $timestamp: 123,
      keep: true,
      zero: 0,
    }
    sameCall("stripReservedExceptionStepFields", [properties])
    sameCall("stripReservedExceptionStepFields", [undefined])

    for (const value of ["", "plain", "é", "😀", "a\ud800b", "𐍈 and text"]) {
      sameCall("getUtf8ByteLength", [value])
    }

    const makeStep = (message, timestamp = "2026-01-01T00:00:00.000Z", extra = {}) => ({
      $message: message,
      $timestamp: timestamp,
      ...extra,
    })
    const steps = [
      makeStep("one"),
      makeStep("two", 123, { unicode: "😀" }),
      makeStep(""),
      { $message: "missing timestamp" },
      makeStep("three", "2026-01-03T00:00:00.000Z", { nested: { ok: true } }),
    ]
    const budget =
      official.getUtf8ByteLength(JSON.stringify(steps[1])) +
      official.getUtf8ByteLength(JSON.stringify(steps[4]))
    const expected = new official.ExceptionStepsBuffer({ max_bytes: budget })
    const actual = new lil.ExceptionStepsBuffer({ max_bytes: budget })
    for (const step of steps) {
      expected.add(step)
      actual.add(step)
      assert.equal(actual.size(), expected.size())
      assert.deepEqual(actual.getAttachable(), expected.getAttachable())
    }
    actual.setConfig({ max_bytes: 1 })
    expected.setConfig({ max_bytes: 1 })
    assert.deepEqual(actual.getAttachable(), expected.getAttachable())
    actual.clear()
    expected.clear()
    assert.equal(actual.size(), expected.size())

    const cyclic = makeStep("cyclic")
    cyclic.self = cyclic
    actual.add(cyclic)
    expected.add(cyclic)
    assert.deepEqual(actual.getAttachable(), expected.getAttachable())
  })

  it("matches every coercer through recursive ErrorPropertiesBuilder behavior", () => {
    class CustomError extends Error {
      constructor(message, cause) {
        super(message, { cause })
        this.name = "CustomError"
      }
    }
    class ClickEvent extends Event {}

    const synthetic = new Error("synthetic")
    const inputs = [
      null,
      undefined,
      42,
      true,
      Symbol("symbol"),
      "plain string",
      "Uncaught exception: InternalError: still a string",
      { foo: "Foo", bar: "Bar" },
      { name: "TypeError", message: "error-like", stack: "TypeError: error-like\n    at app.js:1:2" },
      { error: new CustomError("nested") },
      new CustomError("wrapped", new CustomError("root cause")),
      new DOMException("dom failed", "InvalidStateError"),
      new ClickEvent("click"),
      new CustomEvent("unhandledrejection", { detail: { reason: new Error("rejected") } }),
      new CustomEvent("unhandledrejection", { detail: { reason: "plain rejection" } }),
    ]

    for (const input of inputs) {
      sameBuild(input, {
        syntheticException: synthetic,
        mechanism: { type: "onerror", handled: false },
        skipFirstLines: 0,
      })
    }

    const noStack = new CustomError("network failure")
    noStack.stack = ""
    sameBuild(noStack, { syntheticException: synthetic })

    let cause = new Error("cause-0")
    for (let index = 1; index < 8; index++) cause = new Error(`cause-${index}`, { cause })
    sameBuild(cause, { syntheticException: synthetic })
  })

  it("matches browser, Gecko, WinJS, Opera, and Node stack parsing", () => {
    const lineCases = {
      chromeStackLineParser: [
        "    at doThing (https://example.com/app.js:10:20)",
        "    at https://example.com/app.js:11:21",
        "    at eval (eval at <anonymous> (https://example.com/app.js:10:5), <anonymous>:1:394)",
        "    at someFn (webkit-masked-url://hidden/:3:4)",
        "not a stack frame",
      ],
      geckoStackLineParser: [
        "doThing@https://example.com/app.js:10:20",
        "@https://example.com/app.js:11:21",
        "eval@https://example.com/app.js line 3 > eval line 1 > eval:1:2",
        "not a stack frame",
      ],
      winjsStackLineParser: [
        "   at doThing (ms-appx://example/app.js:10:20)",
        "   at ms-appx://example/app.js:10",
        "not a stack frame",
      ],
      opera10StackLineParser: [
        "Line 27 of linked script https://example.com/app.js: in function doThing",
        "Line 9 of inline#1 script in https://example.com/page",
        "not a stack frame",
      ],
      opera11StackLineParser: [
        "Error thrown at line 42, column 7 in doThing() in https://example.com/app.js:",
        "Error thrown at line 3, column 2 in <anonymous function: fn>() in https://example.com/a.js:",
        "not a stack frame",
      ],
      nodeStackLineParser: [
        "    at Object.doThing (/workspace/app.js:10:20)",
        "    at async Promise.all (index 3)",
        "    at async Promise.any (index 472)",
        "    at node:internal/process/task_queues:95:5",
        "    at file:///workspace/app.js:3:4",
        "not a stack frame",
      ],
    }

    for (const [name, lines] of Object.entries(lineCases)) {
      const platform = name === "nodeStackLineParser" ? "node:javascript" : "web:javascript"
      for (const line of lines) sameCall(name, [line, platform])
    }

    const stack = [
      "Error: boom",
      "    at inner (https://example.com/app.js:20:4)",
      "    at outer (https://example.com/app.js:10:2)",
      "    at <anonymous>:1:394",
      `(error: ${"x".repeat(1030)})`,
    ].join("\n")
    assert.deepEqual(lil.createDefaultStackParser()(stack), official.createDefaultStackParser()(stack))
    assert.deepEqual(
      lil.createStackParser("node:javascript", lil.nodeStackLineParser)(stack, 1),
      official.createStackParser("node:javascript", official.nodeStackLineParser)(stack, 1),
    )

    const frames = [
      { filename: "a.js", function: "first", lineno: 1 },
      { filename: "", function: "", lineno: 2 },
      { filename: "c.js", function: "third", lineno: 3 },
    ]
    sameCall("reverseAndStripFrames", [frames])
    sameCall("reverseAndStripFrames", [[]])
    sameCall("reverseAndStripFrames", [Array.from({ length: 75 }, (_, i) => ({ filename: `${i}.js` }))])
  })

  it("matches frame modifiers, cache reduction, and injected release lookup", async () => {
    const modifiers = [
      async (frames) => frames.map((frame) => ({ ...frame, first: true })),
      (frames) => frames.slice(0, 1).map((frame) => ({ ...frame, second: true })),
    ]
    const expectedBuilder = makeBuilder(official, modifiers)
    const actualBuilder = makeBuilder(lil, modifiers)
    const exceptionList = [
      { stacktrace: { frames: [{ filename: "a.js" }, { filename: "b.js" }] } },
      { stacktrace: { frames: [{ filename: "c.js" }] } },
      { value: "no frames" },
    ]
    assert.deepEqual(
      await actualBuilder.modifyFrames(structuredClone(exceptionList)),
      await expectedBuilder.modifyFrames(structuredClone(exceptionList)),
    )

    const expectedCache = new official.ReduceableCache(3)
    const actualCache = new lil.ReduceableCache(3)
    for (const [operation, args] of [
      ["set", ["a", 1]],
      ["set", ["b", 2]],
      ["get", ["a"]],
      ["set", ["c", 3]],
      ["reduce", []],
      ["get", ["b"]],
      ["get", ["a"]],
      ["get", ["c"]],
    ]) {
      assert.deepEqual(actualCache[operation](...args), expectedCache[operation](...args), operation)
    }

    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "_posthogReleaseId")
    try {
      for (const release of [undefined, "", 0, "release-2026.08.23"]) {
        globalThis._posthogReleaseId = release
        sameCall("getInjectedReleaseId")
      }
    } finally {
      restoreGlobal("_posthogReleaseId", descriptor)
    }
  })
})
