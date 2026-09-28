// Upstream's own extension classes (bundled separately, as dist/extension-bundles.js
// ships) driving the core: every call they make into the client crosses the ABI.
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
const EXT = readFileSync(fileURLToPath(new URL("../out/ext.js", import.meta.url)), "utf8")
const TOKEN = "phc_ext_token"
const flagsBody = (n) => JSON.stringify({
  flags: {
    "beta-feature": { key: "beta-feature", enabled: true, variant: null, reason: { code: "condition_match", condition_index: 0 }, metadata: { id: 1, version: 3, payload: '{"x":1}' } },
    "multi": { key: "multi", enabled: true, variant: n % 2 ? "test" : "control", reason: { code: "condition_match" }, metadata: { id: 2, version: 1 } },
    "off-flag": { key: "off-flag", enabled: false, variant: null, reason: { code: "no_condition_match" }, metadata: { id: 3, version: 1 } },
  },
  errorsWhileComputingFlags: false,
  requestId: "req-" + n,
  evaluatedAt: 1750000000000 + n,
})
function responder() {
  let flagsCalls = 0
  return (req) => {
    if (req.url.includes("/array/")) return { status: 200, body: JSON.stringify({ supportedCompression: ["gzip-js"], hasFeatureFlags: true, autocapture_opt_out: false, heatmaps: true, captureDeadClicks: true, errorTracking: { autocaptureExceptions: true }, siteApps: [] }) }
    if (req.url.includes("/flags/")) return { status: 200, body: flagsBody(++flagsCalls) }
    return { status: 200, body: '{"status":1}' }
  }
}
function loadExtensions(env) {
  env.window.eval(EXT)
  const ext = env.window.__ext
  return { ...ext.FeatureFlagsExtensions, ...ext.AnalyticsExtensions, ...ext.ErrorTrackingExtensions, ...ext.LogsExtensions, ...ext.MetricsExtensions, ...ext.ExperimentsExtensions, ...ext.SiteAppsExtensions, ...ext.TracingExtensions, ...ext.ToolbarExtensions }
}
export const cases = [
  {
    name: "feature flags extension",
    env: { respond: responder() },
    run: async (sut, env) => {
      const ph = sut.posthog
      ph.init(TOKEN, { __extensionClasses: loadExtensions(env), capture_pageview: false })
      ph.onFeatureFlags((flags, variants, ctx) => env.record("onFeatureFlags", [flags, variants, ctx]))
      await env.tick(50)
      env.record("flags", [ph.getFeatureFlag("beta-feature"), ph.getFeatureFlag("multi"), ph.isFeatureEnabled("off-flag"), ph.getFeatureFlagPayload("beta-feature"), ph.getAllFeatureFlags(), ph.getFeatureFlagResult("multi"), ph.flagsEndpointWasHit, ph.decideEndpointWasHit])
      ph.identify("flag-user", { email: "f@x.y" })
      await env.tick(50)
      env.record("after-identify", [ph.getFeatureFlag("multi"), ph.isFeatureEnabled("beta-feature")])
      ph.group("org", "o1", { tier: "gold" })
      ph.setPersonPropertiesForFlags({ plan: "pro" })
      ph.resetPersonPropertiesForFlags()
      ph.updateFlags({ injected: true }, { injected: { a: 1 } }, { merge: true })
      env.record("injected", ph.getFeatureFlag("injected"))
      ph.reloadFeatureFlags()
      await env.tick(3200)
      ph.reset()
      await env.tick(100)
      env.record("after-reset", ph.getFeatureFlag("multi"))
      env.window.dispatchEvent(new env.window.Event("pagehide"))
      await env.tick(10)
    },
  },
  {
    name: "autocapture, heatmaps, dead clicks, exceptions, logs",
    env: { respond: responder(), html: '<!doctype html><html><head><title>Ext</title></head><body><div id="app"><button id="buy" class="btn primary" data-attr="x">Buy now</button><a href="/pricing" id="link">Pricing</a><input type="password" id="pw" value="secret"/></div></body></html>' },
    run: async (sut, env) => {
      const ph = sut.posthog
      ph.init(TOKEN, { __extensionClasses: loadExtensions(env), capture_exceptions: true, request_batching: false })
      await env.tick(600)
      const doc = env.window.document
      for (const id of ["buy", "link", "pw"]) {
        doc.getElementById(id).dispatchEvent(new env.window.MouseEvent("click", { bubbles: true, clientX: 10, clientY: 20 }))
        await env.tick(10)
      }
      doc.getElementById("pw").dispatchEvent(new env.window.Event("change", { bubbles: true }))
      env.record("exception", ph.captureException(new env.window.Error("kaboom"), { extra: 1 }))
      ph.addExceptionStep("step one", { at: 1 })
      ph.captureLog({ body: "hello log", level: "info", attributes: { k: "v" } })
      env.record("logger", typeof ph.logger.info)
      await env.tick(3500)
      env.window.dispatchEvent(new env.window.Event("pagehide"))
      await env.tick(10)
    },
  },
  {
    name: "shutdown and extension teardown",
    env: { respond: responder() },
    run: async (sut, env) => {
      const ph = sut.posthog
      ph.init(TOKEN, { __extensionClasses: loadExtensions(env) })
      await env.tick(100)
      ph.capture("before shutdown")
      env.record("shutdown", await ph.shutdown())
      await env.tick(100)
    },
  },
]
