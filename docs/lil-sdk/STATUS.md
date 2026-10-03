# Status

## Now (2026-10-03 20:20 UTC)

- Branch `lil/posthog-100` (worktree `~/posthoglil-work/lil100`), on Codex's c6fd050 plus its
  uncommitted work (e1e83a6).
- G1 gate built: 6,235 upstream tests pass both on the original and on upstream bundled with
  its npm private-name mangling; the port must pass all of them. Full suite 5.5 min.
- G2 harness on 1.435.8: npm `module.js` vs upstream's source bundled by esbuild is identical
  (client 3/3, ABI 1/1, fuzz 40/40).
- Ported and tested: `core/types`, `core/utils/{type,string,number}-utils`,
  `browser/rate-limiter` (90/90 of their upstream tests).
- In progress (agents, own worktrees): WP1 core (40 modules), WP2 browser-common + browser
  leaves (35), WP3 storage/persistence/transport (13), WP4 capture features and integrations
  (19).

## Next

1. Merge WP1–WP4; link `@upstream` imports to native ones; full G1.
2. WP5 (flags, logs/metrics, surveys/tours/conversations managers, replay controller),
   WP6 (`posthog-core`, entry points).
3. Whole-program release builds (`scripts/lil-release.mjs`), G2 against npm, sizes, runtime.
4. Compiler features measured to matter (COMPILER-FINDINGS.md): F4 private-name contract
   (−4.3% Brotli on upstream's code), F1 class accessors, F2/F3/F5.

## Numbers to beat (standard entry, `module.js`)

| | raw | gzip-9 | Brotli-11 |
|---|---:|---:|---:|
| npm 1.435.8 `module.js` | 322,470 | 101,141 | 85,211 |
| best minified original (Codex's lanes) | 263,722 (terser-oxc-pooled) | 96,534 (terser-oxc) | 82,183 (terser-oxc) |
