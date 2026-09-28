// Paired runtime benchmark: rounds alternate which SUT runs first; each run is a fresh
// process. node bench-pair.mjs <up-esm> <lil-esm> [rounds]
import { execFileSync } from "node:child_process"
const [up, lil, roundsArg] = process.argv.slice(2)
const rounds = +(roundsArg ?? 7)
const lanes = ["capture-memory", "capture-default", "capture-unbatched", "init", "identity"]
const res = {}
for (let r = 0; r < rounds; r++) {
  for (const lane of lanes) {
    const order = r % 2 ? [["lil", lil], ["up", up]] : [["up", up], ["lil", lil]]
    for (const [side, file] of order) {
      const out = JSON.parse(execFileSync("node", ["bench.mjs", file, lane], { encoding: "utf8", timeout: 300000 }))
      for (const [metric, v] of Object.entries(out)) if (typeof v === "number") ((res[lane + "/" + metric] ??= { up: [], lil: [] })[side]).push(v)
    }
  }
  process.stderr.write(`round ${r + 1}/${rounds}\n`)
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2 }
console.log("metric".padEnd(28), "up ms".padStart(9), "lil ms".padStart(9), "lil/up".padStart(7), "pair min..max")
for (const [k, { up: u, lil: l }] of Object.entries(res)) {
  const pairs = u.map((x, i) => l[i] / x)
  console.log(k.padEnd(28), med(u).toFixed(1).padStart(9), med(l).toFixed(1).padStart(9), (med(l) / med(u)).toFixed(3).padStart(7), Math.min(...pairs).toFixed(3) + ".." + Math.max(...pairs).toFixed(3))
}
