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
| Autocapture utilities | 21 exports · 5/5 differential groups | 11,070 / 4,640 / 4,215 | **9,440 / 3,465 / 3,136** | **14.7% / 25.3% / 25.6% smaller** |
| Session replay core | 20 exports · 6/6 differential groups | 10,264 / 4,639 / 4,258 | **9,337 / 3,836 / 3,486** | **9.0% / 17.3% / 18.1% smaller** |
| Surveys | 21 exports · 6/6 differential groups | 6,244 / 2,515 / 2,251 | **6,077 / 2,096 / 1,824** | **2.7% / 16.7% / 19.0% smaller** |
| Error tracking | 26 exports · 5/5 differential groups | **14,662 / 5,700 / 5,224** | 19,051 / 6,399 / 5,811 | 29.9% / 12.3% / 11.2% larger |
| OTLP logs + metrics | 14 exports · 6/6 differential groups | 6,915 / 2,790 / 2,563 | 6,915 / **2,479 / 2,256** | even raw; **11.1% / 12.0% smaller compressed** |

Three-pass Terser is the strongest official Brotli lane on every pack. Against it, autocapture is 829 Brotli bytes smaller, replay core 521, surveys 242 and OTLP 170. Error tracking is 749 bytes larger. The losses stay visible.

Error tracking and OTLP used to ship `cost_model = raw` builds with the candidate search off, because the old compiler's Brotli-scored output failed their differential or syntax gates. The current compiler's Brotli builds pass both suites, so every pack now uses the release configuration: OTLP went from 2,852 to 2,256 Brotli bytes and now beats Oxc, and error tracking went from 6,496 to 5,811. None of the LilScript rows is post-minified.

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
| **LilScript compiler · cost_model brotli** | 17,531 | 5,984 | **5,370** | **0.955× Brotli** |
| LilScript compiler · cost_model gzip | 17,531 | **5,984** | 5,370 | **0.966× gzip** |
| LilScript compiler · cost_model raw | **15,651** | 6,300 | 5,554 | **0.971× raw** |
| `@itslil/posthog-js` · packaged ESM | 17,622 | 6,039 | 5,419 | 0.964× Brotli |

On each objective the kernel beats the strongest official lane, Oxc with mangling: **252 Brotli bytes (4.5%)**, **210 gzip bytes (3.4%)** and **472 raw bytes (2.9%)** smaller, with all **21 compatibility tests** passing. Three-pass Terser is 4 Brotli bytes behind Oxc. The packaged ESM, license banner included, is still 203 Brotli bytes below Oxc. The gzip-scored compile currently selects the same bytes as the Brotli-scored one.

### Since the previous release

The previous release (dist committed 2026-09-02) was compiled by the old compiler route, which has since been deleted. This release is compiled by the one LilScript compiler at revision `aa2052f0`. The kernel sources were also rewritten: `CookieStore` became a closure, constant arrays became literals, `is` narrowing replaced `isStr()`/`toStr()`, export aliases went, `parseUuid` lost its byte round trip, and the flags response became one loop. That loop also fixes an inherited-key bug: a payload key named `constructor` used to be dropped.

| Artifact | Codec | Previous release | This release |
| --- | --- | ---: | ---: |
| Kernel · Brotli-scored compile | Brotli-11 | 5,559 | **5,370** |
| Kernel · gzip-scored compile | gzip-9 | 6,338 | **5,984** |
| Kernel · raw-scored compile | raw | 15,894 | **15,651** |
| Kernel · packaged ESM | Brotli-11 | 5,621 | **5,419** |
| Autocapture pack | Brotli-11 | **3,097** | 3,136 |
| Session replay core pack | Brotli-11 | **3,445** | 3,486 |
| Surveys pack | Brotli-11 | **1,809** | 1,824 |
| Error tracking pack (raw → Brotli objective) | Brotli-11 | 6,496 | **5,811** |
| OTLP pack (raw → Brotli objective) | Brotli-11 | 2,852 | **2,256** |

The three packs that were already Brotli-scored are 15–41 bytes larger than the old route made them. Their modules changed only by declaring the host globals each one uses (`extern JsValue Reflect;` and the like), which this compiler requires per module, and by the kernel rewrite of the shared `host.lil`.

### Compiler and compile time

Every compiled file comes from one compiler binary (SHA-256 `13cb49a93fb3e376a5978484835322c84adea692b69ae4720775291377cf18f9`, revision `aa2052f0`). `node scripts/record-compiler-run.mjs --revision <commit>` runs the release build three times, refuses the run unless every sample compiles identical bytes, and records the wall time of each compiler process in `site/results.json`. The eight invocations (three kernel objectives, five packs) take about half a second together (523, 517 and 517 ms in the recorded run); the site lists every invocation.

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
