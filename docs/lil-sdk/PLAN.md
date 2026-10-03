# PostHog browser SDK in LilScript — plan

Owner brief 2026-10-03 (verbatim in `~/lilscript/finer/intent/2026-10-03.md`): posthoglil's
runtime must be a 100% LilScript reimplementation of posthog-js, typed so the compiler can
optimize it; smaller than the original in raw, gzip and Brotli, each on its own; faster in the
browser; exactly the same behaviour and developer API after `npm i`. Start from Codex's latest
branch (`codex/posthog-complete-port` c6fd050 plus its uncommitted work, snapshot e1e83a6).

Upstream: posthog-js **1.435.8** (`c9d890a4`), `vendor/posthog-js`. Compiler pin:
`~/lilscript-work/bin/posthog100/lilscript` (sha256 `8ff44fab…`, Codex's pin).

## Why a new implementation rather than more of the mechanical port

Codex's own analysis (`reports/complete-port/POSTHOG_REIMPLEMENTATION.md`, 2026-10-03) measured
the mechanical TS→LilScript port: standard entry **+2.15% raw, +3.36% gzip, +3.21% Brotli** against
the original and **2–8% slower**. In `posthog-core.lil` 1,413 of 1,930 lines involve `JsValue`.
Every module links the others as external JavaScript, so no compilation sees the SDK as a
program. The compiler reported zero scalarized allocations and no property mangling. The same
pattern lost on every earlier untyped port; typed ports win (markedlil, cnlil).

The new implementation keeps Codex's infrastructure (vendor pin, inventory, upstream-test
substitution, packaging, consumer and runtime benchmarks, site) and replaces the source with
typed LilScript compiled as **one program per published entry**.

## Scope

| Phase | Entries | Upstream runtime lines |
|---|---|---:|
| P1 standard | `module.es`, `module.no-external.es`, `main.cjs`, `array`, `array.no-external`, `module.slim(.no-external).es`, `external-scripts-loader` | 19,290 (132 modules; the slim graph is 9,615) |
| P2 full | `module.full(.no-external).es`, `array.full(.no-external)`: rrweb recorder, surveys/conversations/product-tours UI, logs, web vitals, dead clicks, exception autocapture | ~2.3 MB of source, 207 modules |
| P3 lazy assets and React | the separately served extension bundles; `posthog-js/react` | |

Lines are TypeScript transpiled to ES2020 without comments, imports or types
(`reports` inventory, 2026-10-03).

## The contract (what must not change)

1. **Developer API** = upstream's published `dist/module.d.ts` and entry exports: names, call
   signatures, return values, thrown errors, getter vs data property, constructibility.
2. **Dispatch through public members stays dynamic.** Where upstream calls a member that the
   published types declare public (`this.capture(…)`, `this.persistence.register(…)`), the port
   calls it through the object, so a page that wraps or patches it sees the SDK's own calls.
   Private members (`_`-prefixed, mangled in upstream's npm build, or TypeScript-private) may be
   called statically, renamed or dissolved: upstream's own build already makes them
   unobservable.
3. **Cross-bundle ABI**: `window.__PosthogExtensions__`, the snippet (`__SV`, `_i`,
   `_execute_array`), `crossBundlePrivateProperties` and the reserved list in upstream's
   `rollup.config.mjs`, `__`-names, window globals. Upstream's CDN extension bundles (recorder,
   surveys, toolbar, …) must run against the port exactly as against upstream.
4. **I/O**: requests (URL, method, headers, body bytes after decompression, compression choice,
   batching, retries, timers), cookies, localStorage/sessionStorage keys and values, console
   output (debug and warnings), DOM listeners, callbacks and their order.
5. **Runtimes**: upstream's browserslist (`> 0.5%, last 2 versions, Firefox ESR, not dead`).
   Upstream's npm output is ES2015-level syntax without `?.`/`??`; the port's output may not
   require more.

## Verification gates

| Gate | What | Reference |
|---|---|---|
| G1 upstream suite | upstream's own 250 test files, run with every ported module substituted by the LilScript build | the same suite against upstream's source bundled the same way with upstream's private-name mangling: a test that passes there is behavioural and must pass on the port; a test that fails there pokes internals that the npm build already hides |
| G2 differential | client scenarios and seeded fuzz in a deterministic jsdom realm: every request, storage write, cookie, console line, timer, listener, return value and throw | npm `posthog-js@1.435.8` dist files |
| G3 ABI surface | property names, kinds, lengths, getters, key order of exports, instance, prototypes and reachable objects | npm dist |
| G4 CDN extensions | upstream's extension bundles from the npm package loaded against the port | npm dist |
| G5 consumers | Codex's esbuild/Rolldown application fixtures, React bindings, tree shaking, browser checks | npm tarball |
| G6 runtime | paired benchmarks: parse+eval, init, capture 1,000, exceptions 100 | npm dist |
| G7 size | raw, gzip-9, Brotli-11/22 of each entry, each objective's own build | npm dist and the best minifier over upstream source per codec (Codex's lanes: terser-oxc 82,183 Brotli; terser-oxc-pooled 263,722 raw) |

## Source architecture

- `src/posthog/<package>/<path>.lil` mirrors `vendor/posthog-js/packages/<package>/src/<path>.ts`
  one to one, with the same exports. Modules import each other natively (`import … from "./x.lil"`).
- Each published entry is a `.lil` root (`src/posthog/browser/entrypoints/module.es.lil` …) and is
  compiled as one whole program for each objective.
- During migration an unported upstream module is a foreign import (`import extern` from the
  vendor path) with a typed `extern` contract; G1 runs at every stage.

## Coding rules

Settled by measurement in `docs/lil-sdk/STYLE.md` (pilot modules first), in short:

- Type everything upstream types; `JsValue` only where values are genuinely dynamic (user
  properties, server JSON, DOM events, extension objects) and narrow it once.
- `shape` for upstream interfaces and config objects, `enum Name: string` for string unions,
  `T?` with `[language] absence = "unified"`, `float` for TypeScript `number`, `int` only for
  proven int32 counters.
- Private helpers are module functions; a published class carries only upstream's public and
  reserved members.
- Public-member calls that upstream makes through an object stay dynamic (contract 2).
- Upstream's runtime checks (`isString`, `isUndefined`, …) stay where they guard caller input;
  they go where the type already proves them.

## Language gaps found so far

| Gap | Upstream uses | Today's workaround | Fix |
|---|---|---|---|
| class `get`/`set` accessors | 80 getters, 1 setter in the standard entry | `defineGetter` at module level (prototype key order differs; ≈350 B Brotli on the slim client) | compiler: class accessors on published classes |
| patchable (always-dynamic) methods with typed signatures | every public method upstream calls through an object | `(x as JsValue).m(…)` (untyped result) | compiler: an `open` member or typed extern views |
| `?.`/`??` at an ES2019 floor | — | printer emits `x!=null?…` | none needed |

## Order of work

1. G1 harness (bundle-substituted upstream suite, mangled reference) and baselines.
2. Pilot modules and `STYLE.md`: a pure utility, a class with getters, a stateful manager;
   measured against the original module by module.
3. Port bottom-up in layers (utilities → storage/persistence/session/transport →
   features → `posthog-core` → entries). Each module lands with its G1 tests green.
4. Whole-program entry builds; G2–G7.
5. Size and runtime work: port source first, then compiler configuration, then compiler features.
6. Package, consumers, site (publish only wins).

Status lives in `docs/lil-sdk/STATUS.md`.
