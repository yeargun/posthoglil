// Runtime benchmark of one SUT (an ESM build exporting `posthog`/`PostHog`) in a plain
// jsdom realm: no recording hooks, network stubbed, real timers.
// node bench.mjs <esm-file> <lane>   -> prints JSON {lane, ms: [...]} per repetition
import { JSDOM } from "jsdom"
import { build } from "esbuild"
import { readFileSync } from "node:fs"
import { performance } from "node:perf_hooks"
const [file, lane] = process.argv.slice(2)
const iife = (await build({ entryPoints: [file], bundle: true, format: "iife", globalName: "__SUT__", write: false, logLevel: "error", minify: false })).outputFiles[0].text
const TOKEN = "phc_bench"
function realm() {
  const dom = new JSDOM("<!doctype html><html><head><title>Bench</title></head><body><p>x</p></body></html>", {
    url: "https://app.example.com/dashboard?utm_source=news&utm_medium=email",
    referrer: "https://www.google.com/search?q=posthog",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  })
  const w = dom.window
  let sent = 0, bytes = 0
  const body = (b) => (b == null ? 0 : typeof b === "string" ? b.length : b.byteLength ?? b.size ?? 0)
  w.fetch = (url, init) => { sent++; bytes += body(init && init.body); return Promise.resolve({ status: 200, ok: true, headers: new w.Headers ? new w.Headers() : new Headers(), json: () => Promise.resolve({}), text: () => Promise.resolve("{}") }) }
  Object.defineProperty(w.navigator, "sendBeacon", { value: (u, b) => { sent++; bytes += body(b); return true }, configurable: true })
  w.console.log = w.console.warn = w.console.error = w.console.info = w.console.debug = () => {}
  w._POSTHOG_REMOTE_CONFIG = { [TOKEN]: { config: { supportedCompression: ["gzip-js", "base64"] } } }
  w.eval(iife)
  return { w, sut: w.__SUT__, stats: () => ({ sent, bytes }) }
}
const props = (i) => ({ plan: "pro", seats: i % 50, path: "/dashboard/" + (i % 20), experiment: i % 2 ? "control" : "test", nested: { a: i, b: "x".repeat(i % 16) }, tags: ["a", "b", "c"].slice(0, (i % 3) + 1) })
const lanes = {
  // 5,000 batched captures into memory persistence, then the unload flush (JSON + gzip).
  "capture-memory": (s) => {
    const ph = s.sut.posthog
    ph.init(TOKEN, { api_host: "https://us.i.posthog.com", rate_limiting: { events_per_second: 1e9, events_burst_limit: 1e9 }, persistence: "memory", capture_pageview: false, capture_pageleave: false, disable_session_recording: true })
    const t0 = performance.now()
    for (let i = 0; i < 5000; i++) ph.capture("bench_event", props(i))
    const t1 = performance.now()
    ph._handle_unload()
    const t2 = performance.now()
    return { capture: t1 - t0, flush: t2 - t1 }
  },
  // 2,000 captures with cookie + localStorage persistence (the default), batched.
  "capture-default": (s) => {
    const ph = s.sut.posthog
    ph.init(TOKEN, { api_host: "https://us.i.posthog.com", rate_limiting: { events_per_second: 1e9, events_burst_limit: 1e9 }, capture_pageview: false, capture_pageleave: false, disable_session_recording: true })
    const t0 = performance.now()
    for (let i = 0; i < 2000; i++) ph.capture("bench_event", props(i))
    const t1 = performance.now()
    ph._handle_unload()
    return { capture: t1 - t0, flush: performance.now() - t1 }
  },
  // 1,000 unbatched captures: each is encoded, compressed and sent on its own.
  "capture-unbatched": (s) => {
    const ph = s.sut.posthog
    ph.init(TOKEN, { api_host: "https://us.i.posthog.com", rate_limiting: { events_per_second: 1e9, events_burst_limit: 1e9 }, persistence: "memory", request_batching: false, capture_pageview: false, capture_pageleave: false, disable_session_recording: true })
    const t0 = performance.now()
    for (let i = 0; i < 1000; i++) ph.capture("bench_event", props(i))
    return { capture: performance.now() - t0 }
  },
  // 200 named instances initialised in one realm (config merge, persistence, session setup).
  "init": (s) => {
    const ph = s.sut.posthog
    const t0 = performance.now()
    for (let i = 0; i < 200; i++) ph.init(TOKEN, { api_host: "https://us.i.posthog.com", rate_limiting: { events_per_second: 1e9, events_burst_limit: 1e9 }, persistence: "localStorage+cookie", capture_pageview: false, disable_session_recording: true }, "inst" + i)
    return { init: performance.now() - t0 }
  },
  // identify / register / people calls, 2,000 rounds on memory persistence.
  "identity": (s) => {
    const ph = s.sut.posthog
    ph.init(TOKEN, { api_host: "https://us.i.posthog.com", rate_limiting: { events_per_second: 1e9, events_burst_limit: 1e9 }, persistence: "memory", capture_pageview: false, disable_session_recording: true })
    const t0 = performance.now()
    for (let i = 0; i < 2000; i++) {
      ph.register({ ["k" + (i % 30)]: i })
      ph.get_distinct_id(); ph.get_session_id(); ph.get_property("k1")
      if (i % 100 === 0) { ph.identify("user-" + i, { email: "u" + i + "@x.com" }); ph.setPersonProperties({ n: i }) }
      if (i % 500 === 0) ph.reset()
    }
    return { identity: performance.now() - t0 }
  },
}
const s = realm()
const out = lanes[lane](s)
out.stats = s.stats()
process.stdout.write(JSON.stringify(out) + "\n")
process.exit(0)
