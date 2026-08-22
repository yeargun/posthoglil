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
const banner =
  "/*! @itslil/posthog-js 1.418.10 | LilScript subset of posthog-js 1.418.10 | Apache-2.0 */\n"

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
  return null
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: root, stdio: "inherit" })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function compileLil(compiler, configName, outputName) {
  run(compiler, [
    resolve(root, "src", "entry.lil"),
    "--target",
    "js-module",
    "--config",
    resolve(root, configName),
    "-o",
    resolve(dist, outputName),
  ])
}

const compileAll = process.argv.includes("--compile")
const compileDev = process.argv.includes("--dev")
mkdirSync(dist, { recursive: true })

if (compileDev) {
  const compiler = compilerPath()
  if (!compiler) throw new Error("LilScript compiler not found.")
  compileLil(compiler, "lilscript.dev.toml", "posthog.raw.js")
} else if (compileAll || !existsSync(resolve(dist, "posthog.raw.js"))) {
  const compiler = compilerPath()
  if (!compiler) {
    throw new Error("LilScript compiler not found. Set LILSCRIPT_COMPILER or build lilscript.")
  }
  compileLil(compiler, "lilscript.toml", "posthog.raw.js")
  compileLil(compiler, "lilscript.closed.toml", "posthog.closed.js")
  compileLil(compiler, "lilscript.gzip.toml", "posthog.gzip.js")
  compileLil(compiler, "lilscript.bytes.toml", "posthog.bytes.js")
}

const rawPath = resolve(dist, "posthog.raw.js")
if (!existsSync(rawPath)) {
  throw new Error("dist/posthog.raw.js is missing. Run with --compile after building LilScript.")
}

writeFileSync(resolve(dist, "posthog.esm.js"), `${banner}${readFileSync(rawPath, "utf8").trimEnd()}\n`)

await esbuild({
  absWorkingDir: dist,
  entryPoints: [resolve(dist, "posthog.esm.js")],
  outfile: resolve(dist, "posthog.cjs"),
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

await esbuild({
  absWorkingDir: dist,
  entryPoints: [resolve(dist, "posthog.esm.js")],
  outfile: resolve(dist, "posthog.umd.js"),
  bundle: true,
  format: "iife",
  globalName: "posthogLil",
  footer: {
    js: "globalThis.posthogLil=posthogLil.default||posthogLil;",
  },
  legalComments: "none",
  minifyWhitespace: true,
  minifyIdentifiers: false,
  minifySyntax: false,
  banner: { js: banner },
  logLevel: "error",
})

copyFileSync(resolve(root, "types", "posthog.d.ts"), resolve(dist, "posthog.d.ts"))
console.log("wrote dist/posthog.esm.js, dist/posthog.cjs, dist/posthog.umd.js")
