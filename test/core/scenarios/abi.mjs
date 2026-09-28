// The public surface as a caller or an extension bundle sees it: every member of the client
// and of each object reachable from it that is not private under upstream's own contract
// (a `_` name outside rollup.config.mjs's reserved list is mangled in upstream's build),
// with its kind, its function `length` and `name`, and its enumerability.
const TOKEN = "phc_abi_token"
const RESERVED = new Set(("_i __SV _ _url _batchKey _noTruncate _onCapture _noHeatmaps _posthog _instance " +
  "_surveyEventReceiver _surveyManager _addCaptureHook _send_request _onIdentityChanged _onIdentityCleared " +
  "_originatedFromCaptureException _shouldDisableFlags _conversationsManager _conversations _init _dom_loaded " +
  "_execute_array _handle_unload _forceAllowLocalhostNetworkCapture _is_bot __ph_loaded _sessionActivityTimestamp " +
  "_sessionStartTimestamp _sessionTimeoutMs _POSTHOG_REMOTE_CONFIG _overrideSDKInfo _isIdentified " +
  "_calculate_event_properties _kx").split(" "))
const isPublic = (name) => typeof name !== "string" || !name.startsWith("_") || name.startsWith("__") || RESERVED.has(name)

// Own keys in creation order; prototype members as a set (sorted): LilScript has no class
// accessor syntax yet, so a getter sits after the methods on the prototype instead of in its
// declaration position — only reflection over prototype key order can see that.
// Class names are left out: upstream's published build mangles them.
const isClass = (f) => typeof f === "function" && /^class\b/.test(Function.prototype.toString.call(f))
function describeMember(d) {
  const fn = (f) => (typeof f === "function" ? { length: f.length, ...(isClass(f) ? {} : { name: f.name }) } : undefined)
  if (d.get || d.set) return { kind: "accessor", get: fn(d.get), set: fn(d.set), enumerable: d.enumerable }
  if (typeof d.value === "function") return { kind: "function", ...fn(d.value), enumerable: d.enumerable }
  return { kind: typeof d.value, enumerable: d.enumerable }
}
function surface(value) {
  const own = {}, proto = {}, seen = new Set()
  for (let o = value, depth = 0; o && o !== Object.prototype && depth < 4; o = Object.getPrototypeOf(o), depth++) {
    const keys = Reflect.ownKeys(o).filter((k) => typeof k === "string" && k !== "constructor" && !seen.has(k) && isPublic(k))
    for (const key of depth === 0 ? keys : [...keys].sort()) {
      seen.add(key)
      ;(depth === 0 ? own : proto)[key] = describeMember(Object.getOwnPropertyDescriptor(o, key))
    }
  }
  return { own, proto }
}

export const cases = [
  {
    name: "client and reachable objects",
    run: async (sut, env) => {
      const ph = sut.posthog
      env.record("exports", Object.keys(sut).sort().map((k) => [k, typeof sut[k]]))
      env.record("PostHog", { length: sut.PostHog.length, statics: Object.keys(sut.PostHog).filter(isPublic) })
      env.record("before-init", surface(ph))
      ph.init(TOKEN, { api_host: "https://us.i.posthog.com", capture_pageview: false })
      await env.tick(5)
      env.record("client", surface(ph))
      for (const part of ["persistence", "sessionPersistence", "sessionManager", "sessionPropsManager", "requestRouter", "consent", "rateLimiter", "scrollManager", "pageViewManager", "externalIntegrations", "webPerformance", "people"]) {
        env.record(part, ph[part] == null ? { $missing: String(ph[part]) } : surface(ph[part]))
      }
      env.record("config", Object.keys(ph.config))
      env.record("named-instance", surface(ph.init(TOKEN, { persistence: "memory" }, "second")))
    },
  },
]
