export function includes(str: string, needle: string): boolean
export function includes<T>(arr: T[], needle: T): boolean
export function includes(str: unknown[] | string, needle: unknown): boolean {
  return (str as any).indexOf(needle) !== -1
}

export const trim = function (str: string): string {
  return str.trim()
}

export const stripLeadingDollar = function (s: string): string {
  return s.replace(/^\$/, '')
}

export function isDistinctIdStringLike(value: string): boolean {
  return ['distinct_id', 'distinctid'].includes(value.toLowerCase())
}

function deepSortKeys(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value
  }

  if (Array.isArray(value)) {
    return value.map(deepSortKeys)
  }

  return Object.keys(value)
    .sort()
    .reduce((acc: { [key: string]: unknown }, key) => {
      acc[key] = deepSortKeys((value as { [key: string]: unknown })[key])
      return acc
    }, {})
}

export function getPersonPropertiesHash(
  distinct_id: string,
  userPropertiesToSet?: { [key: string]: unknown },
  userPropertiesToSetOnce?: { [key: string]: unknown },
): string {
  return JSON.stringify({
    distinct_id,
    userPropertiesToSet: userPropertiesToSet ? deepSortKeys(userPropertiesToSet) : undefined,
    userPropertiesToSetOnce: userPropertiesToSetOnce ? deepSortKeys(userPropertiesToSetOnce) : undefined,
  })
}
