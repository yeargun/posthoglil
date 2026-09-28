// The core rewrite's gate: upstream (pinned sources) and the port run the same scenarios in
// the same deterministic jsdom realm, each in its own process; every trace must be identical.
//   node test/core/verify.mjs [dev|release]
//   FUZZ_SEEDS=1-200 (default 1-40), FUZZ_ENVS=default,xhr,native,nocrypto,nobeacon,nostorage
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const node = (args, env = {}) => execFileSync(process.execPath, args, { stdio: "inherit", env: { ...process.env, ...env } })
node([here("./build.mjs"), process.argv[2] ?? "dev"])
const out = (f) => here("./out/" + f)
const sc = (f) => here("./scenarios/" + f)
node([here("./diff.mjs"), out("up-foundation.js"), out("lil-foundation.js"), sc("foundation.mjs"), sc("events.mjs"), sc("persistence.mjs")])
node([here("./diff.mjs"), out("up-slim.js"), out("lil-slim.js"), sc("client-basic.mjs"), sc("extensions.mjs")])
for (const env of (process.env.FUZZ_ENVS ?? "default,xhr,native,nocrypto,nobeacon,nostorage").split(",")) {
  console.log(`fuzz ${env} (seeds ${process.env.FUZZ_SEEDS ?? "1-40"})`)
  node([here("./diff.mjs"), out("up-slim.js"), out("lil-slim.js"), sc("fuzz.mjs")], { FUZZ_ENV: env, FUZZ_SEEDS: process.env.FUZZ_SEEDS ?? "1-40" })
}
