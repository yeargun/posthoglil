// node run.mjs <sut-iife-file> <scenario.mjs> [envOptionsJson]  -> prints the trace as JSON
import { readFileSync } from "node:fs"
import { pathToFileURL } from "node:url"
import { createEnv, describe } from "./env.mjs"

const [sutFile, scenarioFile, optsJson] = process.argv.slice(2)
const scenario = await import(pathToFileURL(scenarioFile).href)
const cases = scenario.cases ?? [{ name: "default", env: {}, run: scenario.run }]
const results = []
for (const c of cases) {
  const env = createEnv({ ...(scenario.env ?? {}), ...(c.env ?? {}), ...(optsJson ? JSON.parse(optsJson) : {}) })
  let sut
  try {
    sut = env.load(readFileSync(sutFile, "utf8"))
    await env.settle()
    await c.run(sut, env)
    await env.settle()
  } catch (e) {
    env.log("scenario.error", { error: describe(e) })
  }
  results.push({ name: c.name, trace: env.trace })
}
process.stdout.write(JSON.stringify(results))
