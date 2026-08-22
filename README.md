# @itslil/posthog-js

This is **not** the official [`posthog-js`](https://github.com/PostHog/posthog-js) package. It is a **capture kernel** from `posthog-js@1.418.10` — UUID, feature-flag utils, cookie identity, request routing, a token bucket, and queue batching — rewritten in [LilScript](https://github.com/yeargun/lilscript).

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
| Official kernel | 25,471 | 7,081 | 6,137 | — |
| Official · Vite 8 Oxc mangle on | 10,625 | 4,043 | 3,662 | baseline |
| Official · Vite 8 Oxc mangle off | 14,629 | 4,585 | 4,163 | — |
| Official · Terser mangle on · 3 passes | 10,662 | 4,053 | 3,699 | — |
| Official · Terser mangle off · 3 passes | 15,289 | 4,619 | 4,230 | — |
| Official · Terser mangle on · 1 pass | 10,662 | 4,053 | 3,699 | — |
| Official · esbuild minify esnext | 10,836 | 4,157 | 3,792 | — |
| Official · esbuild minify es2018 | 11,428 | 4,386 | 3,956 | — |
| **`@itslil/posthog-js` · matched compiles** | **10,461** | **4,356** | **3,915** | **0.98× / 1.08× / 1.07×** |
| `@itslil/posthog-js` · cost_model brotli (npm) | 10,408 | 4,377 | 3,915 | 1.07× Brotli |
| `@itslil/posthog-js` · cost_model gzip | 10,410 | 4,356 | 3,910 | 1.08× gzip |
| `@itslil/posthog-js` · cost_model raw | 10,461 | 4,307 | 3,818 | 0.98× raw |
| `@itslil/posthog-js` · closed LilScript | 10,408 | 4,377 | 3,915 | 1.07× Brotli |

Against official kernel · Oxc mangle on, the matched library compiles are **6.9% larger on Brotli-11**, **7.7% larger on gzip-9**, and **1.5% smaller raw**. Same 16 compat tests.

Oxc with mangling is the smallest official lane on every codec. Terser is 37 Brotli bytes behind. esbuild `esnext` is 130 Brotli bytes behind Oxc. The published LilScript file sits between esbuild `esnext` (3,792) and esbuild `es2018` (3,956).

The raw-scored compile Brotli-compresses to 3,818 B, which is smaller than the Brotli-scored npm file. The headline still uses the Brotli compile, because that is what ships. Even 3,818 B is larger than Oxc. Closed LilScript matches the npm file: the public kernel names are the API, so `extern_fields = false` does not buy anything here.

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
