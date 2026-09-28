// Stores, cookie domains, copies and ids over one realm, both sides.
const kinds = ["cookie", "local", "session", "memory", "lpc", "lpc-prefer"]
function op(sut, kind, o, name, value, days, cross, secure) {
  const custom = kind.startsWith("lpc") ? ["custom_key"] : []
  const store = kind.startsWith("lpc") ? "lpc" : kind
  return sut.storeOp(store, custom, kind === "lpc-prefer", o, name, value, days, cross, secure)
}
export const cases = [
  {
    name: "store round trips",
    run: async (sut, env) => {
      for (const kind of kinds) {
        env.record(kind + ".supported", op(sut, kind, "supported"))
        env.record(kind + ".set", op(sut, kind, "set", "ph_tok_posthog", { distinct_id: "abc", $device_id: "dev", $user_state: "anonymous", custom_key: 7, other: "x" }, 365, true, false))
        env.record(kind + ".get", op(sut, kind, "get", "ph_tok_posthog"))
        env.record(kind + ".parse", op(sut, kind, "parse", "ph_tok_posthog"))
        env.record(kind + ".parse-missing", op(sut, kind, "parse", "missing_key"))
        env.record(kind + ".remove", op(sut, kind, "remove", "ph_tok_posthog", undefined, undefined, true))
        env.record(kind + ".after", op(sut, kind, "parse", "ph_tok_posthog"))
        env.record("cookies", env.window.document.cookie)
      }
    },
  },
  {
    name: "cookie wins on conflict",
    env: { url: "https://app.example.com/", cookies: ["ph_tok_posthog=" + encodeURIComponent(JSON.stringify({ distinct_id: "cookie-user", $user_state: "identified" }))], localStorage: { ph_tok_posthog: JSON.stringify({ distinct_id: "local-user", $user_state: "anonymous", $groups: { a: 1 }, $feature_flag_details: {}, __alias: "q", other: 1 }) } },
    run: async (sut, env) => {
      env.record("parse", op(sut, "lpc-prefer", "parse", "ph_tok_posthog"))
      env.record("set", op(sut, "lpc-prefer", "set", "ph_tok_posthog", { distinct_id: "n", $user_state: "identified", custom_key: "" }, 30, false, true))
      env.record("parse2", op(sut, "lpc-prefer", "parse", "ph_tok_posthog"))
      env.record("plain", op(sut, "lpc", "parse", "ph_tok_posthog"))
    },
  },
  {
    name: "utilities",
    run: async (sut, env) => {
      const cyclic = { a: "0123456789", b: [1, "abcdefghij", { c: "x".repeat(20) }] }
      cyclic.self = cyclic
      const shared = { s: "shared-string" }
      env.record("truncate", sut.utilOp("truncate", { cyclic, list: [shared, shared], shared }, 5))
      env.record("truncate-str", sut.utilOp("truncate", "abcdefgh", 3))
      for (const host of ["app.example.com", "foo.herokuapp.com", "bar.vercel.app", "x.netlify.app", "localhost"]) env.record("cross " + host, sut.utilOp("crossDomain", { hostname: host }))
      env.record("cross-none", sut.utilOp("crossDomain", undefined))
      env.record("extend", sut.utilOp("extend", { a: 1 }, { b: undefined, c: 3, a: null }))
      for (const v of [{}, { a: 1 }, [], null, "s", Object.create({ x: 1 })]) env.record("empty", sut.utilOp("emptyObject", v))
      for (const v of ["s", new String("s"), 1, NaN, new Number(2), true, null, [], {}]) {
        env.record("isString", sut.utilOp("isString", v)); env.record("isNumber", sut.utilOp("isNumber", v)); env.record("isObject", sut.utilOp("isObject", v))
      }
      env.record("strip", sut.utilOp("strip", { a: "", b: "x", c: 0, d: null, e: [] }))
      env.record("domain1", sut.utilOp("cookieDomain", "app.example.com", true))
      env.record("domain2", sut.utilOp("cookieDomain", "app.example.com", false))
      sut.utilOp("resetDomain")
      env.record("domain3", sut.utilOp("cookieDomain", "localhost", true))
      env.record("cookie-read", sut.utilOp("cookie", "missing"))
      for (let i = 0; i < 12; i++) env.record("uuid", sut.utilOp("uuid"))
      await env.tick(5)
      env.record("uuid-later", sut.utilOp("uuid"))
      sut.utilOp("log", { x: 1 }, "b")
      sut.utilOp("debug", true)
      sut.utilOp("log", { x: 1 }, "b")
    },
  },
]
