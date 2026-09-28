// Rebuild the differential artifacts into out/: node test/core/build.mjs [dev|release]
//   up-foundation.js / lil-foundation.js   module-level functions (adapters/foundation.ts, src/core/test-entry.lil)
//   up-slim.js / lil-slim.js               the whole client (adapters/slim.ts, src/slim.lil)
//   ext.js                                 upstream's extension classes, bundled on their own
import { OUT, upstream, port } from "./bundle.mjs"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
const config = process.argv[2] === "release" ? "lilscript.core.toml" : "lilscript.core.dev.toml"
mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, "up-foundation.js"), await upstream("foundation"))
writeFileSync(join(OUT, "up-slim.js"), await upstream("slim"))
writeFileSync(join(OUT, "ext.js"), await upstream("extensions", "__ext"))
const f = await port("src/core/test-entry.lil", config)
writeFileSync(join(OUT, "lil-foundation.js"), f.code)
const s = await port("src/slim.lil", config)
writeFileSync(join(OUT, "lil-slim.js"), s.code)
console.log(`port built with ${config}: test-entry ${f.bytes} B in ${f.ms} ms, slim ${s.bytes} B in ${s.ms} ms`)
