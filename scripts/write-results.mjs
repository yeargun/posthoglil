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
  matched: sizes.matched ?? null,
  hero: {
    brotliRatio: itslil && officialOxc ? itslil.brotli11 / officialOxc.brotli11 : null,
    officialBrotli: officialOxc?.brotli11 ?? null,
    itslilBrotli: itslil?.brotli11 ?? null,
    packageBrotli: itslilPackage?.brotli11 ?? null,
    packageRaw: itslilPackage?.raw ?? null,
    gzipRatio: itslilGzip && officialOxc ? itslilGzip.gzip9 / officialOxc.gzip9 : null,
    officialGzip: officialOxc?.gzip9 ?? null,
    itslilGzip: itslilGzip?.gzip9 ?? null,
    rawRatio: itslilBytes && officialOxc ? itslilBytes.raw / officialOxc.raw : null,
    officialRaw: officialOxc?.raw ?? null,
    itslilRaw: itslilBytes?.raw ?? null,
    kernelRawBrotli: kernelRaw?.brotli11 ?? null,
  },
}

writeFileSync(join(root, "site", "results.json"), `${JSON.stringify(results, null, 2)}\n`)
console.log("wrote site/results.json")
