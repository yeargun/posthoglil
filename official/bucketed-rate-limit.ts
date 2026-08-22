export const DEFAULT_EXCEPTION_RATE_LIMITER_REFILL_RATE = 1
export const DEFAULT_EXCEPTION_RATE_LIMITER_BUCKET_SIZE = 10

export function resolveExceptionRateLimiterConfig(
  config: {
    exceptionRateLimiterRefillRate?: number
    exceptionRateLimiterBucketSize?: number
    __exceptionRateLimiterRefillRate?: number
    __exceptionRateLimiterBucketSize?: number
  } = {},
): { refillRate: number; bucketSize: number } {
  return {
    refillRate:
      config.exceptionRateLimiterRefillRate ??
      config.__exceptionRateLimiterRefillRate ??
      DEFAULT_EXCEPTION_RATE_LIMITER_REFILL_RATE,
    bucketSize:
      config.exceptionRateLimiterBucketSize ??
      config.__exceptionRateLimiterBucketSize ??
      DEFAULT_EXCEPTION_RATE_LIMITER_BUCKET_SIZE,
  }
}

export type BucketedRateLimitBucket = { tokens: number; lastAccess: number }

function applyRefill(
  bucket: BucketedRateLimitBucket,
  now: number,
  refillRate: number,
  bucketSize: number,
  refillInterval: number,
): void {
  const elapsedMs = now - bucket.lastAccess
  const refillIntervals = Math.floor(elapsedMs / refillInterval)

  if (refillIntervals > 0) {
    const tokensToAdd = refillIntervals * refillRate
    bucket.tokens = Math.min(bucket.tokens + tokensToAdd, bucketSize)
    bucket.lastAccess = bucket.lastAccess + refillIntervals * refillInterval
  }
}

export function consumeBucketedRateLimit(
  buckets: Record<string, BucketedRateLimitBucket>,
  key: string | number,
  now: number,
  refillRate: number,
  bucketSize: number,
  refillInterval: number,
): boolean {
  const keyStr = String(key)

  let bucket = buckets[keyStr]

  if (!bucket) {
    bucket = { tokens: bucketSize, lastAccess: now }
    buckets[keyStr] = bucket
  } else {
    applyRefill(bucket, now, refillRate, bucketSize, refillInterval)
  }

  if (bucket.tokens === 0) {
    return true
  }

  bucket.tokens--

  return bucket.tokens === 0
}
