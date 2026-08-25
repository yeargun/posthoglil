import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { describe, it } from "node:test"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const site = resolve(root, "_site")

describe("github pages artifact", () => {
  it("ships the landing page, both kernels, and results", () => {
    for (const path of [
      "index.html",
      "styles.css",
      "app.js",
      "results.json",
      "posthog.js",
      "posthog-official.js",
      "surveys.js",
      "error-tracking.js",
      "otlp.js",
      "autocapture.js",
      "replay-core.js",
      ".nojekyll",
    ]) {
      assert.equal(existsSync(resolve(site, path)), true, path)
    }
  })

  it("publishes independent exact-source pack measurements", () => {
    const html = readFileSync(resolve(site, "index.html"), "utf8")
    assert.match(html, /id="packs"/)
    assert.match(html, /id="pack-tabs" role="tablist"/)
    assert.match(html, /id="pack-panel" role="tabpanel"/)
    assert.match(html, /id="body-pack-lanes"/)
    assert.match(html, /untouched pinned git submodule/i)
    assert.match(html, /No upstream TypeScript or JavaScript is edited/i)

    const results = JSON.parse(readFileSync(resolve(site, "results.json"), "utf8"))
    assert.equal(results.submoduleCommit, "9b2a1b18db64f9f6b331cbded543c5ead3ccf0cb")
    assert.deepEqual(results.packs.map((pack) => pack.id), [
      "autocapture",
      "replay-core",
      "surveys",
      "error-tracking",
      "otlp",
    ])
    for (const pack of results.packs) {
      const baseline = pack.lanes.find((lane) => lane.baseline)
      const primary = pack.lanes.find((lane) => lane.primary)
      assert.equal(pack.exact, true)
      assert.equal(typeof pack.exports, "number")
      assert.equal(typeof pack.differentialGroups, "number")
      assert.equal(typeof baseline.brotli11, "number")
      assert.equal(typeof primary.brotli11, "number")
      assert.equal(pack.ratios.brotli11, primary.brotli11 / baseline.brotli11)
    }
  })

  it("switches module-specific benchmark receipts with accessible tabs", () => {
    const html = readFileSync(resolve(site, "index.html"), "utf8")
    const app = readFileSync(resolve(site, "app.js"), "utf8")
    assert.match(html, /Pick a module/i)
    assert.match(app, /role="tab"/)
    assert.match(app, /aria-selected/)
    assert.match(app, /ArrowLeft/)
    assert.match(app, /ArrowRight/)
    assert.match(app, /searchParams\.set\("pack"/)
    assert.match(app, /pack\.lanes/)
  })

  it("leads with the larger module wins instead of the narrow kernel result", () => {
    const html = readFileSync(resolve(site, "index.html"), "utf8")
    const app = readFileSync(resolve(site, "app.js"), "utf8")
    assert.match(html, /Web SDK/i)
    assert.match(html, /Autocapture utilities · direct compiler output/i)
    assert.match(html, /The smaller capture kernel remains documented further down/i)
    assert.doesNotMatch(html, /<h1>Capture/)
    assert.match(app, /packResult\("autocapture"\)/)
    assert.match(app, /packResult\("replay-core"\)/)
    assert.match(app, /packResult\("surveys"\)/)
  })

  it("exposes the published package name and fair minify lanes", () => {
    const html = readFileSync(resolve(site, "index.html"), "utf8")
    assert.match(html, /@itslil\/posthog-js/)
    assert.match(html, /Oxc/)
    assert.match(html, /Terser/)
    assert.match(html, /esbuild/)
    assert.match(html, /mangle/)
    assert.match(html, /cost_model/)
    assert.match(html, /extern_fields/)
    assert.match(html, /[Cc]losed LilScript/)
    assert.match(html, /Brotli-11/)
    assert.match(html, /gzip-9/)
    assert.match(html, /not the published/)
    assert.match(html, /losing rows remain/i)
    assert.doesNotMatch(html, /the full SDK is smaller/)
  })

  it("separates direct compiler output from package metadata", () => {
    const html = readFileSync(resolve(site, "index.html"), "utf8")
    assert.match(html, /id="body-brotli"/)
    assert.match(html, /id="body-gzip"/)
    assert.match(html, /id="body-raw"/)
    assert.match(html, /id="body-matched"/)
    const results = JSON.parse(readFileSync(resolve(site, "results.json"), "utf8"))
    const library = results.size.find((lane) => lane.id === "itslil")
    const packaged = results.size.find((lane) => lane.id === "itslil-package")
    const gzip = results.size.find((lane) => lane.id === "itslil-gzip")
    const bytes = results.size.find((lane) => lane.id === "itslil-bytes")
    const closed = results.size.find((lane) => lane.id === "itslil-closed")
    const oxc = results.size.find((lane) => lane.id === "kernel-oxc-mangle")
    const terser = results.size.find((lane) => lane.id === "kernel-terser-mangle")
    const esbuild = results.size.find((lane) => lane.id === "kernel-esbuild-esnext")
    assert.equal(library.primary, true)
    assert.equal(library.costModel, "brotli")
    assert.equal(library.brotli11, 5606)
    assert.equal(packaged.brotli11, 5749)
    assert.equal(packaged.raw - library.raw, 91)
    assert.equal(gzip.costModel, "gzip")
    assert.equal(bytes.costModel, "raw")
    assert.equal(typeof library.brotli11, "number")
    assert.equal(typeof oxc.brotli11, "number")
    assert.equal(typeof terser.brotli11, "number")
    assert.equal(typeof esbuild.brotli11, "number")
    assert.equal(typeof closed.brotli11, "number")
    assert.equal(results.hero.itslilBrotli, library.brotli11)
    assert.equal(results.hero.packageBrotli, packaged.brotli11)
    assert.equal(library.brotli11 < oxc.brotli11, true)
    assert.equal(library.brotli11 < terser.brotli11, true)
    assert.equal(results.hero.itslilGzip, gzip.gzip9)
    assert.equal(results.hero.itslilRaw, bytes.raw)
    assert.equal(results.matched.brotli11, library.brotli11)
    assert.equal(results.matched.gzip9, gzip.gzip9)
    assert.equal(results.matched.raw, bytes.raw)
  })

  it("races the official kernel, not published posthog-js", () => {
    const official = readFileSync(resolve(site, "posthog-official.js"), "utf8")
    assert.match(official, /export/)
    assert.match(official, /uuidv7/)
    assert.match(official, /normalizeFlagsResponse/)
    assert.doesNotMatch(official, /class PostHog/)
    assert.doesNotMatch(official, /autocapture/)
    assert.doesNotMatch(official, /sessionrecording/i)
  })

  it("does not point the playground at the repo-root dist path", () => {
    const app = readFileSync(resolve(site, "app.js"), "utf8")
    assert.match(app, /from ["']\.\/posthog\.js["']/)
    assert.doesNotMatch(app, /\/dist\/posthog/)
    assert.match(app, /21\/21/)
  })
})
