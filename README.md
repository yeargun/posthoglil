# PostHog × LilScript

A complete browser SDK integration experiment, plus standalone utility ports, pinned to **posthog-js 1.435.8** at [`c9d890a4028b186a5e1b327161ea197001c0c46b`](https://github.com/PostHog/posthog-js/tree/c9d890a4028b186a5e1b327161ea197001c0c46b). The upstream source submodule is unmodified. The npm latest tag was checked on 2026-10-03.

**Complete SDK savings against the exact published PostHog package: 18.48–23.55% raw, 4.45–7.37% gzip, 3.77–5.80% Brotli.** Each format has its own compilation objective. Browser, package and API checks are listed below. The matching optimizations also make the original source smaller, so the stricter control comparison is shown separately: 6 of the six SDK objectives are smaller than the strongest minified original; inspect each scope and objective below. These delivery gains do not establish a general runtime speedup.

**100-exception workload, default Brotli builds:** standard: 6.0% faster (paired 95% interval 3.7% to 10.6%); full: 6.5% faster (paired 95% interval 5.1% to 7.1%), versus the strongest optimized original. Import, initialization and event-capture results appear in the runtime section.

[Interactive results and preview](https://yeargun.github.io/posthoglil/) · [SDK receipts](artifacts/sdk/results.json) · [Runtime samples](artifacts/sdk/performance.json) · [Validation](artifacts/sdk/validation.json)

## Complete SDK versus published PostHog

Both originals below are the exact minified files shipped by `posthog-js 1.435.8` on npm. Each candidate is independently compiled for raw, gzip-9 or Brotli-11; these are different candidate files. Numbers are bytes, including source-map URL comments and excluding optional map downloads.

| SDK | Objective | Original npm | Candidate | Difference |
| --- | --- | ---: | ---: | --- |
| standard | raw | 322,471 | 262,880 | 18.48% smaller |
| standard | gzip | 100,934 | 96,445 | 4.45% smaller |
| standard | brotli | 85,272 | 82,060 | 3.77% smaller |
| full | raw | 725,043 | 554,277 | 23.55% smaller |
| full | gzip | 209,218 | 193,793 | 7.37% smaller |
| full | brotli | 173,119 | 163,086 | 5.80% smaller |

## Strongest optimized original control

This stricter control applies the same bundling and delivery optimizations to the unchanged original source. For each codec it selects the smallest of the npm file, Terser, Oxc, esbuild, both Terser/Oxc orders, Oxc plus private-property mangling, and raw literal-pooling alternatives. It isolates how much the LilScript source replacements add beyond generic tooling. Small differences here must not be confused with the larger savings against the published package.

| SDK | Objective | Minified original | Candidate | Difference | Winning original |
| --- | --- | ---: | ---: | --- | --- |
| standard | raw | 264,327 | 262,880 | 0.55% smaller | oxc-terser-pooled |
| standard | gzip | 96,534 | 96,445 | 0.09% smaller | terser-oxc |
| standard | brotli | 82,183 | 82,060 | 0.15% smaller | terser-oxc |
| full | raw | 555,933 | 554,277 | 0.30% smaller | oxc-private-pooled |
| full | gzip | 194,007 | 193,793 | 0.11% smaller | oxc-private |
| full | brotli | 163,131 | 163,086 | 0.03% smaller | oxc-private |

The standard row is the initial client: optional extension downloads are additional. The full row is upstream's **full/no-external** entry. It embeds replay, surveys, logs, exception autocapture, tracing headers, web vitals and dead clicks; product tours, conversations, toolbar and chat integrations are not embedded. No extra recorder script is fetched in the full browser test.

The receipt includes every minifier lane, all three codec sizes per artifact, SHA-256 hashes and the same-pipeline comparison. Generic bundler/minifier gains are not attributed to LilScript. The SDK mixes qualified LilScript internals with upstream client, transport, persistence, UI and recorder code; it is not a complete rewrite of every SDK implementation.

The delivery pipeline shares dependency aliases only after verifying identical package versions and file hashes. Private-property mangling preserves protocol keys and cross-bundle hooks. Literal pooling is used only for the raw objective and retains property spellings; it adds no decoder or eval. Each alternative is measured before selection.

The SDK integration retains upstream implementations where the complete linked result is smaller. All standalone utility ports remain available and tested. The default exception pipeline uses private typed records and direct calls; its public exception payloads and the standalone constructor API are preserved. The SDK-owned breadcrumb buffer keeps its state in a closure; the public utility class retains its constructor and prototype. Dynamic host objects remain explicit API boundaries.

## Runtime

Each candidate is timed against its strongest optimized-original control. 15 measured pairs plus 2 warmup pairs per surface/objective; alternating order, fresh browser contexts, Chromium 139.0.7258.5. The table shows the default Brotli builds. Positive paired improvement means faster; an interval spanning zero supports no clear difference. These are exploratory microbenchmarks, not end-user latency guarantees.

| SDK | Workload | Original median | Candidate median | Paired result |
| --- | --- | ---: | ---: | --- |
| standard | importMs | 21.90 ms | 21.40 ms | no clear difference; paired 95% interval -1.9% to 1.7% |
| standard | initMs | 6.20 ms | 6.10 ms | no clear difference; paired 95% interval -1.7% to 4.6% |
| standard | capture1000Ms | 264.80 ms | 260.80 ms | no clear difference; paired 95% interval -2.6% to 0.7% |
| standard | exception100Ms | 31.60 ms | 29.90 ms | faster in this workload; paired 95% interval 3.7% to 10.6% |
| full | importMs | 33.50 ms | 33.70 ms | no clear difference; paired 95% interval -1.8% to 0.9% |
| full | initMs | 6.10 ms | 6.20 ms | no clear difference; paired 95% interval -4.9% to 1.6% |
| full | capture1000Ms | 256.60 ms | 257.90 ms | no clear difference; paired 95% interval -1.6% to 4.1% |
| full | exception100Ms | 31.10 ms | 29.10 ms | faster in this workload; paired 95% interval 5.1% to 7.1% |



Import times include parse, evaluation and module scheduling from a fresh Blob URL, excluding source download. Init uses memory persistence, autocapture, bootstrapped flags and disabled recording. Capture times cover preparation and queueing of 1,000 events after 100 warmup calls; each sample asserts 1,000 accepted events. The exception workload prepares and queues 100 preconstructed simple errors, caused errors and aggregates after 20 warmups, and asserts 100 accepted exception events. Upload, ingestion and replay processing are not timed. Assess each workload's paired interval; these measurements do not establish a general application speedup.

## Build time

One measured run per stage, warm filesystem and compiler cache disabled. Candidate time includes compilation, source bundling and its selected minifier. Original time is the same source bundler and the candidate's selected minifier; the npm publisher's build time is unknown. Installation, lane search, declarations, packaging and transport compression are excluded. Different output scopes are not presented as build speedups.

| SDK | Objective | Matching original pipeline | Candidate pipeline |
| --- | --- | ---: | ---: |
| standard | raw | 3.143 s | 3.881 s |
| standard | gzip | 2.418 s | 2.838 s |
| standard | brotli | 2.418 s | 2.866 s |
| full | raw | 4.871 s | 5.575 s |
| full | gzip | 2.137 s | 2.658 s |
| full | brotli | 2.137 s | 2.665 s |

## Standalone utilities

These percentages cover the listed utility exports, not the SDK. The utility kernel includes explicitly extracted router, queue and rate-limit helper contracts. Other fixtures re-export the pinned upstream modules. See [utility receipts](artifacts/utilities/results.json) for bytes, per-objective build costs and original minifier lanes.

| Utility group | Raw objective | gzip objective | Brotli objective |
| --- | --- | --- | --- |
| Utility kernel | 10.60% smaller | 14.03% smaller | 14.33% smaller |
| Survey utilities | 2.32% smaller | 10.86% smaller | 11.85% smaller |
| Error tracking | 1.29% larger | 1.53% larger | 1.20% larger |
| OTLP encoders | 14.93% smaller | 11.82% smaller | 11.66% smaller |
| Autocapture utilities | 17.89% smaller | 21.05% smaller | 21.05% smaller |
| Replay configuration and buffers | 15.67% smaller | 16.54% smaller | 15.61% smaller |

The utility package API remains `@itslil/posthog-js` with `surveys`, `error-tracking`, `otlp`, `autocapture` and `replay-core` subpaths. Repository artifacts are refreshed; this task does not publish a new utility npm release. The separate SDK preview below preserves the PostHog client API.

## Named imports and tree shaking

These consumers import one helper from the complete utility ESM artifact, then bundle and minify with esbuild. Each source artifact has its own raw/gzip/Brotli compilation objective. The baseline is the smallest original consumer for that codec across the original minifier lanes. Numbers are bytes. [Consumer receipts and downloadable bundles](artifacts/tree-shaking/results.json) also cover Rolldown/Oxc.

| Named import | Objective | Minified original consumer | LilScript consumer | Difference |
| --- | --- | ---: | ---: | --- |
| clampToRange | raw | 2,302 | 1,253 | 45.57% smaller |
| clampToRange | gzip | 989 | 621 | 37.21% smaller |
| clampToRange | brotli | 864 | 531 | 38.54% smaller |
| getUtf8ByteLength | raw | 1,514 | 351 | 76.82% smaller |
| getUtf8ByteLength | gzip | 685 | 266 | 61.17% smaller |
| getUtf8ByteLength | brotli | 599 | 224 | 62.60% smaller |
| msToUnixNano | raw | 1,505 | 203 | 86.51% smaller |
| msToUnixNano | gzip | 669 | 165 | 75.34% smaller |
| msToUnixNano | brotli | 591 | 152 | 74.28% smaller |
| effectivePayloadLimitBytes | raw | 2,478 | 255 | 89.71% smaller |
| effectivePayloadLimitBytes | gzip | 1,141 | 205 | 82.03% smaller |
| effectivePayloadLimitBytes | brotli | 1,019 | 188 | 81.55% smaller |

24 execution and elimination checks cover four named imports, two bundlers and three objectives. No side-effect override is applied: observable initialization, including the kernel's campaign-property array spread, remains. The default utility API is a native object literal, and the variadic stack-parser factory has no effectful reflection initializer. Unused functions can be discarded without changing the public API. These consumer sizes are not complete SDK savings.

Private encoder, traversal, stack-cycle and serialization records have declared data fields. Fresh result records in these paths use native object literals; public payload field names remain unchanged. Differential tests cover inherited setters, subclass overrides, evaluation order and the parser's variadic arguments, arity and constructibility. Host dictionaries and public instances are not treated as private records.

## Try the SDK preview

Download [`itslil-posthog-browser-1.435.8-lil.1.tgz`](https://yeargun.github.io/posthoglil/downloads/itslil-posthog-browser-1.435.8-lil.1.tgz), then install it under the existing dependency name:

```sh
npm install posthog-js@file:./itslil-posthog-browser-1.435.8-lil.1.tgz
```

```ts
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'

posthog.init('your-project-token', { api_host: 'https://us.i.posthog.com' })
posthog.capture('checkout', { plan: 'pro' })
```

The package is an **unpublished experimental preview**, not an official PostHog release. Its default root and `posthog-js/full/no-external` entries use the Brotli-targeted candidate. ESM and CommonJS are provided. The package retains the exact canonical upstream `dist/module.d.ts`; React, full and root declarations share that class identity. Install under `posthog-js` so upstream React imports resolve to the same singleton. Other subpaths retain the upstream runtime bytes and make no optimization claim. `SDK-BUILD.json` inside the tarball lists all replaced files; rebuilt source maps accompany every replaced ESM/CJS file, including embedded upstream TypeScript and compiled LilScript JavaScript. Mapping back to LilScript source is not supplied.

## Compatibility evidence

- 545 selected, unmodified upstream tests pass for each of raw, gzip and Brotli; the upstream baseline passes the same suites.
- 62 utility/API checks, including constructor reflection, inherited setters, host subclassing and variadic parser calls.
- 24 named-import checks: esbuild and Rolldown remove unrelated utility code and execute the selected export for each raw/gzip/Brotli objective.
- 28 default error-pipeline differential checks pass for each of six SDK linker artifacts, including cyclic causes, aggregate limits, getters and exception inspection order.
- Seven private breadcrumb-buffer checks pass for each of six SDK linker artifacts, including UTF-8 limits, serialization/getter effects, configuration changes and mixed add/clear transitions.
- Nine delivery-transform checks preserve quoted protocol keys, public property access, Proxy traps, evaluation order, super calls and direct-eval boundaries.
- Six SDK browser comparisons against both the exact published npm SDK and the optimized original: matching public exports/methods, loaded callbacks, flags, identify, groups, consent, capture hooks and event payloads.
- Identity survives reload; reset and named-instance isolation are checked.
- Autocapture and exceptions reach a local HTTP collector. Passwords and no-capture controls are excluded.
- Real recorder full snapshots and DOM mutations are received and decoded; password checks also inspect compressed replay payloads.
- Standard SDK works with the published lazy recorder. Full/no-external records without fetching a recorder script.
- All four full-SDK Web Vitals callback flavors emit a real First Contentful Paint metric; attribution is checked. Injected release IDs and chunk IDs reach exception payloads.
- The full SDK renders an actual survey form, accepts text input and sends the matching response to the collector.
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

`npm run build` compiles the standalone raw/gzip/Brotli utilities, discovers live internal SDK exports, compiles the SDK objectives, measures the unchanged original lanes and prepares the SDK tarball. Utility ESM, CJS and browser wrappers come from compiler delivery manifests. SDK assembly/minification and its CJS format adaptation are separately identified. SDK linker inputs use effort 8 after an effort sweep; standalone utility builds use effort 13. The SDK browser target follows upstream's ES2015/browser targets; tests currently use Chromium only.

`npm run test:all` works from committed generated artifacts without the compiler. It runs utility checks, the selected upstream suites, real browser journeys and the packed React/TypeScript consumer. Runtime benchmarking is separate so correctness checks do not compete for CPU during timing. Test source and raw receipts are available for inspection. Use the recorded compiler fingerprint when reproducing the compilation.

## Sponsorship

Sponsorship would fund further compiler work and broader compatibility/performance validation. The evidence covers complete SDK savings against the published package, separately disclosed optimized-original controls, tested named imports and a working integration prototype. Broad runtime speedup claims require further evidence. [Discuss an integration trial or sponsorship](https://github.com/yeargun/posthoglil/issues).

Independent work by yeargun. No affiliation with or endorsement by PostHog is implied. See [NOTICE](NOTICE.md), [LICENSE](LICENSE) and [dependency licenses](licenses).
