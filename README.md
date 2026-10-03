# PostHog × LilScript

A complete browser SDK integration experiment, plus standalone utility ports, pinned to **posthog-js 1.435.8** at [`c9d890a4028b186a5e1b327161ea197001c0c46b`](https://github.com/PostHog/posthog-js/tree/c9d890a4028b186a5e1b327161ea197001c0c46b). The upstream source submodule is unmodified. The npm latest tag was checked on 2026-10-03.

**The full-SDK experiment works in the tested browser journeys, but it has not established a size or general performance win.** Against the strongest minified original, the candidate is approximately 0.5–1.4% larger across the SDK objectives below. Five standalone utility groups have compression wins; error tracking is larger. These are different scopes.

[Interactive results and preview](https://yeargun.github.io/posthoglil/) · [SDK receipts](artifacts/sdk/results.json) · [Runtime samples](artifacts/sdk/performance.json) · [Validation](artifacts/sdk/validation.json)

## Complete SDK size

Each candidate is independently compiled for its named objective. The baseline is the smallest original for that codec among the exact npm artifact and the unchanged pinned source bundled through Terser, Oxc and esbuild. Numbers are bytes. Raw, gzip-9 and Brotli-11 rows refer to different, separately targeted candidate files.

| SDK | Objective | Minified original | Candidate | Difference | Winning original |
| --- | --- | ---: | ---: | --- | --- |
| standard | raw | 322,471 | 326,376 | 1.21% larger | published |
| standard | gzip | 100,934 | 102,339 | 1.39% larger | published |
| standard | brotli | 85,267 | 86,472 | 1.41% larger | terser |
| full | raw | 705,672 | 709,154 | 0.49% larger | oxc |
| full | gzip | 202,948 | 204,346 | 0.69% larger | oxc |
| full | brotli | 169,302 | 170,998 | 1.00% larger | oxc |

The standard row is the initial client: optional extension downloads are additional. The full row is upstream's **full/no-external** entry. It embeds replay, surveys, logs, exception autocapture, tracing headers, web vitals and dead clicks; product tours, conversations, toolbar and chat integrations are not embedded. No extra recorder script is fetched in the full browser test.

The receipt includes every minifier lane, all three codec sizes per artifact, SHA-256 hashes and the same-pipeline comparison. Generic bundler/minifier gains are not attributed to LilScript. The SDK mixes qualified LilScript internals with upstream client, transport, persistence, UI and recorder code; it is not a complete rewrite of every SDK implementation.

## Runtime

15 measured pairs plus 2 warmup pairs per surface/objective; alternating order, fresh browser contexts, Chromium 139.0.7258.5. The table shows the default Brotli builds. Positive paired improvement means faster; an interval spanning zero supports no clear difference. These are exploratory microbenchmarks, not end-user latency guarantees.

| SDK | Workload | Original median | Candidate median | Paired result |
| --- | --- | ---: | ---: | --- |
| standard | importMs | 21.60 ms | 21.90 ms | no clear difference; paired 95% interval -3.0% to 0.9% |
| standard | initMs | 6.10 ms | 6.20 ms | no clear difference; paired 95% interval -4.9% to 1.6% |
| standard | capture1000Ms | 258.70 ms | 256.70 ms | no clear difference; paired 95% interval -1.2% to 1.9% |
| full | importMs | 35.80 ms | 35.70 ms | no clear difference; paired 95% interval -0.8% to 1.4% |
| full | initMs | 6.10 ms | 6.20 ms | no clear difference; paired 95% interval -1.7% to 3.1% |
| full | capture1000Ms | 254.70 ms | 253.90 ms | no clear difference; paired 95% interval -3.3% to 1.3% |

Import times include parse, evaluation and module scheduling from a fresh Blob URL, excluding source download. Init uses memory persistence, autocapture, bootstrapped flags and disabled recording. Capture times cover preparation and queueing of 1,000 events after 100 warmup calls; each sample asserts 1,000 accepted events. Upload, ingestion and replay processing are not timed. The results do not support a consistent event-processing speedup.

## Build time

One measured run per stage, warm filesystem and compiler cache disabled. Candidate time includes compilation, source bundling and its selected minifier. Original time is the same source bundler and the candidate's selected minifier; the npm publisher's build time is unknown. Installation, lane search, declarations, packaging and transport compression are excluded. Different output scopes are not presented as build speedups.

| SDK | Objective | Matching original pipeline | Candidate pipeline |
| --- | --- | ---: | ---: |
| standard | raw | 3.784 s | 22.018 s |
| standard | gzip | 3.784 s | 19.428 s |
| standard | brotli | 3.784 s | 39.720 s |
| full | raw | 0.392 s | 17.060 s |
| full | gzip | 0.392 s | 13.958 s |
| full | brotli | 0.392 s | 44.381 s |

## Standalone utilities

These percentages cover the listed utility exports, not the SDK. The utility kernel includes explicitly extracted router, queue and rate-limit helper contracts. Other fixtures re-export the pinned upstream modules. See [utility receipts](artifacts/utilities/results.json) for bytes, per-objective build costs and original minifier lanes.

| Utility group | Raw objective | gzip objective | Brotli objective |
| --- | --- | --- | --- |
| Utility kernel | 7.96% smaller | 9.35% smaller | 9.86% smaller |
| Survey utilities | 4.00% smaller | 12.85% smaller | 13.97% smaller |
| Error tracking | 4.56% larger | 5.20% larger | 4.84% larger |
| OTLP encoders | 12.23% smaller | 9.24% smaller | 9.29% smaller |
| Autocapture utilities | 19.18% smaller | 22.36% smaller | 21.85% smaller |
| Replay configuration and buffers | 16.55% smaller | 17.44% smaller | 18.24% smaller |

The utility package API remains `@itslil/posthog-js` with `surveys`, `error-tracking`, `otlp`, `autocapture` and `replay-core` subpaths. Repository artifacts are refreshed; this task does not publish a new utility npm release. The separate SDK preview below preserves the PostHog client API.

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
- 55 utility/API checks, including constructor reflection and host subclassing.
- Six paired browser journeys: matching public exports/methods, loaded callbacks, flags, identify, groups, consent, capture hooks and event payloads.
- Identity survives reload; reset and named-instance isolation are checked.
- Autocapture and exceptions reach a local HTTP collector. Passwords and no-capture controls are excluded.
- Real recorder full snapshots and DOM mutations are received and decoded; password checks also inspect compressed replay payloads.
- Standard SDK works with the published lazy recorder. Full/no-external records without fetching a recorder script.
- Batching and an HTTP 503 retry preserve event IDs and properties in the Brotli SDKs.
- Packed tarball: CommonJS, React provider/hooks, SSR, strict TypeScript and byte-identical canonical upstream declarations and rebuilt ESM/CJS source maps.

This is selected upstream suites, targeted differential/abi tests and browser journeys. this is not the entire posthog test suite or a cross-browser certification. Hosted PostHog ingestion, every optional feature, canvas recording, CSP variants and Firefox/WebKit are not certified by these tests. Recordings are tested against a local collector and decoded to verify actual DOM data and password masking.

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

Sponsorship would fund further compiler work and broader compatibility/performance validation. The evidence supports useful standalone utility savings and a working integration prototype. It does **not** yet support a claim that LilScript delivers a substantially smaller or consistently faster complete PostHog SDK. [Discuss an integration trial or sponsorship](https://github.com/yeargun/posthoglil/issues).

Independent work by yeargun. No affiliation with or endorsement by PostHog is implied. See [NOTICE](NOTICE.md), [LICENSE](LICENSE) and [dependency licenses](licenses).
