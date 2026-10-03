# Writing the PostHog SDK in LilScript

Rules for every module under `src/posthog/`. They come from the pilot modules
(`core/types`, `core/utils/{type,string,number}-utils`, `browser/rate-limiter`) compiled with the
pinned compiler (`~/lilscript-work/bin/posthog100/lilscript`) and checked by G1. When a rule here
costs bytes or behaviour on a module, measure it and update this page; do not work around it
silently.

## 1. One module per upstream module

`src/posthog/<package>/<path>.lil` mirrors `vendor/posthog-js/packages/<package>/src/<path>.ts`
(or `.tsx`). Same exported names, same meaning. Start the file with the upstream path in a
comment. Shared LilScript-only helpers live under `src/posthog/lil/` (no upstream twin).

Imports:

- ported module: `import { x } from "../core/utils/type-utils.lil";` (relative, native);
- not yet ported: `import extern { x } from "@upstream/<package>/<path>";` plus a typed
  `extern` declaration (`extern string CAPTURE_RATE_LIMIT;`, `extern JsValue createLogger;`).
  `@upstream/browser/constants` resolves to `packages/browser/src/constants.ts`. When that
  module is ported, switch the import to the native form.
- host globals: `extern JsValue Date;`, `extern JsValue Object;` … (the catalog only declares
  `console`, `performance`, timers and `RegExp`).

## 2. The behaviour contract decides the shape

- **Public members keep upstream's shape.** A class whose instances the page can reach (every
  manager hanging off `posthog.*`, and every exported class) is published with
  `export constructor Name;`. It keeps upstream's public fields **in upstream's key order**
  (TypeScript `useDefineForClassFields: false`: fields with initializers first, in declaration
  order, then the constructor body's assignments), its public methods on the prototype, and its
  getters on the prototype (§5).
- **Private members are free.** `_`-prefixed members (mangled in upstream's npm build, except
  the reserved list in `rollup.config.mjs`) and TypeScript-`private` methods become module
  functions taking the instance: `bool isPropertyAllowed(RateLimiter self, string p)`.
  Reserved `_` names (`_send_request`, `_addCaptureHook`, `_i`, `__SV`, …) stay members.
- **Calls through public names stay dynamic.** Where upstream calls a public member through an
  object — `this.instance.capture(…)`, `persistence.get_property(…)`, `this.capture(…)` in
  `PostHog` — the port calls it through a dynamic value, so a page that wraps or spies on it
  sees the call. Hold other SDK objects (the `PostHog` instance, its managers, extension
  objects) as `JsValue`. A class may call its own public method statically only where no patch
  could precede the call (in its own constructor).
- **Exported values keep their identity class.** Exported enums/constant objects are plain
  mutable objects (`export JsValue SurveyType = object { … };`), never frozen const data.

## 3. Types

- Type what upstream's code treats as typed: internal state, locals, parameters of private
  functions, return values. TypeScript `number` → `float`; `int` only for proven int32
  counters and indices. `string`, `bool`, `T[]`, `Map`, `Set`, `shape`, `enum Name: string`.
- `JsValue` is for values that are dynamic in upstream too: page-supplied properties and config
  values that upstream checks at run time, server JSON, DOM events, other SDK objects (§2),
  values handed to callbacks. Narrow once (`is string`, `is float`, `is bool`, `.isArray()`,
  upstream's own predicate) and keep the narrowed local.
- Absence: `[language] absence = "unified"` (configs/lil). Inside the module `T?` is fine.
  Where the spelling is observable — an exported function's result, a field of a published
  class, a value stored into a page-visible object or a request body — write the pin:
  `float | undefined`, `string | null`. JSON drops `undefined` keys and keeps `null` ones.
- Keep upstream's exact runtime tests where they guard dynamic input:
  `Object.prototype.toString` tags in `isString`/`isNumber` (boxed primitives), `x === x`
  for NaN, truthiness (`v.truthy()`, `a || b` on `JsValue`), `== null`.

## 4. Language facts that bite

- `number` is a type name; so are `int`, `float`, `string`, `bool`, `object`, `match`, `init`.
- On `JsValue`, `length`, `message`, `specifier`, `truthy`, `isArray`, `isObject` are built-in
  members: `v.length` is typed `float`, `v.message` is typed `string`, `v.isArray()` is
  `Array.isArray(v)`. To read the host property dynamically use an index: `v["length"]`,
  `e["message"]`.
- `bool` has no `.truthy()`; a comparison on `JsValue` already yields `bool`.
- A template interpolation refuses optional types; use a `JsValue` local
  (`JsValue m = if (e == null) { undefined } else { e["message"] };`).
- R3: a class field must be assigned before `this` is read or captured. Give fields their
  default at the declaration (`JsValue serverLimits = object {};`) instead of in `init` — the
  compiler then stores each field once. A field that a closure in `init` needs before the
  constructor's last assignment gets `= undefined` at the declaration.
- A published class's name is a value only as `(Name as JsValue)` (e.g. for its `.prototype`).
- Receiver lambdas: `(this JsValue receiver, JsValue key, JsValue value) => …` emits a
  `function` that reads `this` (JSON replacers, getters).
- `new Regex("^\\$")` prints as the regex literal `/^\$/`.

## 5. Getters and setters (until the compiler has class accessors)

```lil
Object.defineProperty((RateLimiter as JsValue).prototype, "captureEventsPerSecond", object {
  get: (this JsValue receiver) => perSecondOf(receiver as RateLimiter),
  configurable: true
});
```

Same descriptor as a class getter (non-enumerable, configurable). Upstream's class lists the
getter among its methods; this one is added after them (prototype key order differs, nothing
reads it). Write the body as a module function so LilScript callers call it statically.

## 6. Comments

Keep the density of the surrounding code: the header comment, and a line where the port
deliberately differs in shape from upstream (and why the behaviour is the same).
