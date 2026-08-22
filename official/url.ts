export function removeTrailingSlash(url: string | undefined): string | undefined {
  return url?.replace(/\/+$/, '')
}

export function stripUrlHash(url: string | undefined): string | undefined {
  if (!url) {
    return url as any
  }

  return url.split('#')[0] as any
}
