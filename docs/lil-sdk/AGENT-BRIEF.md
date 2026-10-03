# Brief for a porting agent (PostHog SDK → typed LilScript)

You port a fixed list of upstream posthog-js 1.435.8 modules to typed LilScript, one module per
upstream module, and prove each one with upstream's own tests. Read, in this order:
`docs/lil-sdk/PLAN.md` (goal and contract), `docs/lil-sdk/STYLE.md` (how to write the code —
binding), then the pilot modules under `src/posthog/` (`core/types.lil`,
`core/utils/{type,string,number}-utils.lil`, `browser/rate-limiter.lil`).

## Ground rules

- **Behaviour is exact.** Same results, thrown errors, console output, request bodies, storage
  writes, callback order as upstream — for every input upstream's TypeScript types admit, and for
  every input upstream checks at run time. Typed code is the goal; behaviour is the constraint.
  When typing would change behaviour, keep `JsValue` there.
- **Typed, not transliterated.** Do not copy Codex's `src/sdk/*.lil` style (everything `JsValue`,
  `JS.*` helpers): those measured 2–3% larger and 2–8% slower than the original. You may read
  them for LilScript workarounds.
- Work only in your worktree and only on your modules' files. Need a helper? Put it in your own
  module. Modules owned by other packages are imported as `@upstream/...` externs even if someone
  is porting them right now. Already ported (import natively): `src/posthog/core/types.lil`,
  `core/utils/type-utils.lil`, `core/utils/string-utils.lil`, `core/utils/number-utils.lil`,
  `browser/rate-limiter.lil`.
- **The machine is shared and small.** Never run cargo, never run the full upstream suite, never
  start two test runs. `g1-candidate.mjs --test` takes a shared lock (`flock`) for you; keep
  test runs to your modules' test files. Compiles take well under a second; do not loop on them
  needlessly.
- Commit on your branch after each module (or a few small ones) whose tests pass:
  `git add <your files> && git commit -m "…"` with the line
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage explicit paths only.

## The loop for each module

1. Read the upstream module and every upstream test file that imports it
   (`grep -rl "<module basename>'" vendor/posthog-js/packages/*/src --include=*.test.ts --include=*.spec.ts`).
2. Write `src/posthog/<package>/<path>.lil` (mirror of `packages/<package>/src/<path>.ts`).
3. Compile and test:
   `node test/lil/g1-candidate.mjs --test=packages/…/a.test.ts,packages/…/b.spec.ts`
   (all `.lil` files under `src/posthog/` compile together as one split build).
4. Gate: `node test/lil/g1-compare.mjs --reference=/home/azureuser/posthoglil-work/lil100/reports/lil-sdk/g1-reference.json`
   Every test that passes on the reference (upstream bundled with its npm private-name mangling)
   must pass on yours. Tests that fail on the reference read things the published build hides;
   they are not gated, but do look at why yours fail when the original passes — it may be a
   real difference.
5. When a test fails, find out why and fix the port. Never edit upstream tests, the harness, or
   the vendor tree. If the language or compiler blocks an exact port, write the smallest
   reproduction you can and note it (see Report); use the narrowest workaround meanwhile.

## Report (your final message)

- Modules ported, each with: upstream lines, LilScript lines, test files run, gate result
  (`passed/gated`), notable typing choices.
- Anything not exact or not finished, plainly.
- Compiler/language findings: each with a minimal `.lil` reproduction and the output you
  expected versus got (bytes, behaviour, or a refused construct).
- Byte observations worth knowing (e.g. a construct that prints badly).
