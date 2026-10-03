// A deterministic browser realm for differential runs: jsdom with a fake clock, seeded
// randomness, and recording hooks on every channel the SDK can affect (cookies, web
// storage, console, XHR, fetch, sendBeacon, event listeners). The system under test is
// evaluated inside the jsdom realm, so its `globalThis` is the window, as in a browser.
import { JSDOM } from "jsdom"
import { gunzipSync, gzipSync } from "node:zlib"
import { createHash } from "node:crypto"

export const START_TIME = 1_750_000_000_000

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Serialise a value for the trace: stable, cycle-safe, shallow for class instances
// (their private fields are implementation, their public behaviour is traced elsewhere).
export function describe(value, depth = 0, seen = new Set()) {
  if (value === undefined) return { $undefined: true }
  if (value === null || typeof value === "boolean" || typeof value === "string") return value
  if (typeof value === "number") return Number.isFinite(value) ? value : { $number: String(value) }
  if (typeof value === "bigint") return { $bigint: String(value) }
  if (typeof value === "function") return { $function: true }
  if (typeof value === "symbol") return { $symbol: String(value) }
  if (seen.has(value)) return { $circular: true }
  const tag = Object.prototype.toString.call(value)
  if (tag === "[object Date]") return { $date: isNaN(value) ? "Invalid" : value.toISOString() }
  if (tag === "[object Error]" || value instanceof Error) return { $error: String(value.name), message: String(value.message) }
  const ctor = value.constructor && value.constructor.name
  if (ctor && ctor !== "Object" && ctor !== "Array" && depth > 0) return { $instance: ctor }
  if (depth > 6) return { $depth: true }
  seen.add(value)
  try {
    if (Array.isArray(value)) return value.map((v) => describe(v, depth + 1, seen))
    const out = {}
    for (const key of Object.keys(value)) out[key] = describe(value[key], depth + 1, seen)
    if (ctor && ctor !== "Object") out.$class = ctor
    return out
  } finally {
    seen.delete(value)
  }
}

