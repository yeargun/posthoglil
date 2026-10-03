# Compiler and language findings from the PostHog port

Each item: what the port needs, what the pinned compiler (`8ff44fab`) does, the byte or
behaviour cost, and a minimal reproduction. Generic fixes only (no port-specific rules).

| # | Finding | Effect | Status |
|---|---|---|---|
| F1 | No class `get`/`set` accessors | 80 getters + 1 setter in the standard entry are written as `Object.defineProperty(proto, …)` at module level (STYLE §5): about 40–80 raw bytes each instead of ~20; prototype key order differs from upstream (unobservable in practice) | open |
| F2 | Field defaults stored twice: a field assigned in `init` also gets a placeholder store (`this.x=null; … this.x=v`) | bytes in every published constructor; workaround: initialize at the declaration | open (M7.7) |
| F3 | Receiver functions print `"use strict"` inside ESM output, which is already strict | 13 bytes per receiver function (getters, JSON replacers) | open |
| F4 | Fields of a published class are never renamed, and objects stored in them keep their keys | upstream's npm build mangles every `_` property outside its reserved list to two characters; the port keeps `_requestQueue`, `_isShutdown`, … at full length on every access | open — needs a declared contract: "property names matching `^_(?!_)` minus a reserved list are not ABI", as upstream's terser `mangle.properties` |
| F5 | Parameter names of published methods are not mangled (`capture(event){…event…}`) | bytes on every published method; names are unobservable except through `Function.prototype.toString` | open |
| F6 | `JsValue` built-in members shadow host names (`length`→`float`, `message`→`string`, `isArray()`, `truthy()`) | `v.length`/`e.message` on a dynamic value are typed reads, not host reads; write `v["length"]` | language note (STYLE §4) |
| F7 | Compound assignment on a dynamic member prints a temporary (`let i=f;i.tokens=i.tokens+…`) | a few bytes per site | open |

## Reproductions

F4/F5:
```lil
class Queue { JsValue items = []; float flushes = 0.0; init() {} }
export class Client {
  JsValue config = object {};
  Queue _requestQueue = new Queue();
  bool _isShutdown = false;
  init() {}
  void capture(JsValue event) {
    if (this._isShutdown) { return; }
    this._requestQueue.items.push(event);
  }
}
export constructor Client;
```
Level 13, Brotli, mangling on, prints
`constructor(){this.config={};this._requestQueue={items:[],flushes:0};this._isShutdown=!1;…}capture(event){…}`.

F2 (before the declaration-default workaround):
`constructor(a){this.serverLimits=null;this.lastEventRateLimited=!1;…;this.serverLimits={};…}`.

## F4 value and implementation sketch

Value on upstream's own code (standard entry, Terser with upstream's rollup settings):
no property mangling 354,178 / 104,786 / 87,983; with `/^_(?!_)/` minus the reserved list
308,256 / 99,579 / 84,192 (raw / gzip-9 / Brotli-11): **−13% raw, −5.0% gzip, −4.3% Brotli**.
npm's `module.js` is 322,470 / 101,141 / 85,211.

The compiler already renames fields of proved-private classes (`src/program/private_fields.rs`,
applied in `class_field_key`, `src/program/javascript.rs`), but blocks every class that is
published, reflected, external or prototype-observable. The port's SDK objects are all
published, and other modules read their `_` fields through `JsValue`, so per-class slots are
the wrong shape. What upstream relies on is a **name contract**: every static occurrence of a
property name that matches the pattern (member accesses on any type, object-literal keys, class
fields and methods) is renamed through one program-wide map; dynamic computed keys are not.

Sketch: `[mangle] private_properties = "^_(?!_)"` (reserved names from `preserve_properties`).
After formation, collect the matching names with their static occurrence counts, give the most
frequent the shortest spellings that collide with no other property name of the program or the
host catalogs, and rewrite `js::Expr::Member` property literals, object-literal keys and class
member keys through the map before scoring, so the codec judgment sees the renamed text.
