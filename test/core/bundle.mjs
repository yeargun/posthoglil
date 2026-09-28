// Build a system under test as an IIFE that sets `window.__sut`.
//   upstream: an adapter in adapters/<name>.ts over the pinned posthog-js sources (vendor/)
//   port:     a LilScript entry compiled by the pinned compiler, then wrapped
import { build } from "esbuild"
import { execFileSync } from "node:child_process"
import { accessSync, constants, existsSync, mkdirSync, statSync } from "node:fs"
import { join, dirname, resolve } from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
export const ROOT = resolve(here, "..", "..")
export const OUT = join(here, "out")
export const vendor = join(ROOT, "vendor", "posthog-js", "packages")
const require = createRequire(import.meta.url)
// posthog-js 1.418.10 depends on fflate ^0.4.8; its browser ESM build is what upstream bundles.
const fflate = join(dirname(require.resolve("fflate/package.json")), "esm", "browser.js")

export function compilerPath() {
  const lilscriptRoot = process.env.LILSCRIPT_ROOT ?? resolve(ROOT, "..", "lilscript")
  for (const candidate of [process.env.LILSCRIPT_COMPILER, resolve(lilscriptRoot, "target", "release", "lilscript")].filter(Boolean)) {
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch {
      // try next
    }
  }
  throw new Error("LilScript compiler not found. Set LILSCRIPT_COMPILER (pin the binary you test).")
}

const sub = (base, s) => { const f = join(base, s + ".ts"); return existsSync(f) ? f : join(base, s, "index.ts") }
export const workspace = {
  name: "posthog-workspace",
  setup(b) {
    b.onResolve({ filter: /^@posthog\/browser-common(?:\/.*)?$/ }, (a) => ({ path: a.path === "@posthog/browser-common" ? join(vendor, "browser-common/src/index.ts") : sub(join(vendor, "browser-common/src"), a.path.slice(24)) }))
    b.onResolve({ filter: /^@posthog\/core$/ }, () => ({ path: join(vendor, "core/src/index.ts") }))
    b.onResolve({ filter: /^@posthog\/core\/(.*)$/ }, (a) => ({ path: sub(join(vendor, "core/src"), a.path.slice(14)) }))
    b.onResolve({ filter: /^@\/(.*)$/ }, (a) => ({ path: sub(join(vendor, "core/src"), a.path.slice(2)) }))
    b.onResolve({ filter: /^@posthog\/types$/ }, () => ({ path: join(vendor, "types/src/index.ts") }))
    b.onResolve({ filter: /^@upstream\/(.*)$/ }, (a) => ({ path: sub(join(vendor, "browser/src"), a.path.slice(10)) }))
    // Upstream's rollup build inlines `packageInfo.version`; bundling the whole package.json
    // object would only add bytes.
    b.onResolve({ filter: /package\.json$/ }, () => ({ path: "pkg", namespace: "pkg" }))
    b.onLoad({ filter: /.*/, namespace: "pkg" }, () => ({ contents: 'export default { version: "1.418.10" }', loader: "js" }))
    b.onResolve({ filter: /^fflate$/ }, () => ({ path: fflate }))
  },
}

export const buildOptions = {
  bundle: true, write: false, platform: "browser", logLevel: "error", plugins: [workspace],
  tsconfigRaw: { compilerOptions: {} }, define: { __BROWSER_COMMON_VERSION__: '"0.5.0"' },
  external: ["preact", "web-vitals", "core-js/*"],
}

async function iife(entryPoints, globalName = "__sut") {
  const r = await build({ ...buildOptions, entryPoints, format: "iife", globalName: "__sut", target: "es2020" })
  return r.outputFiles[0].text + `\nwindow.${globalName} = __sut;\n`
}

// The published bundle itself, wrapped as the harness loads a system under test.
export async function npmSlim() {
  const entry = join(dirname(require.resolve("posthog-js/package.json")), "dist", "module.slim.no-external.js")
  const r = await build({ entryPoints: [entry], bundle: true, format: "iife", globalName: "__sut", write: false, platform: "browser", logLevel: "error" })
  return r.outputFiles[0].text + "\nwindow.__sut = __sut;\n"
}

export async function upstream(adapter, globalName) {
  return iife([join(here, "adapters", adapter + ".ts")], globalName)
}

export async function port(entry, config = "lilscript.core.dev.toml") {
  mkdirSync(OUT, { recursive: true })
  const out = join(OUT, entry.replace(/[\/.]/g, "_") + ".mjs")
  const t0 = Date.now()
  execFileSync(compilerPath(), [join(ROOT, entry), "--target", "js-module", "--config", join(ROOT, config), "-o", out], { stdio: ["ignore", "inherit", "inherit"] })
  const code = await iife([out])
  return { code, ms: Date.now() - t0, bytes: statSync(out).size, file: out }
}
