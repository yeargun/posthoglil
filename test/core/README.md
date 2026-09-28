# Core rewrite: differential gate, size bars, runtime benchmark

The slim client (`src/slim.lil`, upstream's `module.slim.no-external.es.ts` graph) must behave
exactly like posthog-js 1.418.10 in every runtime. The gate runs upstream (built from the pinned
sources in `vendor/posthog-js`) and the port in the same deterministic jsdom realm, each in its
own process, and compares every observable effect: network requests (bodies gunzipped and
hashed), cookies, web storage, console output, event listeners, return values and callbacks.

Pin the compiler you test (`LILSCRIPT_COMPILER`); `vendor/posthog-js` must be the pinned clone.

```bash
LILSCRIPT_COMPILER=/path/to/lilscript npm run test:core            # level 8 dev build
LILSCRIPT_COMPILER=/path/to/lilscript FUZZ_SEEDS=1-200 npm run test:core:release
```

- `scenarios/foundation.mjs`, `events.mjs`, `persistence.mjs`: module-level functions
  (`adapters/foundation.ts` against `src/core/test-entry.lil`).
- `scenarios/client-basic.mjs`: the client end to end; `extensions.mjs`: upstream's own extension
  classes (flags, autocapture, heatmaps, exceptions, logs, metrics, experiments, site apps,
  tracing, toolbar) bundled separately and driving the port through the private ABI.
- `scenarios/fuzz.mjs`: seeded random programs (config, API calls, clock jumps, page events,
  network outcomes) in six environments (`FUZZ_ENVS`: default, xhr, native CompressionStream,
  no crypto, no sendBeacon, throwing storage).

Size and speed:

```bash
LILSCRIPT_CODEC=/path/to/lilscript-codec node test/core/bars.mjs test/core/out/src_slim_lil.mjs
node test/core/bench-pair.mjs <upstream module.slim.no-external.js> <port build .mjs> 7
```

`bars.mjs` bundles the same source graph and minifies it with Oxc, Terser (3 passes, and
upstream's own rollup settings with and without its private-property mangling), esbuild and SWC
(when `@swc/core` resolves or `SWC_CORE` points at it). `bench-pair.mjs` alternates the two
builds in fresh processes over five lanes (batched captures on memory and cookie persistence,
unbatched captures, named inits, identity calls) and prints medians and the lil/up ratio.
