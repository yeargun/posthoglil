import { copyFileSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { measureFile } from "./codec.mjs"
import { minifyLanes } from "./minify-lanes.mjs"
import { bundleOfficialKernel } from "./official-bundle.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const lilPath = join(root, "dist/posthog.raw.js")
const packagePath = join(root, "dist/posthog.esm.js")
const closedPath = join(root, "dist/posthog.closed.js")
const gzipPath = join(root, "dist/posthog.gzip.js")
const bytesPath = join(root, "dist/posthog.bytes.js")
const lanesDir = join(root, ".tmp", "lanes")
const officialPath = join(root, ".tmp", "official-kernel.js")

mkdirSync(lanesDir, { recursive: true })
mkdirSync(join(root, ".tmp"), { recursive: true })

const officialSource = await bundleOfficialKernel(root)
writeFileSync(officialPath, officialSource)
const officialMinified = await minifyLanes(officialSource, "posthog.kernel.js")

const artifacts = [
  {
    id: "kernel",
    name: "Official kernel",
    note: "posthog-js@1.418.10 UUID, flags, cookie, router, rate-limit, queue, bot, string, number, type, JSON, URL, and bucketed-limiter algorithms — esbuild bundle, no minify",
    sourcePath: officialPath,
  },
  {
    id: "kernel-oxc-mangle",
    name: "Official · Vite 8 Oxc mangle on",
    note: "Vite 8 Oxc minify of the same official kernel, mangle: true",
    code: officialMinified["oxc-mangle"],
    baseline: true,
  },
  {
    id: "kernel-oxc-nomangle",
    name: "Official · Vite 8 Oxc mangle off",
    note: "Vite 8 Oxc minify, mangle: false",
    code: officialMinified["oxc-nomangle"],
  },
  {
    id: "kernel-terser-mangle",
    name: "Official · Terser mangle on · 3 passes",
    note: "Terser compress passes=3, mangle: true",
    code: officialMinified["terser-mangle"],
  },
  {
    id: "kernel-terser-nomangle",
    name: "Official · Terser mangle off · 3 passes",
    note: "Terser compress passes=3, mangle: false",
    code: officialMinified["terser-nomangle"],
  },
  {
    id: "kernel-terser-passes-1",
    name: "Official · Terser mangle on · 1 pass",
    note: "Terser compress passes=1, mangle: true",
    code: officialMinified["terser-passes-1"],
  },
  {
    id: "kernel-esbuild-esnext",
    name: "Official · esbuild minify esnext",
    note: "esbuild minify:true, target:esnext, format:esm",
    code: officialMinified["esbuild-esnext"],
  },
  {
    id: "kernel-esbuild-es2018",
    name: "Official · esbuild minify es2018",
    note: "esbuild minify:true, target:es2018, format:esm",
    code: officialMinified["esbuild-es2018"],
  },
  {
    id: "itslil",
    name: "LilScript compiler · cost_model brotli",
    note: "Direct compiler output, not post-minified and without package metadata.",
    sourcePath: lilPath,
    primary: true,
    costModel: "brotli",
  },
  {
    id: "itslil-package",
    name: "@itslil/posthog-js · packaged ESM",
    note: "The same Brotli-scored output with the package license banner added.",
    sourcePath: packagePath,
  },
  {
    id: "itslil-gzip",
    name: "LilScript compiler · cost_model gzip",
    note: "Direct compiler output scored for gzip. Not the packaged ESM.",
    sourcePath: gzipPath,
    costModel: "gzip",
  },
  {
    id: "itslil-bytes",
    name: "LilScript compiler · cost_model raw",
    note: "Direct compiler output scored for raw bytes. Not the packaged ESM.",
    sourcePath: bytesPath,
    costModel: "raw",
  },
  {
    id: "itslil-closed",
    name: "LilScript compiler · closed fields",
    note: "Direct Brotli compiler output with [mangle] extern_fields = false. Not packaged.",
    sourcePath: closedPath,
    costModel: "brotli",
  },
]

const measured = []
for (const artifact of artifacts) {
  const outPath = join(lanesDir, `${artifact.id}.js`)
  if (artifact.sourcePath) {
    copyFileSync(artifact.sourcePath, outPath)
  } else {
    writeFileSync(outPath, artifact.code)
  }
  measured.push({
    id: artifact.id,
    name: artifact.name,
    note: artifact.note,
    primary: Boolean(artifact.primary),
    baseline: Boolean(artifact.baseline),
    diagnostic: Boolean(artifact.diagnostic),
    costModel: artifact.costModel ?? null,
    path: outPath,
    ...measureFile(outPath),
  })
}

const oxc = measured.find((lane) => lane.id === "kernel-oxc-mangle")
const brotliBuild = measured.find((lane) => lane.id === "itslil")
const gzipBuild = measured.find((lane) => lane.id === "itslil-gzip")
const rawBuild = measured.find((lane) => lane.id === "itslil-bytes")

const report = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  pin: "posthog-js@1.418.10",
  package: "@itslil/posthog-js",
  codec: "lilscript-codec gzip-9 / brotli-11",
  comparison:
    "Same capture kernel on every compiler row: posthog-js@1.418.10 UUID, feature-flag utils, cookie identity, request router, token-bucket rate limit, queue batching, bot detection, string/number/type helpers, JSON sanitize, URL trim, and the bucketed exception limiter. Then Vite 8 Oxc, Terser, and esbuild with the settings named on each row. LilScript emits separate raw-, gzip-, and Brotli-scored artifacts. Compiler comparisons exclude package metadata; the packaged ESM and its license banner are reported as a separate lane. The published posthog-js browser bundle is not a lane.",
  matched: {
    raw: rawBuild?.raw ?? null,
    gzip9: gzipBuild?.gzip9 ?? null,
    brotli11: brotliBuild?.brotli11 ?? null,
    vsOxc: {
      raw: oxc && rawBuild ? rawBuild.raw / oxc.raw : null,
      gzip9: oxc && gzipBuild ? gzipBuild.gzip9 / oxc.gzip9 : null,
      brotli11: oxc && brotliBuild ? brotliBuild.brotli11 / oxc.brotli11 : null,
    },
  },
  lanes: measured,
}

mkdirSync(join(root, "reports"), { recursive: true })
writeFileSync(join(root, "reports", "sizes.json"), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
