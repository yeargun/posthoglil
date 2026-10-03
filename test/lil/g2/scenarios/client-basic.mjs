// The client end to end: init, the first pageview, captures, identity, super
// properties, batching and flush, unload.
const TOKEN = "phc_test_token_123"
const respond = (req) => {
  if (req.url.includes("/array/")) return { status: 200, body: JSON.stringify({ supportedCompression: ["gzip-js", "base64"], hasFeatureFlags: false, analytics: { endpoint: "/i/v0/e/" } }) }
  return { status: 200, body: '{"status":1}' }
}
export const env = { respond }
export const cases = [
  {
    name: "init, pageview, captures and flush",
    run: async (sut, env) => {
      const ph = sut.posthog
      env.record("exports", Object.keys(sut).sort())
      env.record("loaded-before", ph.__loaded)
      const loaded = []
      const result = ph.init(TOKEN, { api_host: "https://eu.i.posthog.com", loaded: (p) => loaded.push(p === ph) })
      env.record("init-returns-self", result === ph)
      env.record("loaded-cb", loaded)
      env.record("config-keys", Object.keys(ph.config))
      env.record("distinct", ph.get_distinct_id())
      await env.tick(5)
      env.record("capture", ph.capture("button clicked", { color: "blue", nested: { a: [1, 2, "x".repeat(10)] } }))
      ph.register({ plan: "pro" })
      ph.register_once({ first_seen: "today" })
      ph.capture("second", { n: 2 })
      await env.tick(3100)
      env.record("props", ph.persistence.props)
      env.record("session", ph.get_session_id())
      env.record("replay-url", ph.get_session_replay_url())
      env.record("pageview-id", ph.getPageViewId())
      env.window.dispatchEvent(new env.window.Event("pagehide"))
      await env.tick(10)
    },
  },
  {
    name: "identify, alias, groups, person properties, reset",
    run: async (sut, env) => {
      const ph = sut.posthog
      ph.init(TOKEN, { request_batching: false, capture_pageview: false })
      await env.tick(5)
      ph.identify("user-1", { email: "a@b.c" }, { signup: "2020" })
      ph.setPersonProperties({ email: "a@b.c" }, { signup: "2020" })
      ph.setPersonProperties({ email: "a@b.c" }, { signup: "2020" })
      ph.people.set("name", "Ann")
      ph.people.set_once({ x: 1 })
      ph.unsetPersonProperties(["name", "", 5])
      ph.group("company", "acme", { size: 10 })
      ph.group("company", "acme")
      env.record("groups", ph.getGroups())
      env.record("alias", ph.alias("alias-1"))
      env.record("alias-self", ph.alias(ph.get_distinct_id()))
      ph.identify("distinct_id")
      ph.identify("")
      ph.identify(12345)
      ph.createPersonProfile()
      ph.captureTraceFeedback(7, "good")
      ph.captureTraceMetric("t", "score", 0.5)
      ph.resetGroups()
      ph.reset()
      env.record("after-reset", [ph.get_distinct_id() !== "user-1", ph.persistence.props.$user_state])
      ph.reset(true)
      await env.tick(20)
    },
  },
  {
    name: "config, debug, consent, denylist, before_send",
    run: async (sut, env) => {
      const ph = sut.posthog
      ph.init(TOKEN, {
        property_denylist: ["$lib"], property_blacklist: ["$os"], request_batching: false, capture_pageview: false,
        before_send: [(e) => { e.properties.touched = true; return e }, (e) => (e.event === "drop me" ? null : e)],
      })
      await env.tick(5)
      ph.capture("keep me", { a: 1 })
      ph.capture("drop me")
      ph.capture(undefined)
      ph.capture("x", { $current_url: 5 })
      ph.debug(true)
      ph.capture("debugged", { d: true })
      ph.debug(false)
      ph.set_config({ persistence: "memory", person_profiles: "never" })
      ph.identify("nope")
      ph.opt_out_capturing()
      env.record("opted-out", [ph.has_opted_out_capturing(), ph.is_capturing(), ph.get_explicit_consent_status()])
      ph.capture("while out")
      ph.opt_in_capturing({ captureProperties: { via: "test" } })
      env.record("opted-in", [ph.has_opted_in_capturing(), ph.get_explicit_consent_status()])
      ph.clear_opt_in_out_capturing()
      env.record("cleared", ph.get_explicit_consent_status())
      env.record("toString", String(ph))
      await env.tick(20)
    },
  },
]
