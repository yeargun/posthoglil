# @itslil/posthog-js

This is **not** the official [`posthog-js`](https://github.com/PostHog/posthog-js) package. It ports selected `posthog-js@1.418.10` surfaces to [LilScript](https://github.com/yeargun/lilscript): the original capture kernel plus five independent package lanes, including the complete autocapture utility module and a two-module session-replay core.

It is not affiliated with PostHog. The `PostHog` client, active replay recorder, product tours, heatmaps, web vitals, network transport, and persistence adapters are absent. The five lanes are separate subpath exports and are never folded into the root kernel comparison.

**Site:** [yeargun.github.io/posthoglil](https://yeargun.github.io/posthoglil/)

```sh
npm install @itslil/posthog-js
```

```js
import {
  uuidv7,
  normalizeFlagsResponse,
  parsePostHogCookie,
  endpointFor,
  rateLimitContext,
  isBlockedUA,
  getPersonPropertiesHash,
  formatQueue,
} from "@itslil/posthog-js"

const id = uuidv7()
const flags = normalizeFlagsResponse(response)
const url = endpointFor({ api_host: "https://us.i.posthog.com" }, "api", "/e/")
```

The independent packs use their own import paths:

```js
import { applySurveyTranslation } from "@itslil/posthog-js/surveys"
import { ErrorPropertiesBuilder, createDefaultStackParser } from "@itslil/posthog-js/error-tracking"
import { buildOtlpLogRecord, buildOtlpMetricsPayload } from "@itslil/posthog-js/otlp"
import { getElementsChainString, shouldCaptureValue } from "@itslil/posthog-js/autocapture"
import { buildNetworkRequestOptions, splitBuffer } from "@itslil/posthog-js/replay-core"
```

## Independent pack results

The official baselines are bundled directly from the untouched `vendor/posthog-js` git submodule at commit `9b2a1b18db64f9f6b331cbded543c5ead3ccf0cb`. The submodule is read-only for this work: no original PostHog TypeScript or JavaScript is edited, copied into a rewritten baseline, or post-processed before bundling.

Each pack is measured separately against Vite 8 Oxc with mangling enabled. The figures below are direct compiler artifacts without package banners, all built with the port's release configuration (`lilscript.toml`, `cost_model = brotli`).

| Pack | Exact runtime surface | Official Oxc raw / gzip-9 / Brotli-11 | LilScript raw / gzip-9 / Brotli-11 | Result vs Oxc |
| --- | --- | ---: | ---: | --- |
| Autocapture utilities | 21 exports · 5/5 differential groups | 11,070 / 4,640 / 4,215 | **9,429 / 3,462 / 3,129** | **14.8% / 25.4% / 25.8% smaller** |
| Session replay core | 20 exports · 6/6 differential groups | 10,264 / 4,639 / 4,258 | **9,332 / 3,830 / 3,480** | **9.1% / 17.4% / 18.3% smaller** |
| Surveys | 21 exports · 6/6 differential groups | 6,244 / 2,515 / 2,251 | **5,708 / 1,974 / 1,711** | **8.6% / 21.5% / 24.0% smaller** |
| Error tracking | 26 exports · 5/5 differential groups | **14,662 / 5,700 / 5,224** | 17,665 / 6,067 / 5,496 | 20.5% / 6.4% / 5.2% larger |
| OTLP logs + metrics | 14 exports · 6/6 differential groups | 6,915 / 2,790 / 2,563 | **6,282 / 2,376 / 2,163** | **9.2% / 14.8% / 15.6% smaller** |

Three-pass Terser is the strongest official Brotli lane on every pack. Against it, autocapture is 836 Brotli bytes smaller, replay core 527, surveys 355 and OTLP 263. Error tracking is 434 bytes larger. The losses stay visible.

Every pack uses the release configuration. The surveys and OTLP sources were rewritten idiomatically for this release (see below); error tracking, autocapture and replay core keep their sources, and their bytes change only with the compiler. None of the LilScript rows is post-minified.

The committed differential suites cover autocapture DOM/event decisions, sensitive values, text normalization, and elements-chain serialization; replay network redaction, callback fallbacks, circular sizing, data-URI replacement, console truncation, and recursive buffer splitting; survey translation and activation semantics; every error coercer, recursive causes, exception-step byte budgets, class shapes, async frame modifiers, and browser/Node parser families; and OTLP integer boundaries, sparse/circular/deep graphs, `toJSON`, throwing getters, resource precedence, and log/metrics envelopes.

## What is compared

Within every row group, both sides expose the **same surface**. The root kernel uses the pinned fixtures in `official/`; all five packs bundle the pinned original git submodule directly. Each official source graph is bundled with esbuild and then run through:

- Vite 8 Oxc minify, mangling on and off
- Terser, 3-pass mangling on and off, and 1-pass mangling on
- esbuild minify, `target: esnext` and `target: es2018`

The LilScript rows are the compiler's own ESM: not bundled and not post-minified. Package wrappers add a license banner after compilation and are reported separately.

The published npm `posthog-js` IIFE still contains the client, autocapture, and replay. It is not a lane. Comparing this port to that file would be a different product against a subset.

Official Oxc / Terser / esbuild rows are one file measured three ways. Compiler-to-minifier comparisons use direct JavaScript artifacts without package metadata on either side. The root npm ESM adds a 91-byte raw license banner and is reported separately. The kernel is compiled once per objective: `lilscript.toml` (Brotli), `lilscript.gzip.toml` and `lilscript.bytes.toml` (raw).

The closed-fields lane (`lilscript.closed.toml`, `extern_fields = false`) is retired. This compiler renames no property, so that switch has no effect, and the lane would only have repeated the Brotli build.

Measured with `lilscript-codec` gzip-9 / Brotli-11.

Pin: `posthog-js@1.418.10` commit `9b2a1b18db64f9f6b331cbded543c5ead3ccf0cb`.

| Lane | Raw | gzip-9 | Brotli-11 | vs Oxc on that codec |
| --- | ---: | ---: | ---: | ---: |
| Official kernel | 35,193 | 9,732 | 8,561 | — |
| Official · Vite 8 Oxc mangle on | 16,123 | 6,194 | 5,622 | baseline |
| Official · Vite 8 Oxc mangle off | 22,034 | 6,951 | 6,307 | — |
| Official · Terser mangle on · 3 passes | 16,343 | 6,234 | 5,626 | — |
| Official · Terser mangle off · 3 passes | 23,298 | 7,111 | 6,428 | — |
| Official · Terser mangle on · 1 pass | 16,343 | 6,234 | 5,626 | — |
| Official · esbuild minify esnext | 16,551 | 6,355 | 5,775 | — |
| Official · esbuild minify es2018 | 17,213 | 6,598 | 5,943 | — |
| **LilScript compiler · cost_model brotli** | 16,177 | 5,681 | **5,072** | **0.902× Brotli** |
| LilScript compiler · cost_model gzip | 15,921 | **5,645** | 5,049 | **0.911× gzip** |
| LilScript compiler · cost_model raw | **14,610** | 6,014 | 5,289 | **0.906× raw** |
| `@itslil/posthog-js` · packaged ESM | 16,268 | 5,734 | 5,131 | 0.913× Brotli |

On each objective the kernel beats the strongest official lane, Oxc with mangling: **550 Brotli bytes (9.8%)**, **549 gzip bytes (8.9%)** and **1,513 raw bytes (9.4%)** smaller, with all **21 compatibility tests** passing. Three-pass Terser is 4 Brotli bytes behind Oxc. The packaged ESM, license banner included, is 491 Brotli bytes below Oxc.

### Since the previous release

The previous release (page and dist published 2026-09-24, `1e13341`) was compiled by the one LilScript compiler at revision `aa2052f0`. This release is compiled at `d1d48c4c`, and its kernel, surveys and OTLP sources are rewritten idiomatically. The rewrite uses typed views instead of index loops over `JsValue`, upstream's own spellings (`??` chains, `||`, strict `===` chains, arrow exports where upstream has arrows, literal tables), and one helper per meaning. Error tracking, autocapture and replay core keep their sources; their bytes change only with the compiler.

| Artifact | Codec | Previous release | This release |
| --- | --- | ---: | ---: |
| Kernel · Brotli-scored compile | Brotli-11 | 5,370 | **5,072** |
| Kernel · gzip-scored compile | gzip-9 | 5,984 | **5,645** |
| Kernel · raw-scored compile | raw | 15,651 | **14,610** |
| Kernel · packaged ESM (`dist/posthog.esm.js`) | Brotli-11 | 5,419 | **5,131** |
| Autocapture pack | Brotli-11 | 3,136 | **3,129** |
| Session replay core pack | Brotli-11 | 3,486 | **3,480** |
| Surveys pack | Brotli-11 | 1,824 | **1,711** |
| Error tracking pack | Brotli-11 | 5,811 | **5,496** |
| OTLP pack | Brotli-11 | 2,256 | **2,163** |

The main configuration with only `cost_model` switched to `raw` keeps `fn.name`. It now compiles the kernel to 15,452 bytes, below Oxc's 16,123. The previous sources compiled to 16,504 bytes with the same compiler.

The rewrite was checked against upstream in two ways, both outside this repository. One is a three-way differential harness over adversarial inputs, comparing upstream, the previous port and this source. The other is upstream's own spec files for these modules, run with the port's exports substituted. The rewrite matches upstream in several places where the previous port did not:
- holes in `applyOffsets`, `sortUnloadRequests`, `minimizeFlagCalledEventProperties` and `isBlockedUA`;
- a `null` rate-limiter config;
- a non-string `api_host`.

The 19 exports that upstream declares as arrows are now arrows: they cannot be constructed and have no `prototype`, and their names and lengths are unchanged. `endpointFor(config, target)` now works without a path, as its type declares.

Runtime was compared with the previous release's dist using a paired in-process benchmark, also outside this repository. It ran on Node 24.11.1, with 12 fresh processes per pair and three no-op-perturbed builds per lane. The results are parity, as the median ratio with its 95% bootstrap interval:
- kernel workload: 1.002× [0.997, 1.005]
- surveys: 1.001× [0.989, 1.028]
- OTLP: 0.995× [0.991, 0.999]

### Compiler and compile time

Every compiled file comes from one compiler binary (SHA-256 `47048e41164027e92d3bf1d1840d8d83e04c60532c031ceb3346222e194b3041`, revision `d1d48c4c`). `node scripts/record-compiler-run.mjs --revision <commit>` runs the release build three times. It refuses the run unless every sample compiles identical bytes, and it records the wall time of each compiler process in `site/results.json`. The eight invocations (three kernel objectives, five packs) took 2,382, 2,230 and 2,332 ms together in the recorded run, on a shared host at load average 7. The site lists every invocation. The previous release's compiler took 828 to 998 ms. On this host, back to back and with the same binary, the previous sources took 3,008 / 2,825 / 2,863 ms and these sources took 2,909 / 2,744 / 2,568 ms. The longer time comes with the compiler, not with the rewrite.

### Build time from source

`comparison/source-build/` and `site/source-build.json` record clean builds from the pinned sources, using LilScript's page-refresh protocol: outputs are cleared between builds, and dependency installation is excluded. The page shows them next to the size table.

| Lane | Command | Median (min–max), 3 builds | Machine |
| --- | --- | ---: | --- |
| LilScript package (kernel's three objective compiles + five packs) | `node scripts/build.mjs --compile --force && node scripts/build-packs.mjs --compile` | 6.10 s (5.15–6.14 s), of which the 8 compiler processes take 4.44 s | Azure Standard_B8als_v2, 8 vCPUs, 2026-09-27, load average about 12 |
| Original repository (the complete PostHog SDK) | `corepack pnpm exec turbo run build --filter=posthog-js... --force` | 170.50 s (169.02–186.00 s) | Azure Standard_D16als_v7, 16 vCPUs, 2026-09-10 |

The original build was not re-run for this release. On the 8-vCPU host under load, one sample ran past 20 minutes, so its three samples are carried from the 2026-09-10 record (`comparison/source-build/original-2026-09-10-result.json`). The two lanes build different scopes on different machines, so no speedup is claimed. The clean LilScript build reproduced every file in `dist/` byte for byte and passed the 21 kernel tests.

### Delivered files

`dist/*.esm.js` is the compiler's output with a license comment prepended. `dist/*.cjs` and `dist/posthog.umd.js` are esbuild reprints of that ESM (CommonJS and IIFE wrappers, whitespace-minified): **post-processed by esbuild, not compiler-written**. They are listed as such on the site, and no size claim here uses them. The compiler writing those export conditions itself is tracked by LilScript's plan task M12.2.

### Why the PostHog margin is narrow

This kernel is mostly dense leaf utilities. Its public export names, protocol keys, PostHog field names, user-agent strings, and observable object shapes are fixed, leaving little structural scaffolding for LilScript to erase. Oxc and Terser already compress this kind of straight-line JavaScript close to the codec floor.

LilScript's larger wins happen when types and closed-world knowledge let it remove objects, wrappers, branches, generic machinery, or whole dependency paths. Those opportunities are deliberately scarce in this like-for-like kernel, so a margin of a few percent is expected rather than evidence of a missing 10–30% transformation.

If LilScript is larger on a codec, that row stays. Losses are part of the comparison.

## What is ported

The root export remains the capture kernel below. The five independent surfaces live at `./autocapture`, `./replay-core`, `./surveys`, `./error-tracking`, and `./otlp` so their bytes never distort this table or its existing measurements.

| Module | Official source | Kept | Left out |
| --- | --- | --- | --- |
| UUID | `packages/core/src/vendor/uuidv7.ts` | `uuidv7`, `uuidv4`, `parseUuid`, `uuidFromFieldsV7`, `uuidToHex` | — |
| Flags | `packages/core/src/featureFlagUtils.ts` | normalize, values, payloads, minimize, allowlists | evaluation against a PostHog instance |
| Cookies | `packages/core/src/cookie.ts` | name, serialize, parse, consent, opt-out | `document.cookie` / persistence adapters |
| Router | `packages/browser/src/utils/request-router.ts` | hosts, region, `endpointFor` | `RequestRouter` class, `rewriteRequestPath` |
| Rate limit | `packages/browser/src/rate-limiter.ts` | token-bucket context | persistence, `$$client_ingestion_warning` |
| Queue | `packages/browser/src/request-queue.ts` | flush clamp, format, offsets, unload sort | `sendBeacon`, timers, transport |
| Bot | `packages/core/src/utils/bot-detection.ts` | `DEFAULT_BLOCKED_UA_STRS`, `isBlockedUA` | navigator / UA-CH `isLikelyBot` |
| Strings | `packages/core/src/utils/string-utils.ts` | includes, trim, strip `$`, distinct-id, person hash | `safeJsonStringify` |
| Numbers | `packages/core/src/utils/number-utils.ts` | clamp, remote-config bool/number, sample rate | — |
| Types | `packages/core/src/utils/type-utils.ts` | empty/primitive/builtin, yes/no-like, unsafe-event lists | DOM `FormData` / `File` / `Event` |
| JSON | `packages/core/src/utils/json-utils.ts` | `sanitizeString` | `toJsonSafeValue` |
| URL | `packages/core/src/utils/index.ts` | `removeTrailingSlash`, `stripUrlHash` | retries, timestamps |
| Bucketed limiter | `packages/core/src/utils/bucketed-rate-limiter.ts` | config resolve, consume | class wrapper, logger callback |

Compatibility tests compare LilScript output to the official kernel, not to the published IIFE.

```sh
npm test
npm run test:packs
npm run build
npm run build:packs
npm run measure
npm run write:results
npm run measure:packs
node scripts/record-compiler-run.mjs --revision <lilscript commit>
npm run build:site
```

Oxc minify uses Vite 8 and needs Node `^20.19 || >=22.12`. This lab falls back to the LilScript popular-benchmark Vite if the local Node is older.

## License

Apache-2.0. See [LICENSE](./LICENSE) and [NOTICE.md](./NOTICE.md). posthog-js is copyright PostHog / Hiberly, Inc. The UUID vendor is [LiosK/uuidv7](https://github.com/LiosK/uuidv7).
