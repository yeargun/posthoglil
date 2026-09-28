// Seeded random programs against the client: a random config, then a random sequence of
// API calls, clock jumps, page events and network outcomes. Each seed is one case.
const TOKEN = "phc_fuzz_token"
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pick = (r, list) => list[Math.floor(r() * list.length)]
const chance = (r, p) => r() < p

function randomProps(r, depth = 0) {
  const props = {}
  const n = Math.floor(r() * 4)
  for (let i = 0; i < n; i++) {
    const key = pick(r, ["a", "b", "plan", "$set", "$current_url", "token", "nested", "count", "$lib", "email", "list"])
    props[key] = pick(r, [1, 0, -2.5, "x", "", "long".repeat(20), true, false, null, undefined, ["p", 1], depth < 1 ? randomProps(r, depth + 1) : {}])
  }
  return props
}

function randomConfig(r) {
  const c = {}
  if (chance(r, 0.5)) c.api_host = pick(r, ["https://us.i.posthog.com", "https://eu.i.posthog.com", "https://ph.example.com/ingest/", "https://app.posthog.com"])
  if (chance(r, 0.3)) c.persistence = pick(r, ["localStorage", "cookie", "memory", "sessionStorage", "localStorage+cookie"])
  if (chance(r, 0.3)) c.request_batching = chance(r, 0.5)
  if (chance(r, 0.3)) c.capture_pageview = pick(r, [false, true, "history_change"])
  if (chance(r, 0.2)) c.capture_pageleave = pick(r, [false, true, "if_capture_pageview"])
  if (chance(r, 0.2)) c.person_profiles = pick(r, ["always", "identified_only", "never"])
  if (chance(r, 0.2)) c.cookieless_mode = pick(r, ["always", "on_reject"])
  if (chance(r, 0.2)) c.opt_out_capturing_by_default = true
  if (chance(r, 0.15)) c.opt_out_persistence_by_default = true
  if (chance(r, 0.2)) c.disable_compression = true
  if (chance(r, 0.2)) c.defaults = pick(r, ["2025-05-24", "2025-11-30", "2026-01-30", "2026-05-30", "2026-06-25", "2026-08-29", "unset"])
  if (chance(r, 0.15)) c.property_denylist = pick(r, [["$lib", "a"], "notarray"])
  if (chance(r, 0.1)) c.property_blacklist = ["plan"]
  if (chance(r, 0.2)) c.save_referrer = false
  if (chance(r, 0.2)) c.save_campaign_params = false
  if (chance(r, 0.15)) c.cross_subdomain_cookie = chance(r, 0.5)
  if (chance(r, 0.1)) c.secure_cookie = true
  if (chance(r, 0.15)) c.session_idle_timeout_seconds = pick(r, [10, 120, 100000, "x"])
  if (chance(r, 0.15)) c.request_queue_config = { flush_interval_ms: pick(r, [100, 1000, 9000]) }
  if (chance(r, 0.1)) c.mask_personal_data_properties = true
  if (chance(r, 0.1)) c.custom_campaign_params = ["ref"]
  if (chance(r, 0.1)) c.persistence_save_debounce_ms = 250
  if (chance(r, 0.1)) c.split_storage = true
  if (chance(r, 0.1)) c.cookieWinsOnConflict = true
  if (chance(r, 0.1)) c.rate_limiting = { events_per_second: 1, events_burst_limit: 3 }
  if (chance(r, 0.1)) c.bootstrap = { distinctID: pick(r, ["boot-user", "u2"]), isIdentifiedID: chance(r, 0.5) }
  if (chance(r, 0.1)) c.disable_persistence = true
  if (chance(r, 0.1)) c.respect_dnt = true
  if (chance(r, 0.1)) c.before_send = (e) => (e && e.event === "drop" ? null : e)
  if (chance(r, 0.05)) c.sanitize_properties = (p) => ({ ...p, sanitized: 1 })
  if (chance(r, 0.1)) c.opt_out_useragent_filter = true
  if (chance(r, 0.1)) c.custom_blocked_useragents = ["jsdom"]
  if (chance(r, 0.1)) c.internal_or_test_user_hostname = pick(r, ["app.example.com", /example/])
  return c
}

function statusFor(r) {
  return pick(r, [200, 200, 200, 200, 500, 0, 400, 429])
}

const ENV_VARIANTS = {
  default: {},
  xhr: { noFetch: true },
  native: { compressionStream: true },
  nocrypto: { noCrypto: true },
  nobeacon: { noBeacon: true },
  nostorage: { storageThrows: ["local", "session"] },
}

