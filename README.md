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

`@itslil/posthog-js` is the LilScript compiler's own ESM: not bundled and not post-minified. The package wrapper adds the license banner after compilation.

The published npm `posthog-js` IIFE still contains the client, autocapture, and replay. It is not a lane. Comparing this port to that file would be a different product against a subset.

LilScript scores a different artifact for each `javascript.cost_model`. Official Oxc / Terser / esbuild rows are one file measured three ways. Compiler-to-minifier comparisons use the direct JavaScript artifacts without package metadata on either side. The npm ESM adds a 91-byte raw license banner and is reported separately.

- **Direct compiler output** (`[mangle] extern_fields = true`). Public names stay readable.
- **Packaged ESM**. The verified Brotli artifact plus its license banner.
- **Closed LilScript** (`lilscript.closed.toml`, `extern_fields = false`). Not published.

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
| **LilScript compiler · cost_model brotli** | **16,683** | **6,381** | **5,606** | **0.997× Brotli** |
| `@itslil/posthog-js` · packaged ESM | 16,774 | 6,439 | 5,749 | 1.02× Brotli |
| LilScript compiler · closed fields | 16,801 | 6,513 | 5,696 | 1.01× Brotli |
| Previous verified gzip snapshot, packaged | 16,527 | 6,415 | 5,721 | 1.04× gzip |
| Previous verified raw snapshot, packaged | 16,223 | 6,546 | 5,801 | 1.01× raw |

The current direct Brotli-scored compiler output is **16 bytes (0.3%) smaller than Oxc** and **20 bytes (0.4%) smaller than Terser**, with all **21 compatibility tests** passing. The packaged ESM remains 127 Brotli bytes above Oxc because it includes the license banner; that packaging cost is not credited to the compiler. Raw and gzip retain their previous verified snapshots because this update deliberately did not launch another exhaustive search.

Oxc with mangling is the smallest official lane on every codec. Terser is 4 Brotli bytes behind Oxc.

### Why the PostHog win is narrow

This kernel is mostly dense leaf utilities. Its public export names, protocol keys, PostHog field names, user-agent strings, and observable object shapes are fixed, leaving little structural scaffolding for LilScript to erase. Oxc and Terser already compress this kind of straight-line JavaScript close to the codec floor.

LilScript's larger wins happen when types and closed-world knowledge let it remove objects, wrappers, branches, generic machinery, or whole dependency paths. Those opportunities are deliberately scarce in this like-for-like kernel. Here the remaining advantage comes from globally scored expression shapes and binding assignments, so a 16-byte Brotli win is small but expected rather than evidence of a missing 10–30% transformation.

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
