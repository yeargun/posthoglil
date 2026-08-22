import { isNumber } from './helpers'

export type RateLimitBucket = {
  tokens: number
  last: number
  dropped: number
}

export type RateLimitResult = {
  isRateLimited: boolean
  remainingTokens: number
  bucket: RateLimitBucket
}

export function rateLimitContext(
  bucket: Partial<RateLimitBucket> | null | undefined,
  now: number,
  eventsPerSecond: number,
  burstLimit: number,
  checkOnly: boolean,
): RateLimitResult {
  const next: RateLimitBucket = {
    tokens: isNumber(bucket?.tokens) ? bucket.tokens : burstLimit,
    last: isNumber(bucket?.last) ? bucket.last : now,
    dropped: isNumber(bucket?.dropped) ? bucket.dropped : 0,
  }

  next.tokens += ((now - next.last) / 1000) * eventsPerSecond
  next.last = now

  if (next.tokens > burstLimit) {
    next.tokens = burstLimit
  }

  const isRateLimited = next.tokens < 1

  if (!isRateLimited && !checkOnly) {
    next.tokens = Math.max(0, next.tokens - 1)
  }

  if (isRateLimited && !checkOnly) {
    next.dropped += 1
  }

  return {
    isRateLimited,
    remainingTokens: next.tokens,
    bucket: next,
  }
}
