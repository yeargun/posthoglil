// node diff.mjs <upstream-iife> <port-iife> <scenario.mjs...> : run each side in its own
// process and report the first differing trace entries per case.
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
const runner = fileURLToPath(new URL("./run.mjs", import.meta.url))
const [up, lil, ...scenarios] = process.argv.slice(2)
let failures = 0, total = 0
const run = (sut, sc) => {
  try {
    return JSON.parse(execFileSync(process.execPath, [runner, sut, sc], { encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"] }))
  } catch (e) {
    console.log(`runner failed for ${sut} ${sc}:\n` + String(e.stderr ?? e).split("\n").slice(0, 8).join("\n"))
    process.exit(2)
  }
}
for (const sc of scenarios) {
  const a = run(up, sc), b = run(lil, sc)
  for (let i = 0; i < a.length; i++) {
    total++
    const ta = a[i].trace, tb = b[i]?.trace ?? []
    const n = Math.max(ta.length, tb.length)
    let first = -1
    for (let j = 0; j < n; j++) if (JSON.stringify(ta[j]) !== JSON.stringify(tb[j])) { first = j; break }
    if (first === -1) continue
    failures++
    console.log(`\n✗ ${sc} :: ${a[i].name} — first difference at entry ${first} (upstream ${ta.length}, port ${tb.length})`)
    for (let j = Math.max(0, first - 2); j < Math.min(n, first + 4); j++) {
      const sa = JSON.stringify(ta[j]), sb = JSON.stringify(tb[j])
      if (sa === sb) console.log("   = " + (sa ?? "").slice(0, 400))
      else { console.log(" up " + (sa ?? "—").slice(0, 600)); console.log(" lil " + (sb ?? "—").slice(0, 600)) }
    }
  }
}
console.log(`\n${total - failures}/${total} cases identical`)
process.exit(failures ? 1 : 0)
