import { appendFileSync } from "node:fs"

// Appends one JSON line per compiler invocation to the file named by
// POSTHOGLIL_COMPILE_LOG. scripts/record-compiler-run.mjs sets it to time the
// release build; an ordinary build leaves it unset and logs nothing.
export function logCompile(entry) {
  const path = process.env.POSTHOGLIL_COMPILE_LOG
  if (!path) return
  appendFileSync(path, `${JSON.stringify({ ...entry, wallMs: Math.round(entry.wallMs) })}\n`)
}