export function makeCase(seed) {
  const r = rng(seed)
  const config = randomConfig(r)
  const steps = 15 + Math.floor(r() * 30)
  const netSeed = Math.floor(r() * 1e9)
  return {
    name: "seed " + seed,
    env: {
      ...(ENV_VARIANTS[process.env.FUZZ_ENV ?? "default"] ?? {}),
      respond: (() => {
        const nr = rng(netSeed)
        return (req) => {
          if (req.url.includes("/array/")) return { status: 200, body: JSON.stringify({ supportedCompression: pick(nr, [["gzip-js"], ["base64"], []]), hasFeatureFlags: false }) }
          const status = statusFor(nr)
          if (status === 0) return { status: 0, body: "", error: "Failed to fetch" }
          if (status === 429 || chance(nr, 0.1)) return { status: 200, body: JSON.stringify({ quota_limited: ["events"] }) }
          return { status, body: status === 200 ? '{"status":1}' : "error" }
        }
      })(),
    },
    run: async (sut, env) => {
      const ph = sut.posthog
      ph.init(TOKEN, { ...config })
      env.record("init", [ph.get_distinct_id() === undefined, ph.is_capturing()])
      for (let i = 0; i < steps; i++) {
        const op = Math.floor(r() * 30)
        try {
          switch (op) {
            case 0: case 1: case 2: env.record("capture", ph.capture(pick(r, ["ev", "drop", "$pageview", "$pageleave", "$set", "survey sent", "product tour shown", "$feature_flag_called"]), randomProps(r), pick(r, [undefined, { send_instantly: true }, { transport: "sendBeacon" }, { $set: { a: 1 }, $set_once: { b: 2 } }, { timestamp: new env.window.Date(1700000000000) }, { skip_client_rate_limiting: true }, { _noTruncate: true }]))); break
            case 3: ph.identify(pick(r, ["user-" + Math.floor(r() * 3), 42, "null", "", undefined]), chance(r, 0.5) ? randomProps(r) : undefined, chance(r, 0.3) ? randomProps(r) : undefined); break
            case 4: env.record("alias", ph.alias(pick(r, ["al-1", "user-0"]))); break
            case 5: ph.register(randomProps(r), pick(r, [undefined, 1, 30])); break
            case 6: ph.register_once(randomProps(r), pick(r, [undefined, "x"])); break
            case 7: ph.register_for_session(randomProps(r)); break
            case 8: ph.unregister(pick(r, ["a", "plan", "b"])); break
            case 9: ph.unregister_for_session(pick(r, ["a", "b"])); break
            case 10: ph.group(pick(r, ["company", "team"]), pick(r, ["acme", "globex"]), chance(r, 0.5) ? randomProps(r) : undefined); break
            case 11: ph.reset(pick(r, [undefined, true, { resetDeviceID: true }, { bootstrap: { distinctID: "b" } }])); break
            case 12: ph.opt_out_capturing(); break
            case 13: ph.opt_in_capturing(pick(r, [undefined, { captureEventName: false }, { captureEventName: "custom_opt_in", captureProperties: { a: 1 } }])); break
            case 14: ph.clear_opt_in_out_capturing(); break
            case 15: ph.set_config(pick(r, [{ debug: true }, { debug: false }, { persistence: "memory" }, { persistence: "cookie" }, { request_batching: false }, { person_profiles: "always" }, { disable_persistence: true }, { disable_persistence: false }, { cookieless_mode: "on_reject" }])); break
            case 16: ph.setPersonProperties(randomProps(r), chance(r, 0.5) ? randomProps(r) : undefined); break
            case 17: ph.unsetPersonProperties(pick(r, ["a", ["a", "b"], []])); break
            case 18: env.record("reads", [ph.get_distinct_id(), ph.get_session_id(), ph.getGroups(), ph.get_property("plan"), ph.getSessionProperty("a"), ph.get_explicit_consent_status(), ph.has_opted_out_capturing(), ph._isIdentified(), ph.getPageViewId(), ph.get_session_replay_url({ withTimestamp: true })]); break
            case 19: await env.tick(pick(r, [1, 50, 999, 3100, 6000])); break
            case 20: await env.tick(pick(r, [31 * 60 * 1000, 25 * 3600 * 1000, 10 * 60 * 1000])); break
            case 21: env.window.dispatchEvent(new env.window.Event(pick(r, ["pagehide", "beforeunload", "online", "offline", "scroll", "resize"]))); break
            case 22: ph.push(pick(r, [["register", { pushed: 1 }], ["capture", "pushed_event"], ["identify", "pushed-user"]])); break
            case 23: env.record("flags", [ph.getFeatureFlag("f"), ph.isFeatureEnabled("f", { defaultValue: true }), ph.getAllFeatureFlags(), ph.getFeatureFlagPayload("f")]); ph.onFeatureFlags((a, b, c) => env.record("onFeatureFlags", [a, b, c])); break
            case 24: ph.getSurveys((s, ctx) => env.record("surveys", [s, ctx])); env.record("canRender", ph.canRenderSurvey("s1")); break
            case 25: env.record("captureException", ph.captureException(new env.window.Error("boom"))); break
            case 26: ph.people.set(pick(r, ["k", { k: 1 }]), "v"); break
            case 27: ph.createPersonProfile(); ph.setInternalOrTestUser(); break
            case 28: ph.startSessionRecording(pick(r, [true, { sampling: true }, undefined])); ph.stopSessionRecording(); break
            case 29: { const unsub = ph.onSessionId((s, w, reason) => env.record("sessionChanged", [typeof s, typeof w, reason])); if (chance(r, 0.5)) unsub(); break }
          }
        } catch (e) {
          env.record("threw", String(e && e.message))
        }
        if (chance(r, 0.3)) await env.settle()
      }
      await env.tick(4000)
      env.window.dispatchEvent(new env.window.Event("pagehide"))
      await env.tick(10)
      env.record("final", [ph.persistence && ph.persistence.props, ph.get_distinct_id()])
    },
  }
}

const SEEDS = (process.env.FUZZ_SEEDS ?? "1-40").split(",").flatMap((part) => {
  const [a, b] = part.split("-").map(Number)
  return Array.from({ length: (b ?? a) - a + 1 }, (_, i) => a + i)
})
export const cases = SEEDS.map(makeCase)