export function createEnv(options = {}) {
  const url = options.url ?? "https://app.example.com/dashboard?utm_source=news&utm_medium=email"
  const html = options.html ?? "<!doctype html><html><head><title>Example page</title></head><body><p>hello</p></body></html>"
  const dom = new JSDOM(html, {
    url,
    referrer: options.referrer === "" ? undefined : (options.referrer ?? "https://www.google.com/search?q=posthog"),
    runScripts: "outside-only",
    pretendToBeVisual: true,
  })
  const w = dom.window
  for (const [key, value] of Object.entries(options.navigator ?? {})) {
    Object.defineProperty(w.navigator, key, { get: () => value, configurable: true })
  }
  if (options.screen) for (const [key, value] of Object.entries(options.screen)) Object.defineProperty(w.screen, key, { get: () => value, configurable: true })
  if (options.devicePixelRatio !== undefined) Object.defineProperty(w, "devicePixelRatio", { get: () => options.devicePixelRatio, configurable: true })
  const trace = []
  const log = (kind, data) => trace.push({ t: clock.now - START_TIME, kind, ...data })

  // ---- clock and timers ----
  const clock = { now: START_TIME + (options.startOffset ?? 0), perf: 1000, timers: new Map(), nextId: 1 }
  const RealDate = w.Date
  function FakeDate(...args) {
    if (!new.target) return new RealDate(clock.now).toString()
    return args.length ? new RealDate(...args) : new RealDate(clock.now)
  }
  FakeDate.prototype = RealDate.prototype
  FakeDate.now = () => clock.now
  FakeDate.UTC = RealDate.UTC
  FakeDate.parse = RealDate.parse
  Object.defineProperty(FakeDate, "name", { value: "Date" })
  w.Date = FakeDate
  w.performance.now = () => clock.perf
  const addTimer = (fn, ms, args, repeat) => {
    const id = clock.nextId++
    const delay = Math.max(0, Number(ms) || 0)
    clock.timers.set(id, { at: clock.now + delay, fn, args, repeat: repeat ? Math.max(1, delay) : 0, seq: id })
    log("timer.set", { id, ms: delay, repeat: !!repeat })
    return id
  }
  w.setTimeout = (fn, ms, ...args) => addTimer(fn, ms, args, false)
  w.setInterval = (fn, ms, ...args) => addTimer(fn, ms, args, true)
  w.clearTimeout = w.clearInterval = (id) => {
    if (clock.timers.delete(id)) log("timer.clear", { id })
  }

  // ---- randomness ----
  const random = mulberry32(options.seed ?? 42)
  w.Math.random = random
  const cryptoObj = w.crypto ?? {}
  const getRandomValues = (buffer) => {
    const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(random() * 256)
    log("crypto.getRandomValues", { length: buffer.length })
    return buffer
  }
  if (options.noCrypto) {
    Object.defineProperty(w, "crypto", { value: undefined, configurable: true, writable: true })
  } else {
    try {
      Object.defineProperty(cryptoObj, "getRandomValues", { value: getRandomValues, configurable: true, writable: true })
    } catch {}
  }

  // ---- console ----
  const consoleObj = {}
  for (const level of ["log", "info", "warn", "error", "debug", "trace"]) {
    consoleObj[level] = (...args) => log("console." + level, { args: args.map((a) => describe(a)) })
  }
  w.console = consoleObj

  // ---- cookies ----
  const cookieDesc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Object.getPrototypeOf(w.document)), "cookie")
    ?? Object.getOwnPropertyDescriptor(w.Document.prototype, "cookie")
  Object.defineProperty(w.document, "cookie", {
    configurable: true,
    get() {
      return cookieDesc.get.call(w.document)
    },
    set(value) {
      log("cookie.set", { value: String(value).replace(/expires=[^;]*/, (m) => m) })
      cookieDesc.set.call(w.document, value)
    },
  })

  // ---- web storage ----
  // Hook the prototype: assigning to a Storage instance would only create a key.
  const storageProto = w.Storage.prototype
  const { setItem, removeItem } = storageProto
  const which = (store) => (store === w.localStorage ? "local" : "session")
  storageProto.setItem = function (k, v) { log(which(this) + ".set", { key: String(k), value: String(v) }); return setItem.call(this, k, v) }
  storageProto.removeItem = function (k) { log(which(this) + ".remove", { key: String(k) }); return removeItem.call(this, k) }
  for (const name of options.storageThrows ?? []) {
    Object.defineProperty(w, name + "Storage", { get() { throw new w.DOMException("denied", "SecurityError") }, configurable: true })
  }
  if (options.localStorage) for (const [k, v] of Object.entries(options.localStorage)) w.localStorage.setItem(k, v)
  if (options.sessionStorage) for (const [k, v] of Object.entries(options.sessionStorage)) w.sessionStorage.setItem(k, v)
  if (options.cookies) for (const c of options.cookies) w.document.cookie = c
  trace.length = 0

  // ---- event listeners ----
  for (const [name, target] of [["window", w], ["document", w.document]]) {
    const add = target.addEventListener.bind(target)
    const remove = target.removeEventListener.bind(target)
    target.addEventListener = (type, fn, opts) => { log(name + ".addEventListener", { type, opts: describe(opts) }); return add(type, fn, opts) }
    target.removeEventListener = (type, fn, opts) => { log(name + ".removeEventListener", { type }); return remove(type, fn, opts) }
  }

  // ---- injected scripts (lazy extensions, remote config): recorded, never executed ----
  for (const method of ["appendChild", "insertBefore"]) {
    const original = w.Node.prototype[method]
    w.Node.prototype[method] = function (node, ...rest) {
      if (node && node.tagName === "SCRIPT") log("script.inject", { src: node.src, type: node.type, crossOrigin: node.crossOrigin, async: node.async })
      return original.call(this, node, ...rest)
    }
  }

  // ---- fetch-era globals jsdom lacks ----
  if (!w.Headers) w.Headers = globalThis.Headers
  if (!w.Response) w.Response = globalThis.Response
  if (!w.TextEncoder) w.TextEncoder = globalThis.TextEncoder
  // A CompressionStream that settles on microtasks only (Node's runs zlib on the thread
  // pool, which makes completion order against other events vary between runs).
  if (options.compressionStream) {
    w.CompressionStream = class {
      constructor(format) {
        if (format !== "gzip") throw new w.TypeError("unsupported")
        const chunks = []
        const t = new globalThis.TransformStream({
          transform(chunk) { chunks.push(Buffer.from(chunk)) },
          flush(controller) { controller.enqueue(new Uint8Array(gzipSync(Buffer.concat(chunks)))) },
        })
        this.readable = t.readable
        this.writable = t.writable
      }
    }
  }
  else delete w.CompressionStream

  // ---- network ----
  const responder = options.respond ?? (() => ({ status: 200, body: '{"status":1}' }))
  const decodeBody = async (body) => {
    if (body == null) return { $none: true }
    if (typeof body === "string") return { text: body }
    let bytes
    if (body instanceof w.Blob) {
      bytes = await new Promise((resolve) => {
        const reader = new w.FileReader()
        reader.onload = () => resolve(new Uint8Array(reader.result))
        reader.readAsArrayBuffer(body)
      })
    } else if (body && typeof body.arrayBuffer === "function") bytes = new Uint8Array(await body.arrayBuffer())
    else if (Object.prototype.toString.call(body) === "[object ArrayBuffer]") bytes = new Uint8Array(body)
    else if (ArrayBuffer.isView(body)) bytes = new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
    else return { other: describe(body) }
    const out = { bytes: bytes.length, type: body.type ?? undefined, sha: createHash("sha256").update(bytes).digest("hex").slice(0, 16) }
    try { out.gunzip = gunzipSync(bytes).toString("utf8") } catch { out.raw = Buffer.from(bytes).toString("base64").slice(0, 200) }
    return out
  }
  const pending = []
  class RecordingXHR {
    constructor() { this._headers = {}; this.readyState = 0; this.status = 0; this.responseText = ""; this.withCredentials = false; log("xhr.new", {}) }
    open(method, url, async) { this._method = method; this._url = url; this.readyState = 1 }
    setRequestHeader(k, v) { this._headers[k] = v }
    send(body) {
      const request = { method: this._method, url: this._url, headers: { ...this._headers }, withCredentials: this.withCredentials, timeout: this.timeout }
      pending.push(decodeBody(body).then((decoded) => log("xhr.send", { ...request, body: decoded })))
      const res = responder({ transport: "xhr", ...request })
      const finish = () => {
        this.readyState = 4; this.status = res.status; this.responseText = res.body ?? ""
        this.onreadystatechange?.()
        this.onload?.()
      }
      if (res.delay === "never") return
      w.setTimeout(finish, res.delay ?? 0)
    }
    abort() { log("xhr.abort", { url: this._url }) }
  }
  w.XMLHttpRequest = RecordingXHR
  w.fetch = (input, init = {}) => {
    const request = { url: String(input), method: init.method ?? "GET", headers: describe(init.headers), keepalive: init.keepalive, credentials: init.credentials, cache: init.cache }
    pending.push(decodeBody(init.body).then((decoded) => log("fetch", { ...request, body: decoded })))
    const res = responder({ transport: "fetch", ...request })
    return new w.Promise((resolve, reject) => {
      if (res.delay === "never") return
      w.setTimeout(() => {
        if (res.error) return reject(new w.TypeError(res.error))
        resolve({ status: res.status, ok: res.status >= 200 && res.status < 300, text: () => w.Promise.resolve(res.body ?? ""), json: () => w.Promise.resolve(JSON.parse(res.body ?? "null")) })
      }, res.delay ?? 0)
    })
  }
  if (options.noFetch) delete w.fetch
  w.navigator.sendBeacon = options.noBeacon ? undefined : (url, body) => {
    pending.push(decodeBody(body).then((decoded) => log("beacon", { url: String(url), body: decoded })))
    return options.beaconResult ?? true
  }

  // ---- driving ----
  async function settle() {
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setImmediate(r))
      if (pending.length) await Promise.all(pending.splice(0))
    }
  }
  async function tick(ms) {
    const until = clock.now + ms
    for (;;) {
      let next = null
      for (const [id, t] of clock.timers) if (t.at <= until && (!next || t.at < next[1].at || (t.at === next[1].at && t.seq < next[1].seq))) next = [id, t]
      if (!next) break
      const [id, t] = next
      clock.perf += t.at - clock.now
      clock.now = t.at
      if (t.repeat) { t.at += t.repeat; t.seq = clock.nextId++ } else clock.timers.delete(id)
      log("timer.fire", { id })
      try { typeof t.fn === "function" ? t.fn(...t.args) : null } catch (e) { log("timer.error", { error: describe(e) }) }
      await settle()
    }
    clock.perf += until - clock.now
    clock.now = until
    await settle()
  }
  function load(code) {
    w.eval(code)
    return w.__sut
  }
  function record(kind, value) {
    log(kind, { value: describe(value) })
  }
  return { window: w, dom, trace, clock, tick, settle, load, record, log }
}
