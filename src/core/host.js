// The two JavaScript operators LilScript cannot spell yet (language R13 `is`, R7 spread
// calls). Delivered with `delivery.host_modules = "embed"`, so the compiler lowers them
// into the output as plain `instanceof` and `new` expressions.
export const instanceOf = (value, ctor) => value instanceof ctor
export const noop = function () {}
