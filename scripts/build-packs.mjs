import {
  accessSync,
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import { build as esbuild } from "esbuild"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const lilscriptRoot = process.env.LILSCRIPT_ROOT ?? resolve(root, "..", "lilscript")
const dist = resolve(root, "dist")
const temp = resolve(root, ".tmp")
const version = "1.418.10"

const packs = [
  {
    id: "surveys",
    entry: "surveys-entry.lil",
    types: "surveys.d.ts",
    label: "@posthog/core/surveys",
    releaseConfig: "lilscript.toml",
    costModel: "brotli",
  },
  {
    id: "error-tracking",
    entry: "error-tracking-entry.lil",
    types: "error-tracking.d.ts",
    label: "@posthog/core/error-tracking",
    releaseConfig: "lilscript.packs-safe.toml",
    costModel: "raw",
  },
  {
    id: "otlp",
    entry: "otlp-entry.lil",
    types: "otlp.d.ts",
    label: "PostHog pure OTLP logs + metrics helpers",
    releaseConfig: "lilscript.packs-safe.toml",
    costModel: "raw",
  },
]

function compilerPath() {
  const candidates = [
    process.env.LILSCRIPT_COMPILER,
    resolve(lilscriptRoot, "target", "release", "lilscript"),
    resolve(lilscriptRoot, "target", "debug", "lilscript"),
  ].filter(Boolean)
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch {
      // try next
    }
  }
  throw new Error("LilScript compiler not found. Set LILSCRIPT_COMPILER or build lilscript.")
}

function selectedPacks() {
  const inline = process.argv.find((argument) => argument.startsWith("--pack="))?.slice(7)
  const separateIndex = process.argv.indexOf("--pack")
  const requested = inline ?? (separateIndex >= 0 ? process.argv[separateIndex + 1] : undefined)
  if (!requested) return packs
  const ids = new Set(requested.split(","))
  const selected = packs.filter((pack) => ids.has(pack.id))
  if (selected.length !== ids.size) {
    const unknown = [...ids].filter((id) => !packs.some((pack) => pack.id === id))
    throw new Error(`Unknown pack: ${unknown.join(", ")}`)
  }
  return selected
}

function compile(compiler, pack, config, output) {
  console.log(`compiling ${pack.id} with ${config}`)
  const result = spawnSync(
    compiler,
    [
      resolve(root, "src", pack.entry),
      "--target",
      "js-module",
      "--config",
      resolve(root, config),
      "-o",
      output,
    ],
    { cwd: root, stdio: "inherit" },
  )
  if (result.status !== 0) process.exit(result.status ?? 1)
}

async function packagePack(pack, rawPath) {
  if (!existsSync(rawPath)) {
    throw new Error(`${rawPath} is missing. Run scripts/build-packs.mjs with --compile.`)
  }
  const banner = `/*! @itslil/posthog-js/${pack.id} ${version} | LilScript port of ${pack.label} at posthog-js ${version} | Apache-2.0 */\n`
  const esmPath = resolve(dist, `${pack.id}.esm.js`)
  const cjsPath = resolve(dist, `${pack.id}.cjs`)
  writeFileSync(esmPath, `${banner}${readFileSync(rawPath, "utf8").trimEnd()}\n`)
  await esbuild({
    absWorkingDir: dist,
    entryPoints: [esmPath],
    outfile: cjsPath,
    bundle: true,
    format: "cjs",
    platform: "neutral",
    legalComments: "none",
    minifyWhitespace: true,
    minifyIdentifiers: false,
    minifySyntax: false,
    banner: { js: banner },
    logLevel: "error",
  })
  copyFileSync(resolve(root, "types", pack.types), resolve(dist, pack.types))
  console.log(`wrote dist/${pack.id}.esm.js, dist/${pack.id}.cjs, dist/${pack.types}`)
}

const compileDev = process.argv.includes("--dev")
const compileProduction = process.argv.includes("--compile")
const selected = selectedPacks()
mkdirSync(dist, { recursive: true })
mkdirSync(temp, { recursive: true })

if (compileDev) {
  const compiler = compilerPath()
  for (const pack of selected) {
    compile(compiler, pack, "lilscript.dev.toml", resolve(temp, `${pack.id}.dev.js`))
  }
  console.log(`wrote ${selected.map((pack) => `.tmp/${pack.id}.dev.js`).join(", ")}`)
} else {
  const compiler = compileProduction ? compilerPath() : null
  for (const pack of selected) {
    const rawPath = resolve(dist, `${pack.id}.raw.js`)
    if (compiler) compile(compiler, pack, pack.releaseConfig, rawPath)
    await packagePack(pack, rawPath)
  }
}
