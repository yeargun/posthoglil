import { build as esbuild } from "esbuild"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

export async function bundleOfficialKernel(root = defaultRoot) {
  const result = await esbuild({
    absWorkingDir: root,
    entryPoints: [join(root, "official", "entry.ts")],
    bundle: true,
    format: "esm",
    platform: "neutral",
    write: false,
    legalComments: "none",
    target: "esnext",
  })
  const code = result.outputFiles[0]?.text
  if (typeof code !== "string" || code.length === 0) {
    throw new Error("esbuild did not emit official kernel JavaScript")
  }
  return code
}
