import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const packReportPath = join(root, "reports", "packs.json")
const packReport = existsSync(packReportPath)
  ? JSON.parse(readFileSync(packReportPath, "utf8"))
  : null

if (process.argv.includes("--packs-only")) {
  if (!packReport) throw new Error("reports/packs.json is missing")
  const siteResultsPath = join(root, "site", "results.json")
  const existing = JSON.parse(readFileSync(siteResultsPath, "utf8"))
  const merged = {
    ...existing,
    packComparison: packReport.comparison,
    submoduleCommit: packReport.submoduleCommit,
    packs: packReport.packs,
  }
  writeFileSync(siteResultsPath, `${JSON.stringify(merged, null, 2)}\n`)
  console.log("merged pack measurements into site/results.json")
  process.exit(0)
}

const sizes = JSON.parse(readFileSync(join(root, "reports", "sizes.json"), "utf8"))
// Kept across rewrites: the compiler run (scripts/record-compiler-run.mjs) and
// the previous release's numbers, which no measurement here can regenerate.
const siteResultsPath = join(root, "site", "results.json")
const previous = existsSync(siteResultsPath) ? JSON.parse(readFileSync(siteResultsPath, "utf8")) : {}

const officialOxc =
  sizes.lanes.find((lane) => lane.id === "kernel-oxc-mangle") ??
  sizes.lanes.find((lane) => lane.baseline)
const kernelRaw = sizes.lanes.find((lane) => lane.id === "kernel")
const itslil = sizes.lanes.find((lane) => lane.primary)
const itslilPackage = sizes.lanes.find((lane) => lane.id === "itslil-package")
const itslilGzip = sizes.lanes.find((lane) => lane.id === "itslil-gzip")
const itslilBytes = sizes.lanes.find((lane) => lane.id === "itslil-bytes")

const results = {
  pin: sizes.pin,
  package: sizes.package,
  node: sizes.node,
  codec: sizes.codec,
  comparison: sizes.comparison ?? null,
  packComparison: packReport?.comparison ?? null,
  submoduleCommit: packReport?.submoduleCommit ?? "9b2a1b18db64f9f6b331cbded543c5ead3ccf0cb",
  packs: packReport?.packs ?? [],
  size: sizes.lanes.map((lane) => ({
    id: lane.id,
    name: lane.name,
    raw: lane.raw,
    gzip9: lane.gzip9,
    brotli11: lane.brotli11,
    note: lane.note,
    primary: lane.primary,
    baseline: lane.baseline,
    diagnostic: lane.diagnostic,
    costModel: lane.costModel ?? null,
  })),
  // The headline is the complete root package ESM (license banner included)
  // against the original kernel minified by Oxc: all three headline sizes
  // measure that one file. The per-objective compiles are rows of their own.
  matched: {
    raw: itslilPackage?.raw ?? null,
    gzip9: itslilPackage?.gzip9 ?? null,
    brotli11: itslilPackage?.brotli11 ?? null,
    vsOxc: {
      raw: itslilPackage && officialOxc ? itslilPackage.raw / officialOxc.raw : null,
      gzip9: itslilPackage && officialOxc ? itslilPackage.gzip9 / officialOxc.gzip9 : null,
      brotli11: itslilPackage && officialOxc ? itslilPackage.brotli11 / officialOxc.brotli11 : null,
    },
  },
  hero: {
    brotliRatio: itslilPackage && officialOxc ? itslilPackage.brotli11 / officialOxc.brotli11 : null,
    officialBrotli: officialOxc?.brotli11 ?? null,
    itslilBrotli: itslilPackage?.brotli11 ?? null,
    packageBrotli: itslilPackage?.brotli11 ?? null,
    packageRaw: itslilPackage?.raw ?? null,
    gzipRatio: itslilPackage && officialOxc ? itslilPackage.gzip9 / officialOxc.gzip9 : null,
    officialGzip: officialOxc?.gzip9 ?? null,
    itslilGzip: itslilPackage?.gzip9 ?? null,
    rawRatio: itslilPackage && officialOxc ? itslilPackage.raw / officialOxc.raw : null,
    officialRaw: officialOxc?.raw ?? null,
    itslilRaw: itslilPackage?.raw ?? null,
    kernelRawBrotli: kernelRaw?.brotli11 ?? null,
  },
  objectives: {
    brotli11: itslil?.brotli11 ?? null,
    gzip9: itslilGzip?.gzip9 ?? null,
    raw: itslilBytes?.raw ?? null,
  },
  delivered: sizes.delivered ?? [],
  ...(previous.compiler ? { compiler: previous.compiler } : {}),
  ...(previous.previousRelease ? { previousRelease: previous.previousRelease } : {}),
}

writeFileSync(siteResultsPath, `${JSON.stringify(results, null, 2)}\n`)
console.log("wrote site/results.json")
