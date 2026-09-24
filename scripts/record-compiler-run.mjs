// Times the release build's compiler invocations and records them, with the
// compiler's identity, as the `compiler` block of site/results.json.
//
//   node scripts/record-compiler-run.mjs --revision <lilscript commit> [--samples 3]
//
// Each sample runs `scripts/build.mjs --compile` and `scripts/build-packs.mjs
// --compile` once. A sample's wall time is the sum of the compiler processes'
// wall times (the esbuild packaging steps are not counted). The compiled files
// must be byte-identical across samples, or the run is refused.
import { createHash } from "node:crypto"
import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { cpus, loadavg } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const argv = process.argv.slice(2)
const flag = (name, fallback = null) => {
  const at = argv.indexOf(`--${name}`)
  return at === -1 ? fallback : argv[at + 1]
}
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex")

const compiler = process.env.LILSCRIPT_COMPILER
const codec = process.env.LILSCRIPT_CODEC
if (!compiler || !existsSync(compiler)) throw new Error("Set LILSCRIPT_COMPILER to the compiler being recorded.")
const lilscriptRoot = process.env.LILSCRIPT_ROOT ?? resolve(root, "..", "lilscript")
const revision =
  flag("revision") ??
  process.env.LILSCRIPT_COMPILER_REVISION ??
  execFileSync("git", ["-C", lilscriptRoot, "rev-parse", "--short=8", "HEAD"], { encoding: "utf8" }).trim()
const samples = Number(flag("samples", "3"))

const compiled = [
  "dist/posthog.raw.js",
  "dist/posthog.gzip.js",
  "dist/posthog.bytes.js",
  ...["surveys", "error-tracking", "otlp", "autocapture", "replay-core"].map((pack) => `dist/${pack}.raw.js`),
]

const log = join(root, "reports", "compile-times.jsonl")
const loadAtStart = loadavg()
const runs = []
let reference = null
for (let sample = 0; sample < samples; sample++) {
  rmSync(log, { force: true })
  for (const script of ["build.mjs", "build-packs.mjs"]) {
    const result = spawnSync(process.execPath, [join(root, "scripts", script), "--compile"], {
      cwd: root,
      stdio: ["ignore", "ignore", "inherit"],
      env: { ...process.env, POSTHOGLIL_COMPILE_LOG: log },
    })
    if (result.status !== 0) process.exit(result.status ?? 1)
  }
  const invocations = readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line))
  const hashes = Object.fromEntries(compiled.map((file) => [file, sha256(join(root, file))]))
  if (reference && JSON.stringify(hashes) !== JSON.stringify(reference)) {
    throw new Error(`sample ${sample + 1} compiled different bytes than sample 1`)
  }
  reference = hashes
  runs.push(invocations)
}
rmSync(log, { force: true })

const compileWallMs = runs.map((invocations) => invocations.reduce((sum, entry) => sum + entry.wallMs, 0))
const invocations = runs[0].map((entry, index) => ({
  entry: entry.entry,
  config: entry.config,
  output: entry.output,
  wallMs: runs.map((invocationsOfRun) => invocationsOfRun[index].wallMs),
}))

const block = {
  revision,
  binarySha256: sha256(compiler),
  codecSha256: codec && existsSync(codec) ? sha256(codec) : null,
  date: new Date().toISOString().slice(0, 10),
  compileWallMs,
  scope: `sum of the ${invocations.length} compiler invocations of npm run build and npm run build:packs, one process each; esbuild packaging not counted`,
  host: `${cpus().length} × ${cpus()[0]?.model ?? "unknown CPU"}, Node ${process.version}`,
  // One-minute load average: the host is shared, so wall time depends on it.
  load: { atStart: Number(loadAtStart[0].toFixed(2)), atEnd: Number(loadavg()[0].toFixed(2)) },
  invocations,
}

const resultsPath = join(root, "site", "results.json")
const results = JSON.parse(readFileSync(resultsPath, "utf8"))
results.compiler = block
writeFileSync(resultsPath, `${JSON.stringify(results, null, 2)}\n`)
console.log(`recorded compiler ${revision}: ${compileWallMs.join(" / ")} ms over ${invocations.length} invocations`)
