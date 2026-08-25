import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { measureFile } from "./codec.mjs"
import { minifyLanes } from "./minify-lanes.mjs"
import {
  bundleOfficialAutocapture,
  bundleOfficialErrorTracking,
  bundleOfficialOtlp,
  bundleOfficialReplayCore,
  bundleOfficialSurveys,
} from "./official-bundle.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const temp = join(root, ".tmp", "pack-lanes")
const reportDir = join(root, "reports")

const packs = [
  {
    id: "autocapture",
    name: "Autocapture utilities",
    subpath: "@itslil/posthog-js/autocapture",
    source: "packages/browser-common/src/utils/autocapture-utils.ts",
    groups: 5,
    exports: 21,
    costModel: "brotli",
    bundle: bundleOfficialAutocapture,
  },
  {
    id: "replay-core",
    name: "Session replay core",
    subpath: "@itslil/posthog-js/replay-core",
    source: "browser replay external/config.ts + sessionrecording-utils.ts",
    groups: 6,
    exports: 20,
    costModel: "brotli",
    bundle: bundleOfficialReplayCore,
  },
  {
    id: "surveys",
    name: "Surveys",
    subpath: "@itslil/posthog-js/surveys",
    source: "packages/core/src/surveys/index.ts",
    groups: 6,
    exports: 21,
    costModel: "brotli",
    bundle: bundleOfficialSurveys,
  },
  {
    id: "error-tracking",
    name: "Error tracking",
    subpath: "@itslil/posthog-js/error-tracking",
    source: "packages/core/src/error-tracking/index.ts",
    groups: 5,
    exports: 26,
    costModel: "raw",
    bundle: bundleOfficialErrorTracking,
  },
  {
    id: "otlp",
    name: "OTLP logs + metrics",
    subpath: "@itslil/posthog-js/otlp",
    source: "packages/core/src/logs/logs-utils.ts + metrics helpers/config",
    groups: 6,
    exports: 14,
    costModel: "brotli",
    bundle: bundleOfficialOtlp,
  },
]

const laneNames = {
  "oxc-mangle": "Official · Vite 8 Oxc mangle on",
  "oxc-nomangle": "Official · Vite 8 Oxc mangle off",
  "terser-mangle": "Official · Terser mangle on · 3 passes",
  "terser-nomangle": "Official · Terser mangle off · 3 passes",
  "terser-passes-1": "Official · Terser mangle on · 1 pass",
  "esbuild-esnext": "Official · esbuild minify esnext",
  "esbuild-es2018": "Official · esbuild minify es2018",
}

function measureCode(path, code) {
  writeFileSync(path, code)
  return measureFile(path)
}

mkdirSync(temp, { recursive: true })
mkdirSync(reportDir, { recursive: true })

const measuredPacks = []
for (const pack of packs) {
  const officialSource = await pack.bundle(root)
  const minified = await minifyLanes(officialSource, `posthog-${pack.id}.js`)
  const packDir = join(temp, pack.id)
  mkdirSync(packDir, { recursive: true })

  const lanes = [
    {
      id: "official",
      name: "Official source bundle · no minify",
      note: `esbuild bundles the untouched pinned ${pack.source} dependency graph without minification.`,
      code: officialSource,
    },
    ...Object.entries(minified).map(([id, code]) => ({
      id: `official-${id}`,
      name: laneNames[id],
      note: `The untouched official source bundle minified by ${laneNames[id].replace("Official · ", "")}.`,
      baseline: id === "oxc-mangle",
      code,
    })),
    {
      id: "lilscript",
      name: `LilScript compiler · cost_model ${pack.costModel}`,
      note: `Direct verified compiler output scored for ${pack.costModel}, not post-minified and without package metadata.`,
      primary: true,
      costModel: pack.costModel,
      path: join(root, "dist", `${pack.id}.raw.js`),
    },
    {
      id: "package",
      name: `${pack.subpath} · packaged ESM`,
      note: "The same compiler output with the package license banner added.",
      path: join(root, "dist", `${pack.id}.esm.js`),
    },
  ]

  const measured = lanes.map((lane) => {
    const path = lane.path ?? join(packDir, `${lane.id}.js`)
    const size = lane.code === undefined ? measureFile(path) : measureCode(path, lane.code)
    return {
      id: lane.id,
      name: lane.name,
      note: lane.note,
      baseline: Boolean(lane.baseline),
      primary: Boolean(lane.primary),
      costModel: lane.costModel ?? null,
      ...size,
    }
  })
  const baseline = measured.find((lane) => lane.baseline)
  const primary = measured.find((lane) => lane.primary)
  measuredPacks.push({
    id: pack.id,
    name: pack.name,
    subpath: pack.subpath,
    source: pack.source,
    exports: pack.exports,
    differentialGroups: pack.groups,
    exact: true,
    costModel: pack.costModel,
    ratios: {
      raw: primary.raw / baseline.raw,
      gzip9: primary.gzip9 / baseline.gzip9,
      brotli11: primary.brotli11 / baseline.brotli11,
    },
    lanes: measured,
  })
}

const report = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  pin: "posthog-js@1.418.10",
  submoduleCommit: "9b2a1b18db64f9f6b331cbded543c5ead3ccf0cb",
  codec: "lilscript-codec gzip-9 / brotli-11",
  comparison:
    "Each pack is measured independently. The official side is bundled directly from the untouched pinned posthog-js git submodule, then minified with the named Oxc, Terser, or esbuild settings. LilScript is the exact corresponding runtime surface and is not post-minified. Surveys, OTLP, autocapture, and replay core use verified Brotli-scored production artifacts; error tracking uses its verified release artifact. No pack is combined with the capture kernel or the published PostHog browser bundle.",
  packs: measuredPacks,
}

writeFileSync(join(reportDir, "packs.json"), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
