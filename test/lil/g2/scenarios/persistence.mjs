// PostHogPersistence: every public method over each storage mode, split storage,
// debounced saves and cookie-wins-on-conflict reconciliation.
const base = (extra = {}) => ({
  token: "phc_test+/=token", persistence: "localStorage+cookie", persistence_name: "", cookie_expiration: 365,
  cross_subdomain_cookie: true, secure_cookie: false, disable_persistence: false, cookie_persisted_properties: [],
  custom_campaign_params: [], mask_personal_data_properties: false, custom_personal_data_properties: [], ...extra,
})
function exercise(p, env, label) {
  env.record(label + ".props0", p.props)
  env.record(label + ".register", p.register({ plan: "pro", $groups: { org: "o1" }, n: 1, nested: { a: [1, 2] } }))
  env.record(label + ".register-same", p.register({ plan: "pro", n: 1 }))
  env.record(label + ".register-days", p.register({ temp: "t" }, 7))
  env.record(label + ".register_once", p.register_once({ plan: "free", first: "yes", $initial_person_info: { r: "x" } }, undefined))
  env.record(label + ".register_once-default", p.register_once({ plan: "enterprise" }, "pro"))
  env.record(label + ".register-nonobject", p.register("nope"))
  p.set_property("$user_state", "identified")
  p.set_property("$feature_flag_details", { f: { enabled: true } })
  p.set_property("$feature_flag_request_id", "req-1")
  p.set_property("$surveys", [{ id: "s1" }])
  p.set_property("$sesid", [1, "sid", 2])
  p.set_property("$replay_sample_rate", null)
  env.record(label + ".properties", p.properties())
  env.record(label + ".get", [p.get_property("plan"), p.get_property("missing")])
  p.unregister("temp")
  p.unregister(["first", "not-there"])
  env.record(label + ".after-unregister", p.props)
  p.set_event_timer("ev", 12345)
  env.record(label + ".timer", [p.remove_event_timer("ev"), p.remove_event_timer("ev")])
  p.update_campaign_params(); p.update_campaign_params()
  p.update_search_keyword()
  p.update_referrer_info()
  p.set_initial_person_info()
  env.record(label + ".initial", p.get_initial_props())
  env.record(label + ".safe_merge", p.safe_merge({ plan: "override", fresh: 1 }))
  env.record(label + ".disabled", p.isDisabled())
}
export const cases = [
  ...["localStorage+cookie", "localStorage", "cookie", "memory", "sessionStorage", "LOCALSTORAGE", "bogus"].map((mode) => ({
    name: "mode " + mode,
    env: { url: "https://app.example.com/pricing?utm_source=twitter&gclid=g1", referrer: "https://www.google.com/search?q=posthog" },
    run: async (sut, env) => {
      const config = base({ persistence: mode, debug: mode === "cookie" })
      const p = sut.newPersistence(config, false, true)
      exercise(p, env, mode)
      env.record("config-after", config.persistence)
      p.clear()
      env.record("cleared", p.props)
      const q = sut.newPersistence(base({ persistence: mode }), false, true)
      env.record("reloaded", q.props)
    },
  })),
  {
    name: "split storage and debounce",
    run: async (sut, env) => {
      const config = base({ split_storage: true, persistence_save_debounce_ms: 250 })
      const p = sut.newPersistence(config, false, true)
      exercise(p, env, "split")
      await env.tick(100)
      p.set_property("$active_feature_flags", ["a"])
      await env.tick(300)
      p.flush()
      p.set_property("$surveys_loaded_at", 5)
      p.save()
      await env.tick(300)
      const q = sut.newPersistence(base({ split_storage: true }), false, true)
      env.record("split-reload", q.props)
      q.refreshKey("$surveys")
      q.refreshKey("plan")
      q.refreshKey("nope")
      env.record("refreshed", q.props)
      env.window.dispatchEvent(new env.window.Event("pagehide"))
      q.remove({ keepGroupEntries: true })
      q.remove()
    },
  },
  {
    name: "config updates",
    run: async (sut, env) => {
      const config = base()
      const p = sut.newPersistence(config, false, true)
      p.register({ distinct_id: "d1", $device_id: "d1", other: 2 })
      const next = { ...config, persistence: "cookie" }
      p.update_config(next, config, false)
      env.record("to-cookie", p.props)
      const next2 = { ...next, persistence: "memory", cookie_persisted_properties: ["other"] }
      p.update_config(next2, next, false)
      const next3 = { ...next2, persistence: "localStorage+cookie", cross_subdomain_cookie: false, secure_cookie: true, cookie_expiration: 30 }
      p.update_config(next3, next2, false)
      p.update_config(next3, next3, true)
      env.record("disabled", [p.isDisabled(), p.props])
      p.update_config(next3, next3, false)
      p.set_disabled(true); p.set_disabled(false)
      p.set_cross_subdomain(true); p.set_secure(false)
      const sessionSibling = sut.newPersistence({ ...next3, persistence: "sessionStorage" }, false, false)
      sessionSibling.register({ s: 1 })
      env.record("sibling", sessionSibling.props)
    },
  },
  {
    name: "cookie wins on conflict",
    env: {
      cookies: ["ph_phc_test+/=token_posthog=" + encodeURIComponent(JSON.stringify({ distinct_id: "other-tab", $device_id: "dev0", $user_state: "identified" }))],
      localStorage: { "ph_phc_testPLSLEQtoken_posthog": JSON.stringify({ distinct_id: "me", $device_id: "dev0", $user_state: "anonymous", $feature_flag_details: { x: 1 }, $groups: { g: 1 }, keep: 1 }), "ph_phc_testPLSLEQtoken_posthog__flags": JSON.stringify({ $feature_flag_details: { x: 1 } }) },
    },
    run: async (sut, env) => {
      const config = base({ cookieWinsOnConflict: true, split_storage: true })
      const p = sut.newPersistence(config, false, true)
      env.record("loaded", p.props)
      env.record("consume", [p.consumeCookieIdentityChange(), p.consumeCookieIdentityChange()])
      env.record("sync-noop", p.syncCookieProperties())
      env.window.document.cookie = "ph_phc_testPLSLEQtoken_posthog=" + encodeURIComponent(JSON.stringify({ distinct_id: "third", $user_state: "anonymous", $sesid: "" })) + "; path=/"
      env.record("sync", p.syncCookieProperties())
      env.record("after-sync", p.props)
      env.record("begin", sut.suppressionOp(p, "begin"))
      p.register({ during: 1 })
      sut.suppressionOp(p, "publish")
      sut.suppressionOp(p, "end", false)
      env.record("begin2", sut.suppressionOp(p, "begin", true))
      sut.suppressionOp(p, "end")
      const cfg2 = { ...config, cookieWinsOnConflict: false }
      p.update_config(cfg2, config, false)
      p.update_config(config, cfg2, false)
      env.record("final", p.props)
    },
  },
]
