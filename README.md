# PostHog × LilScript

A complete browser SDK integration experiment, plus standalone utility ports, pinned to **posthog-js 1.435.8** at [`c9d890a4028b186a5e1b327161ea197001c0c46b`](https://github.com/PostHog/posthog-js/tree/c9d890a4028b186a5e1b327161ea197001c0c46b). The upstream source submodule is unmodified. The npm latest tag was checked on 2026-10-03.

**The complete SDK works in the tested browser journeys.** The complete SDK candidates are 0.37–1.23% larger across the six objectives below. 5 of 6 standalone utility groups are smaller for both gzip and Brotli. These are different scopes; runtime results are measured separately.

[Interactive results and preview](https://yeargun.github.io/posthoglil/) · [SDK receipts](artifacts/sdk/results.json) · [Runtime samples](artifacts/sdk/performance.json) · [Validation](artifacts/sdk/validation.json)

## Complete SDK size

Each candidate is independently compiled for its named objective. The baseline is the smallest original for that codec among the exact npm artifact and the unchanged pinned source bundled through Terser, Oxc and esbuild. Numbers are bytes. Raw, gzip-9 and Brotli-11 rows refer to different, separately targeted candidate files.

| SDK | Objective | Minified original | Candidate | Difference | Winning original |
| --- | --- | ---: | ---: | --- | --- |
| standard | raw | 322,471 | 325,830 | 1.04% larger | published |
| standard | gzip | 100,934 | 102,147 | 1.20% larger | published |
| standard | brotli | 85,267 | 86,320 | 1.23% larger | terser |
| full | raw | 705,672 | 708,301 | 0.37% larger | oxc |
| full | gzip | 202,948 | 204,044 | 0.54% larger | oxc |
| full | brotli | 169,302 | 170,704 | 0.83% larger | oxc |

The standard row is the initial client: optional extension downloads are additional. The full row is upstream's **full/no-external** entry. It embeds replay, surveys, logs, exception autocapture, tracing headers, web vitals and dead clicks; product tours, conversations, toolbar and chat integrations are not embedded. No extra recorder script is fetched in the full browser test.

The receipt includes every minifier lane, all three codec sizes per artifact, SHA-256 hashes and the same-pipeline comparison. Generic bundler/minifier gains are not attributed to LilScript. The SDK mixes qualified LilScript internals with upstream client, transport, persistence, UI and recorder code; it is not a complete rewrite of every SDK implementation.

## Runtime

15 measured pairs plus 2 warmup pairs per surface/objective; alternating order, fresh browser contexts, Chromium 139.0.7258.5. The table shows the default Brotli builds. Positive paired improvement means faster; an interval spanning zero supports no clear difference. These are exploratory microbenchmarks, not end-user latency guarantees.

| SDK | Workload | Original median | Candidate median | Paired result |
| --- | --- | ---: | ---: | --- |
| standard | importMs | 21.40 ms | 21.90 ms | no clear difference; paired 95% interval -6.7% to 0.0% |
| standard | initMs | 6.20 ms | 6.20 ms | no clear difference; paired 95% interval -3.3% to 4.6% |
| standard | capture1000Ms | 257.90 ms | 257.30 ms | no clear difference; paired 95% interval -2.3% to 3.3% |
| full | importMs | 35.40 ms | 36.10 ms | no clear difference; paired 95% interval -3.7% to 0.3% |
| full | initMs | 6.10 ms | 6.20 ms | no clear difference; paired 95% interval -1.6% to 0.0% |
| full | capture1000Ms | 252.00 ms | 259.30 ms | no clear difference; paired 95% interval -3.6% to 0.1% |

Across all objectives, the paired measurements showed slower results for standard / raw / module import (21.50 ms original, 22.10 ms candidate). See the runtime selector on the page and the complete sample receipt.

Import times include parse, evaluation and module scheduling from a fresh Blob URL, excluding source download. Init uses memory persistence, autocapture, bootstrapped flags and disabled recording. Capture times cover preparation and queueing of 1,000 events after 100 warmup calls; each sample asserts 1,000 accepted events. Upload, ingestion and replay processing are not timed. Assess each workload's paired interval; these measurements do not establish a general application speedup.

## Build time

One measured run per stage, warm filesystem and compiler cache disabled. Candidate time includes compilation, source bundling and its selected minifier. Original time is the same source bundler and the candidate's selected minifier; the npm publisher's build time is unknown. Installation, lane search, declarations, packaging and transport compression are excluded. Different output scopes are not presented as build speedups.

| SDK | Objective | Matching original pipeline | Candidate pipeline |
| --- | --- | ---: | ---: |
| standard | raw | 3.085 s | 18.696 s |
| standard | gzip | 3.085 s | 16.723 s |
| standard | brotli | 3.085 s | 33.741 s |
| full | raw | 0.259 s | 16.429 s |
| full | gzip | 0.259 s | 13.723 s |
| full | brotli | 0.259 s | 35.522 s |

## Standalone utilities

These percentages cover the listed utility exports, not the SDK. The utility kernel includes explicitly extracted router, queue and rate-limit helper contracts. Other fixtures re-export the pinned upstream modules. See [utility receipts](artifacts/utilities/results.json) for bytes, per-objective build costs and original minifier lanes.

| Utility group | Raw objective | gzip objective | Brotli objective |
| --- | --- | --- | --- |
| Utility kernel | 12.19% smaller | 14.82% smaller | 15.81% smaller |
| Survey utilities | 4.00% smaller | 12.85% smaller | 13.97% smaller |
| Error tracking | 0.94% larger | 1.71% larger | 1.41% larger |
| OTLP encoders | 15.30% smaller | 11.72% smaller | 11.70% smaller |
| Autocapture utilities | 19.18% smaller | 22.36% smaller | 21.85% smaller |
| Replay configuration and buffers | 16.83% smaller | 17.04% smaller | 17.26% smaller |

The utility package API remains `@itslil/posthog-js` with `surveys`, `error-tracking`, `otlp`, `autocapture` and `replay-core` subpaths. Repository artifacts are refreshed; this task does not publish a new utility npm release. The separate SDK preview below preserves the PostHog client API.

## Named imports and tree shaking

These consumers import one helper from the complete utility ESM artifact, then bundle and minify with esbuild. Each source artifact has its own raw/gzip/Brotli compilation objective. The baseline is the smallest original consumer for that codec across the original minifier lanes. Numbers are bytes. [Consumer receipts and downloadable bundles](artifacts/tree-shaking/results.json) also cover Rolldown/Oxc.

| Named import | Objective | Minified original consumer | LilScript consumer | Difference |
| --- | --- | ---: | ---: | --- |
| clampToRange | raw | 2,302 | 1,176 | 48.91% smaller |
| clampToRange | gzip | 989 | 589 | 40.44% smaller |
| clampToRange | brotli | 864 | 495 | 42.71% smaller |
| getUtf8ByteLength | raw | 1,514 | 241 | 84.08% smaller |
| getUtf8ByteLength | gzip | 685 | 198 | 71.09% smaller |
| getUtf8ByteLength | brotli | 599 | 161 | 73.12% smaller |
| msToUnixNano | raw | 1,505 | 89 | 94.09% smaller |
| msToUnixNano | gzip | 669 | 100 | 85.05% smaller |
| msToUnixNano | brotli | 591 | 90 | 84.77% smaller |
| effectivePayloadLimitBytes | raw | 2,478 | 141 | 94.31% smaller |
| effectivePayloadLimitBytes | gzip | 1,141 | 138 | 87.91% smaller |
| effectivePayloadLimitBytes | brotli | 1,019 | 114 | 88.81% smaller |

24 execution and elimination checks cover four named imports, two bundlers and three objectives. No side-effect override is applied: observable initialization, including the kernel's campaign-property array spread, remains. The default utility API is a native object literal, and the variadic stack-parser factory has no effectful reflection initializer. Unused functions can be discarded without changing the public API. These consumer sizes are not complete SDK savings.

Private encoder, traversal, stack-cycle and serialization records have declared data fields. Fresh result records in these paths use native object literals; public payload field names remain unchanged. Differential tests cover inherited setters, subclass overrides, evaluation order and the parser's variadic arguments, arity and constructibility. Host dictionaries and public instances are not treated as private records.

## Try the SDK preview

Download [`itslil-posthog-browser-1.435.8-lil.0.tgz`](https://yeargun.github.io/posthoglil/downloads/itslil-posthog-browser-1.435.8-lil.0.tgz), then install it under the existing dependency name:

```sh
npm install posthog-js@file:./itslil-posthog-browser-1.435.8-lil.0.tgz
```

```ts
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'

posthog.init('your-project-token', { api_host: 'https://us.i.posthog.com' })
posthog.capture('checkout', { plan: 'pro' })
```

The package is an **unpublished experimental preview**, not an official PostHog release or a recommended size upgrade. Its default root and `posthog-js/full/no-external` entries use the Brotli-targeted candidate. ESM and CommonJS are provided. The package retains the exact canonical upstream `dist/module.d.ts`; React, full and root declarations share that class identity. Install under `posthog-js` so upstream React imports resolve to the same singleton. Other subpaths retain the upstream runtime bytes and make no optimization claim. `SDK-BUILD.json` inside the tarball lists all replaced files; rebuilt source maps accompany every replaced ESM/CJS file, including embedded upstream TypeScript and compiled LilScript JavaScript. Mapping back to LilScript source is not supplied.

## Compatibility evidence

- 480 selected, unmodified upstream tests pass for each of raw, gzip and Brotli; the upstream baseline passes the same suites.
- 59 utility/API checks, including constructor reflection, inherited setters, host subclassing and variadic parser calls.
- 24 named-import checks: esbuild and Rolldown remove unrelated utility code and execute the selected export for each raw/gzip/Brotli objective.
- Six paired browser journeys: matching public exports/methods, loaded callbacks, flags, identify, groups, consent, capture hooks and event payloads.
- Identity survives reload; reset and named-instance isolation are checked.
- Autocapture and exceptions reach a local HTTP collector. Passwords and no-capture controls are excluded.
- Real recorder full snapshots and DOM mutations are received and decoded; password checks also inspect compressed replay payloads.
- Standard SDK works with the published lazy recorder. Full/no-external records without fetching a recorder script.
- Batching and an HTTP 503 retry preserve event IDs and properties in the Brotli SDKs.
- Packed tarball: CommonJS, React provider/hooks, SSR, strict TypeScript and byte-identical canonical upstream declarations and rebuilt ESM/CJS source maps.

Selected upstream suites, targeted differential/ABI tests and browser journeys. This is not the entire PostHog test suite or a cross-browser certification. Hosted PostHog ingestion, every optional feature, canvas recording, CSP variants and Firefox/WebKit are not certified by these tests. Recordings are tested against a local collector and decoded to verify actual DOM data and password masking.

Public names, configuration keys and event payloads remain API boundaries. Only private SDK linker exports can lose function names. Standalone utility constructors retain their names, arity, prototypes, descriptors and host subclassing behavior. Exported constructors use LilScript's native constructor boundary. Dynamic host objects are not treated as freely renameable closed-world records.

## Reproduce

Use the committed lockfile and submodule. Builds are sequential; do not launch multiple compiler commands together. Recompilation needs the LilScript executable matching SHA-256 `8ff44fabb92c949e68240ce6541038fd52e2f3c04d1a9ac470031e4238541c3a` and the canonical codec executable. The compiler was rebuilt from the current workspace, then its fingerprint was checked again after validation.

```sh
git submodule update --init
npm ci
export LILSCRIPT_COMPILER=/path/to/lilscript
export LILSCRIPT_CODEC=/path/to/lilscript-codec
npm run build
npx playwright install chromium
npm run test:all
npm run measure:runtime
npm run write:results
node scripts/write-docs.mjs
npm run check:site
```

`npm run build` compiles the standalone raw/gzip/Brotli utilities, discovers live internal SDK exports, compiles the SDK objectives, measures the unchanged original lanes and prepares the SDK tarball. Utility ESM, CJS and browser wrappers come from compiler delivery manifests. SDK assembly/minification and its CJS format adaptation are separately identified. The SDK browser target follows upstream's ES2015/browser targets; tests currently use Chromium only.

`npm run test:all` works from committed generated artifacts without the compiler. It runs utility checks, the selected upstream suites, real browser journeys and the packed React/TypeScript consumer. Runtime benchmarking is separate so correctness checks do not compete for CPU during timing. Test source and raw receipts are available for inspection. Use the recorded compiler fingerprint when reproducing the compilation.

## Sponsorship

Sponsorship would fund further compiler work and broader compatibility/performance validation. The evidence supports useful standalone utility savings, tested named imports and a working integration prototype. Substantial complete SDK savings and general performance claims require further evidence. [Discuss an integration trial or sponsorship](https://github.com/yeargun/posthoglil/issues).

Independent work by yeargun. No affiliation with or endorsement by PostHog is implied. See [NOTICE](NOTICE.md), [LICENSE](LICENSE) and [dependency licenses](licenses).
