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
      ".nojekyll",
    ]) {
      assert.equal(existsSync(resolve(site, path)), true, path)
    }
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
    assert.match(html, /If LilScript is larger/)
    assert.doesNotMatch(html, /the full SDK is smaller/)
  })

  it("compares Brotli, gzip, and raw from matching LilScript compiles", () => {
    const html = readFileSync(resolve(site, "index.html"), "utf8")
    assert.match(html, /id="body-brotli"/)
    assert.match(html, /id="body-gzip"/)
    assert.match(html, /id="body-raw"/)
    assert.match(html, /id="body-matched"/)
    const results = JSON.parse(readFileSync(resolve(site, "results.json"), "utf8"))
    const library = results.size.find((lane) => lane.id === "itslil")
    const gzip = results.size.find((lane) => lane.id === "itslil-gzip")
    const bytes = results.size.find((lane) => lane.id === "itslil-bytes")
    const closed = results.size.find((lane) => lane.id === "itslil-closed")
    const oxc = results.size.find((lane) => lane.id === "kernel-oxc-mangle")
    const terser = results.size.find((lane) => lane.id === "kernel-terser-mangle")
    const esbuild = results.size.find((lane) => lane.id === "kernel-esbuild-esnext")
    assert.equal(library.primary, true)
    assert.equal(library.costModel, "brotli")
    assert.equal(gzip.costModel, "gzip")
    assert.equal(bytes.costModel, "raw")
    assert.equal(typeof library.brotli11, "number")
    assert.equal(typeof oxc.brotli11, "number")
    assert.equal(typeof terser.brotli11, "number")
    assert.equal(typeof esbuild.brotli11, "number")
    assert.equal(typeof closed.brotli11, "number")
    assert.equal(results.hero.itslilBrotli, library.brotli11)
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
  })
})
