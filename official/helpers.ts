export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && value === value
}

export function isNoLike(value: unknown): boolean {
  return value === false || value === 'false' || value === 0 || value === '0' || value === 'no'
}

export function includes<T>(list: readonly T[], needle: T): boolean {
  return list.indexOf(needle) !== -1
}
