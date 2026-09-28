// Like-for-like size bars for the core: the pinned slim source graph (the port's scope,
// `module.slim.no-external.es.ts`) bundled by esbuild, then minified by each tool, measured
// with lilscript-codec next to the port's artifact(s) given as arguments.
//   node test/core/bars.mjs <port.mjs> [more files...]
// SWC is measured when @swc/core resolves (SWC_CORE=<path> to point at an install).
import { build, transform } from "esbuild"
import { minify as terser } from "terser"
import { createRequire } from "node:module"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { join } from "node:path"
import { OUT, ROOT, vendor, buildOptions } from "./bundle.mjs"
import { codecPath } from "../../scripts/codec.mjs"
const require = createRequire(import.meta.url)
const r = await build({ ...buildOptions, entryPoints: [join(vendor, "browser/src/entrypoints/module.slim.no-external.es.ts")], format: "esm", target: "esnext" })
const source = r.outputFiles[0].text
// upstream's own terser settings and private-property reserved list (rollup.config.mjs)
const rollupText = readFileSync(join(vendor, "browser/rollup.config.mjs"), "utf8")
const start = rollupText.indexOf("[", rollupText.indexOf("reserved:", rollupText.indexOf("regex: /^_(?!_)/")))
let depth = 0, end = start
for (; end < rollupText.length; end++) { if (rollupText[end] === "[") depth++; else if (rollupText[end] === "]" && --depth === 0) break }
const reserved = [...rollupText.slice(start, end).replace(/\/\/.*$/gm, "").matchAll(/'([^']+)'/g)].map((m) => m[1])
  .concat(require(join(vendor, "browser/terser-cross-bundle-properties.cjs")).crossBundlePrivateProperties)
const upstreamCompress = { ecma: 2020, passes: 2, pure_getters: true, unsafe_methods: true, unsafe_comps: true, unsafe_math: true, unsafe_proto: true, unsafe_regexp: true }
const out = {}
const vite = await import("vite")
out["oxc"] = (await vite.minify("slim.js", source, { module: true, compress: true, mangle: true, codegen: { removeWhitespace: true, legalComments: "none" }, sourcemap: false })).code
out["terser-3pass"] = (await terser(source, { module: true, compress: { passes: 3 }, mangle: true, format: { comments: false } })).code
out["terser-upstream-settings"] = (await terser(source, { module: true, compress: upstreamCompress, mangle: { reserved: ["$"] }, format: { comments: false } })).code
out["terser-upstream-settings-private-props"] = (await terser(source, { module: true, compress: upstreamCompress, mangle: { reserved: ["$"], properties: { regex: /^_(?!_)/, reserved } }, format: { comments: false } })).code
out["esbuild"] = (await transform(source, { loader: "js", format: "esm", target: "esnext", minify: true, legalComments: "none" })).code
try {
  const swc = require(process.env.SWC_CORE ?? "@swc/core")
  out["swc"] = (await swc.minify(source, { module: true, compress: { passes: 2 }, mangle: true, format: { comments: false } })).code
} catch {
  console.log("(SWC not installed; set SWC_CORE to an @swc/core directory to include it)")
}
mkdirSync(OUT, { recursive: true })
const files = []
for (const [k, v] of Object.entries(out)) { const f = join(OUT, `bar-${k}.js`); writeFileSync(f, v); files.push(f) }
const m = JSON.parse(execFileSync(codecPath(), ["--json", ...files, ...process.argv.slice(2)], { encoding: "utf8", maxBuffer: 1 << 26 }))
console.log("artifact".padEnd(44), "raw".padStart(8), "gzip-9".padStart(8), "brotli-11".padStart(10))
for (const a of m.artifacts) console.log(a.path.split("/").pop().padEnd(44), String(a.raw).padStart(8), String(a.gzip9).padStart(8), String(a.brotli11).padStart(10))
