# @itslil/posthog-js

This is **not** the official [`posthog-js`](https://github.com/PostHog/posthog-js) package. It is a **capture kernel** from `posthog-js@1.418.10` — UUID, feature-flag utils, cookie identity, request routing, token and bucketed rate limits, queue batching, bot detection, and the portable string / number / type / JSON / URL helpers — rewritten in [LilScript](https://github.com/yeargun/lilscript).

It is not affiliated with PostHog. Autocapture, session replay, surveys, product tours, heatmaps, web vitals, the `PostHog` client, network transport, and persistence adapters are absent.

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

## What is compared

Every size number is the **same surface**: official `posthog-js@1.418.10` sources extracted into `official/`, bundled with esbuild, then run through:

- Vite 8 Oxc minify, mangling on and off
- Terser, 3-pass mangling on and off, and 1-pass mangling on
- esbuild minify, `target: esnext` and `target: es2018`

`@itslil/posthog-js` is the LilScript compiler's own ESM: not bundled, not post-minified, license banner included.

The published npm `posthog-js` IIFE still contains the client, autocapture, and replay. It is not a lane. Comparing this port to that file would be a different product against a subset.

LilScript scores a different artifact for each `javascript.cost_model`. Official Oxc / Terser / esbuild rows are one file measured three ways. The LilScript **library** numbers take raw from the raw compile, gzip from the gzip compile, and Brotli from the Brotli compile. The npm file is the Brotli compile.

- **JS library** (`[mangle] extern_fields = true`). Public names stay readable.
- **Closed LilScript** (`lilscript.closed.toml`, `extern_fields = false`, Brotli compile). Not published.

Measured with `lilscript-codec` gzip-9 / Brotli-11. LilScript lanes include the same license banner.

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
| **`@itslil/posthog-js` · matched compiles** | **16,223** | **6,415** | **5,793** | **1.01× / 1.04× / 1.03×** |
| `@itslil/posthog-js` · cost_model brotli (npm) | 17,070 | 6,532 | 5,793 | 1.03× Brotli |
| `@itslil/posthog-js` · cost_model gzip | 16,527 | 6,415 | 5,721 | 1.04× gzip |
| `@itslil/posthog-js` · cost_model raw | 16,223 | 6,546 | 5,801 | 1.01× raw |
| `@itslil/posthog-js` · closed LilScript | 17,070 | 6,532 | 5,793 | 1.03× Brotli |

Against official kernel · Oxc mangle on, the matched library compiles are **3.0% larger on Brotli-11**, **3.6% larger on gzip-9**, and **0.6% larger raw**. Same 19 compat tests.

Oxc with mangling is the smallest official lane on every codec. Terser is 4 Brotli bytes behind Oxc. The published LilScript file is 171 Brotli bytes behind Oxc and 18 bytes behind esbuild `esnext` (5,775). Closed LilScript matches the npm file: the public kernel names are the API, so `extern_fields = false` does not buy anything here.

If LilScript is larger on a codec, that row stays. Losses are part of the comparison.

## What is ported

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
npm run build
npm run measure
npm run build:site
```

Oxc minify uses Vite 8 and needs Node `^20.19 || >=22.12`. This lab falls back to the LilScript popular-benchmark Vite if the local Node is older.

## License

Apache-2.0. See [LICENSE](./LICENSE) and [NOTICE.md](./NOTICE.md). posthog-js is copyright PostHog / Hiberly, Inc. The UUID vendor is [LiosK/uuidv7](https://github.com/LiosK/uuidv7).
