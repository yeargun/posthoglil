# PostHog × LilScript

One installable browser SDK with the same application imports, React bindings and canonical TypeScript declarations as **posthog-js 1.435.8**. The complete **full/no-external** entry saves **11.34–15.10% raw, 4.79–7.43% gzip9, 4.01–6.07% brotli11** in the two tested application bundlers. These are measurements of one fixed package runtime, not different packages selected for each codec.

**Status:** downloadable release candidate; not published to npm. All 14 optimized application/bundler cases are smaller in raw, gzip and Brotli. Four unchanged-entry cases equal the original. Runtime: **16/16 workloads meet the predeclared 2% non-regression bound** at one-sided 95% confidence. That bound applies only to the measured workloads. The standard SDK has smaller gains, particularly after Rolldown minification; see every result below.

[Interactive results and download](https://yeargun.github.io/posthoglil/) · [Installed-package measurements](artifacts/sdk-consumers/results.json) · [Runtime samples](artifacts/sdk-consumers/performance.json) · [Validation](artifacts/sdk/validation.json)

## The package in a web application

Each side installs the real tarball under the same dependency key, `posthog-js`, and builds identical source with esbuild 0.28.2 or Rolldown 1.2.12, normal tree shaking, ES2020 and production settings. The original is the exact npm release. All three sizes in a row measure the same output: raw bytes, gzip level 9 and Brotli quality 11/window 22. Optional source maps are excluded.

| SDK | App bundler | Format | Original npm app | PostHog Lil app | Difference |
| --- | --- | --- | ---: | ---: | --- |
| standard | esbuild | raw | 312,504 | 292,463 | 6.41% smaller |
| standard | esbuild | gzip9 | 102,125 | 98,663 | 3.39% smaller |
| standard | esbuild | brotli11 | 86,875 | 84,337 | 2.92% smaller |
| standard | rolldown | raw | 293,271 | 292,144 | 0.38% smaller |
| standard | rolldown | gzip9 | 95,897 | 95,792 | 0.11% smaller |
| standard | rolldown | brotli11 | 81,756 | 81,541 | 0.26% smaller |
| full | esbuild | raw | 709,218 | 602,093 | 15.10% smaller |
| full | esbuild | gzip9 | 214,275 | 198,351 | 7.43% smaller |
| full | esbuild | brotli11 | 178,681 | 167,831 | 6.07% smaller |
| full | rolldown | raw | 677,750 | 600,908 | 11.34% smaller |
| full | rolldown | gzip9 | 201,016 | 191,386 | 4.79% smaller |
| full | rolldown | brotli11 | 167,897 | 161,163 | 4.01% smaller |

The standard entry is the initial analytics client; optional extension downloads are additional. The full entry embeds the upstream full/no-external feature set, including replay, surveys, logs, exception autocapture, tracing headers, web vitals and dead clicks. Product tours, conversations, toolbar and chat integrations are not embedded. No feature is removed to obtain these figures.

The SDK combines typed LilScript internals with upstream client, transport, persistence, UI and recorder implementations. Generic bundling and minification account for much of the saving; the stricter source control below discloses the additional contribution from LilScript replacements. The upstream source submodule is unchanged, pinned at [`c9d890a4028b186a5e1b327161ea197001c0c46b`](https://github.com/PostHog/posthog-js/tree/c9d890a4028b186a5e1b327161ea197001c0c46b).

## Install without application changes

Download [`itslil-posthog-browser-1.435.8-lil.1.tgz`](https://yeargun.github.io/posthoglil/downloads/itslil-posthog-browser-1.435.8-lil.1.tgz), then:

```sh
npm install posthog-js@file:./itslil-posthog-browser-1.435.8-lil.1.tgz
```

```ts
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'

posthog.init('your-project-token', { api_host: 'https://us.i.posthog.com' })
posthog.capture('checkout', { plan: 'pro' })
```

Installing under `posthog-js` keeps upstream React imports on the same singleton. Only the root and `posthog-js/full/no-external` runtimes are replaced. Other subpaths keep upstream runtime bytes. ESM and CommonJS, the original package layout and exact canonical `dist/module.d.ts` are retained. `SDK-BUILD.json` lists replacements. Rebuilt source maps cover replaced ESM/CJS files, with embedded upstream TypeScript and compiled LilScript JavaScript; they do not map back to LilScript source.

The existing `@itslil/posthog-js` utility package has a separate API. The complete browser package is `@itslil/posthog-browser`; this candidate is available as a tarball and is not yet on the npm registry. It is an independent project, not an official PostHog release.

## Tree shaking

Nine application fixtures run through both bundlers: default SDK, constructor only, full SDK, side-effect import, one React hook, all React exports, React slim, no-external and dynamic import. Browser checks exercise the resulting modules.

Unused React exports are removed. `react/slim` stays independent of the SDK. Dynamic import leaves a small initial wrapper and loads the SDK chunk only on demand. The original SDK initializes its singleton on import, so even a constructor-only import retains most of the client; this behavior is preserved. No `sideEffects: false` override is applied.

[All fixtures, chunk sizes, hashes and build times](artifacts/sdk-consumers/results.json) · [Consumer tests](test/sdk-consumers.mjs)

## Runtime of the installed package

80 measured pairs and 2 warmup pairs per SDK/bundler, with alternating original/candidate order and fresh Chromium 139.0.7258.5 contexts. Run on Intel(R) Xeon(R) 6973P-C in isolated GitHub Actions job, with fine-grained timers on a cross-origin-isolated local origin. An identical-artifact control records measurement noise separately. Positive improvement means faster. Brackets give the paired bootstrap 95% interval. The last column checks a predeclared one-sided 95% upper bound below 2% slowdown; it does not claim identical performance in every application.

| SDK / app bundler | Workload | Original median | Candidate median | Improvement [95% interval] | 2% bound |
| --- | --- | ---: | ---: | --- | --- |
| standard / esbuild | Parse + evaluate | 15.96 ms | 15.85 ms | 1.4% [-0.6, 2.9] | Pass |
| standard / esbuild | Initialize | 4.58 ms | 4.50 ms | 1.5% [-0.9, 3.5] | Pass |
| standard / esbuild | Queue 1,000 events | 144.11 ms | 141.87 ms | 1.6% [0.6, 3.1] | Pass |
| standard / esbuild | Queue 100 exceptions | 18.20 ms | 15.22 ms | 18.0% [14.5, 20.5] | Pass |
| standard / rolldown | Parse + evaluate | 16.20 ms | 16.31 ms | -0.9% [-2.1, 2.5] | Pass |
| standard / rolldown | Initialize | 4.45 ms | 4.46 ms | -0.4% [-1.3, 1.4] | Pass |
| standard / rolldown | Queue 1,000 events | 141.56 ms | 142.59 ms | -0.8% [-2.3, 0.5] | Pass |
| standard / rolldown | Queue 100 exceptions | 17.73 ms | 15.05 ms | 16.5% [14.3, 17.7] | Pass |
| full / esbuild | Parse + evaluate | 24.71 ms | 24.14 ms | 2.5% [0.9, 4.9] | Pass |
| full / esbuild | Initialize | 4.58 ms | 4.52 ms | 0.9% [0.1, 2.1] | Pass |
| full / esbuild | Queue 1,000 events | 143.14 ms | 143.55 ms | 0.4% [-1.2, 1.5] | Pass |
| full / esbuild | Queue 100 exceptions | 18.17 ms | 15.48 ms | 18.8% [15.0, 20.6] | Pass |
| full / rolldown | Parse + evaluate | 25.73 ms | 24.77 ms | 3.5% [2.3, 5.2] | Pass |
| full / rolldown | Initialize | 4.57 ms | 4.53 ms | 1.0% [0.3, 2.0] | Pass |
| full / rolldown | Queue 1,000 events | 142.14 ms | 142.88 ms | 0.1% [-1.5, 1.4] | Pass |
| full / rolldown | Queue 100 exceptions | 17.92 ms | 15.63 ms | 15.8% [11.6, 17.7] | Pass |

Import measures parsing, evaluation and module scheduling from a fresh Blob URL, excluding transfer. Init uses memory persistence, autocapture, bootstrapped flags and disabled recording. Capture measures synchronous preparation and queueing after warmup; every trial asserts all 1,000 events were accepted. Exceptions use 100 preconstructed simple errors, caused errors and aggregates with fixed stacks; all 100 events must be accepted. Upload, ingestion and replay processing are not timed. These are scoped microbenchmarks, not end-user latency guarantees.

[Every sample and methodology](artifacts/sdk-consumers/performance.json) · [Separate compiler-objective timings against optimized-original controls](artifacts/sdk/performance.json)

## The original with the same optimizations

This comparison applies the same source bundling and delivery tooling to the unchanged original. Each row uses an independent raw-, gzip- or Brotli-targeted LilScript compilation. The original is the smallest for that codec among the published npm file, Terser, Oxc, esbuild, both Terser/Oxc orders, Oxc plus private-property mangling, and raw literal-pooling alternatives. These are research artifacts; the installable package above has one fixed runtime per entry.

| SDK | Objective | Minified original | LilScript candidate | Difference | Original lane |
| --- | --- | ---: | ---: | --- | --- |
| standard | raw | 263,722 | 262,261 | 0.55% smaller | terser-oxc-pooled |
| standard | gzip | 96,534 | 96,394 | 0.15% smaller | terser-oxc |
| standard | brotli | 82,183 | 81,981 | 0.25% smaller | terser-oxc |
| full | raw | 539,954 | 538,366 | 0.29% smaller | oxc-private-pooled |
| full | gzip | 194,007 | 193,750 | 0.13% smaller | oxc-private |
| full | brotli | 163,131 | 163,015 | 0.07% smaller | oxc-private |

Dependency aliases are shared only after identical package versions and file hashes are verified. Property mangling preserves protocol keys, cross-bundle hooks and injected release/chunk IDs. The installable package shares repeated string values while keeping named member accesses intact; it introduces no decoder or eval. This additional delivery pass is also measured on unchanged source in [the package-runtime receipt](artifacts/package-runtime/results.json).

Private encoder, traversal, cycle, serialization and breadcrumb records expose typed storage to the compiler. Public payload keys and constructor contracts remain intact; dynamic host objects are not treated as private records. Upstream implementations remain where the complete linked result is smaller.

## Build time

Application build times below use the same installed dependencies and bundler settings. Each is a single measured run, so warmup and machine noise can affect comparisons.

| SDK / app bundler | Original app build | Candidate app build |
| --- | ---: | ---: |
| standard / esbuild | 0.065 s | 0.041 s |
| standard / rolldown | 0.090 s | 0.058 s |
| full / esbuild | 0.099 s | 0.081 s |
| full / rolldown | 0.175 s | 0.143 s |

Compiler-objective times include compilation, source bundling and the selected minifier. Original times use the matching source bundler/minifier. Filesystem caches are warm and compiler caching is disabled. Installation, lane search, declarations, packaging and final transport compression are excluded. The npm publisher's build time is unknown.

| SDK | Objective | Matching original pipeline | Candidate pipeline |
| --- | --- | ---: | ---: |
| standard | raw | 3.692 s | 4.254 s |
| standard | gzip | 2.449 s | 2.893 s |
| standard | brotli | 2.449 s | 3.000 s |
| full | raw | 5.711 s | 6.293 s |
| full | gzip | 2.210 s | 2.615 s |
| full | brotli | 2.210 s | 2.715 s |

## Compatibility evidence

- 545 selected, unmodified upstream tests pass for each of raw, gzip and Brotli; the upstream baseline passes the same suites.
- 62 utility/API checks, including constructor reflection, inherited setters, host subclassing and variadic parser calls.
- 24 named-import checks: esbuild and Rolldown remove unrelated utility code and execute the selected export for each raw/gzip/Brotli objective.
- 30 default error-pipeline differential checks pass for each of six SDK linker artifacts, including cyclic causes, aggregate limits, getters, host coercion boundaries and exception inspection order.
- Eight private breadcrumb-buffer checks pass for each of six SDK linker artifacts, including nontruncated encoder lengths, UTF-8 limits, serialization/getter effects, configuration changes and mixed add/clear transitions.
- Eleven delivery-transform checks preserve quoted protocol keys, public property access, Proxy traps, evaluation order, super calls, template literals and direct-eval boundaries.
- Six SDK browser comparisons against both the exact published npm SDK and the optimized original: matching public exports/methods, loaded callbacks, flags, identify, groups, consent, capture hooks and event payloads.
- Identity survives reload; reset and named-instance isolation are checked.
- Autocapture and exceptions reach a local HTTP collector. Passwords and no-capture controls are excluded.
- Real recorder full snapshots and DOM mutations are received and decoded; password checks also inspect compressed replay payloads.
- Standard SDK works with the published lazy recorder. Full/no-external records without fetching a recorder script.
- All four full-SDK Web Vitals callback flavors emit a real First Contentful Paint metric; attribution is checked. Injected release IDs and chunk IDs reach exception payloads.
- The full SDK renders an actual survey form, accepts text input and sends the matching response to the collector.
- Batching and an HTTP 503 retry preserve event IDs and properties in the Brotli SDKs.
- Packed tarball: CommonJS, React provider/hooks, SSR, strict TypeScript and byte-identical canonical upstream declarations and rebuilt ESM/CJS source maps.
- Nine unchanged application fixtures built with both esbuild and Rolldown: one installed package is smaller in raw/gzip/Brotli for all 14 optimized cases; four unchanged-entry cases match the original exactly.
- Real package tree shaking: unused React exports are removed, react/slim remains independent, and dynamic import defers the SDK chunk. Singleton initialization is preserved without overriding sideEffects.
- Four additional browser journeys run the installed and rebundled standard/full SDKs, checking API and event parity, persistence, replay payloads, surveys and web vitals.

Selected upstream suites, targeted differential/ABI tests and browser journeys. This is not the entire PostHog test suite or a cross-browser certification. Hosted ingestion, every optional feature, canvas recording, CSP variants and Firefox/WebKit are not certified. Recorder tests use a local collector, decode real snapshots/mutations and inspect password masking, including compressed payloads.

## Standalone utilities

These savings cover each listed utility export surface, not the complete SDK. The kernel includes explicitly extracted router, queue and rate-limit helper contracts. Each row is compared with minified pinned upstream code.

| Utility group | Raw objective | gzip objective | Brotli objective |
| --- | --- | --- | --- |
| Utility kernel | 10.60% smaller | 14.04% smaller | 14.91% smaller |
| Survey utilities | 2.32% smaller | 10.86% smaller | 11.85% smaller |
| Error tracking | 0.78% larger | 0.97% larger | 2.00% larger |
| OTLP encoders | 14.97% smaller | 11.85% smaller | 11.55% smaller |
| Autocapture utilities | 17.89% smaller | 21.05% smaller | 21.05% smaller |
| Replay configuration and buffers | 15.67% smaller | 16.54% smaller | 15.61% smaller |

[Utility sizes and build costs](artifacts/utilities/results.json) · [24 named-import comparisons across two bundlers and three objectives](artifacts/tree-shaking/results.json). Standalone constructors preserve names, arity, prototypes, descriptors and subclassing behavior. Utility percentages are not SDK savings.

## Reproduce

Builds are sequential. Use the committed lockfile, pinned submodule, LilScript executable with SHA-256 `8ff44fabb92c949e68240ce6541038fd52e2f3c04d1a9ac470031e4238541c3a`, and the canonical codec executable.

```sh
git submodule update --init
npm ci
export LILSCRIPT_COMPILER=/path/to/lilscript
export LILSCRIPT_CODEC=/path/to/lilscript-codec
npm run build
npm run measure:sdk-consumers
npx playwright install chromium
npm run test:all
npm run measure:runtime
npm run measure:consumer-runtime
npm run write:results
node scripts/write-docs.mjs
npm run check:site
```

The compiler produces utility ESM/CJS/browser formats and the SDK's internal replacements. SDK assembly, delivery minification and CJS adaptation are separately recorded. `test:all` runs from committed compiler artifacts, rebuilding application bundles from the actual tarball; it does not need the closed compiler. Runtime timing is separate from correctness tests to avoid CPU contention.

## Sponsorship

Sponsorship would fund compiler work and broader SDK compatibility and performance testing. The evidence above distinguishes measured npm-package savings, optimized-original controls and runtime limitations. [Discuss an integration trial or sponsorship](https://github.com/yeargun/posthoglil/issues).

Independent work by yeargun. No affiliation with or endorsement by PostHog is implied. See [NOTICE](NOTICE.md), [LICENSE](LICENSE) and [dependency licenses](licenses).
