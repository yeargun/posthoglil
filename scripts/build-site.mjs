import { bundleOfficialKernel } from "./official-bundle.mjs"
import { cp, mkdir, rm, writeFile } from "node:fs/promises"
import { existsSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const output = join(root, "_site")

if (!existsSync(join(root, "dist", "posthog.esm.js"))) {
  const built = spawnSync(process.execPath, [join(root, "scripts", "build.mjs"), "--dev"], {
    cwd: root,
    stdio: "inherit",
  })
  if (built.status !== 0) process.exit(built.status ?? 1)
}

if (!existsSync(join(root, "site", "results.json"))) {
  writeFileSync(
    join(root, "site", "results.json"),
    `${JSON.stringify(
      {
        pin: "posthog-js@1.418.10",
        package: "@itslil/posthog-js",
        codec: "lilscript-codec gzip-9 / brotli-11",
        size: [],
      },
      null,
      2,
    )}\n`,
  )
}

await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
await cp(join(root, "site"), output, { recursive: true })
await cp(join(root, "dist", "posthog.esm.js"), join(output, "posthog.js"))
for (const pack of ["surveys", "error-tracking", "otlp", "autocapture", "replay-core"]) {
  const source = join(root, "dist", `${pack}.esm.js`)
  if (existsSync(source)) await cp(source, join(output, `${pack}.js`))
}
await writeFile(join(output, "posthog-official.js"), await bundleOfficialKernel(root))
await writeFile(join(output, ".nojekyll"), "")
console.log(`Built GitHub Pages site at ${output}`)

// Publish current build facts using the existing page typography.
await import("./build-comparison.mjs").then(({writeComparison}) => writeComparison({root, output}));
