export type JsonType =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonType }
  | JsonType[]

export type FeatureFlagValue = boolean | string

export type FeatureFlagDetail = {
  key: string
  enabled: boolean
  variant?: string
  reason?: unknown
  metadata?: {
    id?: number
    version?: unknown
    payload?: string
    description?: unknown
  }
}

export type FeatureFlagResult = {
  key: string
  enabled: boolean
  variant?: string
  payload: JsonType | null
}

export type CookieStore = {
  get(name: string): { value: string } | undefined
}

export type PostHogCookieState = {
  distinctId: string
  isIdentified: boolean
  sessionId?: string
  deviceId?: string
}

export type ConsentCookieConfig = {
  consent_persistence_name?: string | null
  opt_out_capturing_cookie_prefix?: string | null
  opt_out_capturing_by_default?: boolean
}

export type RouterConfig = {
  api_host: string
  flags_api_host?: string
  ui_host?: string
  asset_host?: string
}

export type RequestRouterRegion = "us" | "eu" | "custom"
export type RequestRouterTarget = "api" | "ui" | "assets" | "flags"

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

export type QueueItem = {
  url: string
  batchKey?: string
  data: unknown
}

export type BatchedRequest = {
  url: string
  batchKey?: string
  data: unknown[]
}

export const MINIMAL_FLAG_CALLED_EVENT_CAMPAIGN_PROPERTIES: string[]
export const MINIMAL_FLAG_CALLED_EVENT_PROPERTIES: string[]

export function uuidv7(): string
export function uuidv4(): string
export function parseUuid(value: string): string
export function uuidFromFieldsV7(
  unixTsMs: number,
  randA: number,
  randBHi: number,
  randBLo: number,
): string
export function uuidToHex(value: string): string

export function parsePayload(response: unknown): unknown
export function getFeatureFlagValue(detail: FeatureFlagDetail | undefined): FeatureFlagValue | undefined
export function getFlagValuesFromFlags(flags: Record<string, FeatureFlagDetail> | undefined): Record<string, FeatureFlagValue>
export function getPayloadsFromFlags(flags: Record<string, FeatureFlagDetail> | undefined): Record<string, unknown>
export function normalizeFlagsResponse(flagsResponse: object): object
export function createFlagsResponseFromFlagsAndPayloads(
  featureFlags: Record<string, FeatureFlagValue>,
  featureFlagPayloads: Record<string, unknown>,
): object
export function updateFlagValue(flag: FeatureFlagDetail, value: FeatureFlagValue): FeatureFlagDetail
export function flagDetailsToResults(flagDetails: Record<string, FeatureFlagDetail>): FeatureFlagResult[]
export function minimizeFlagCalledEventProperties(
  properties: Record<string, unknown>,
  transportKeys?: readonly string[],
): Record<string, unknown>

export function getPostHogCookieName(apiKey: string): string
export function serializePostHogCookie(anonymousId: string): string
export function parsePostHogCookie(cookieValue: string | null | undefined): PostHogCookieState | null
export function cookieStoreFromHeader(cookieHeader: string): CookieStore
export function readPostHogCookie(cookies: CookieStore, apiKey: string): PostHogCookieState | null
export function cookieStateToProperties(
  state: PostHogCookieState | null | undefined,
): Record<string, string> | undefined
export function getConsentCookieName(apiKey: string, config?: ConsentCookieConfig | null): string
export function isOptedOut(
  cookies: CookieStore,
  apiKey: string,
  config?: ConsentCookieConfig | null,
): boolean

export function apiHostFromConfig(apiHost: string): string
export function flagsApiHostFromConfig(config: RouterConfig): string
export function uiHostFromConfig(config: RouterConfig): string
export function regionForHost(apiHost: string): RequestRouterRegion
export function endpointFor(config: RouterConfig, target: RequestRouterTarget, path?: string): string

export function rateLimitContext(
  bucket: Partial<RateLimitBucket> | null | undefined,
  now: number,
  eventsPerSecond: number,
  burstLimit: number,
  checkOnly: boolean,
): RateLimitResult

export function clampFlushInterval(value: unknown): number
export function formatQueue(items: QueueItem[]): Record<string, BatchedRequest>
export function applyOffsets(
  data: Array<Record<string, unknown>>,
  now: number,
): Array<Record<string, unknown>>
export function sortUnloadRequests<T extends { url: string }>(requests: T[]): T[]

export const DEFAULT_BLOCKED_UA_STRS: string[]
export function isBlockedUA(ua: string | undefined, customBlockedUserAgents?: string[]): boolean

export function includes(str: string, needle: string): boolean
export function includes<T>(arr: T[], needle: T): boolean
export function trim(str: string): string
export function stripLeadingDollar(s: string): string
export function isDistinctIdStringLike(value: string): boolean
export function getPersonPropertiesHash(
  distinct_id: string,
  userPropertiesToSet?: { [key: string]: JsonType },
  userPropertiesToSetOnce?: { [key: string]: JsonType },
): string

export function clampToRange(
  value: unknown,
  min: number,
  max: number,
  logger: { warn: (...args: unknown[]) => void },
  fallbackValue?: number,
): number
export function getRemoteConfigBool(
  field: boolean | { [key: string]: JsonType } | undefined,
  key: string,
  defaultValue?: boolean,
): boolean
export function getRemoteConfigNumber(
  field: boolean | { [key: string]: JsonType } | undefined,
  key: string,
): number | undefined
export function isValidSampleRate(value: unknown): value is number

export function isNumber(x: unknown): x is number
export function isEmptyObject(x: unknown): boolean
export function isEmptyString(x: unknown): boolean
export function isPositiveNumber(value: unknown): value is number
export function isPrimitive(value: unknown): boolean
export function isBuiltin(candidate: unknown, className: string): boolean
export function isYesLike(val: string | boolean | number): boolean
export function isNoLike(val: string | boolean | number): boolean
export function isKnownUnsafeEditableEvent(x: unknown): boolean
export function isKnownUnsafeEditableEventProperty(x: unknown): boolean
export const knownUnsafeEditableEvent: readonly string[]
export const knownUnsafeEditableEventProperty: readonly string[]
export const yesLikeValues: Array<string | boolean | number>
export const noLikeValues: Array<string | boolean | number>

export function sanitizeString(value: string): string
export function removeTrailingSlash(url: string | undefined): string | undefined
export function stripUrlHash(url: string | undefined): string | undefined

export const DEFAULT_EXCEPTION_RATE_LIMITER_REFILL_RATE: number
export const DEFAULT_EXCEPTION_RATE_LIMITER_BUCKET_SIZE: number
export function resolveExceptionRateLimiterConfig(config?: {
  exceptionRateLimiterRefillRate?: number
  exceptionRateLimiterBucketSize?: number
  __exceptionRateLimiterRefillRate?: number
  __exceptionRateLimiterBucketSize?: number
}): { refillRate: number; bucketSize: number }
export function consumeBucketedRateLimit(
  buckets: Record<string, { tokens: number; lastAccess: number }>,
  key: string | number,
  now: number,
  refillRate: number,
  bucketSize: number,
  refillInterval: number,
): boolean

declare const kernel: {
  uuidv7: typeof uuidv7
  uuidv4: typeof uuidv4
  parseUuid: typeof parseUuid
  uuidFromFieldsV7: typeof uuidFromFieldsV7
  uuidToHex: typeof uuidToHex
  MINIMAL_FLAG_CALLED_EVENT_PROPERTIES: typeof MINIMAL_FLAG_CALLED_EVENT_PROPERTIES
  MINIMAL_FLAG_CALLED_EVENT_CAMPAIGN_PROPERTIES: typeof MINIMAL_FLAG_CALLED_EVENT_CAMPAIGN_PROPERTIES
  normalizeFlagsResponse: typeof normalizeFlagsResponse
  getFeatureFlagValue: typeof getFeatureFlagValue
  getFlagValuesFromFlags: typeof getFlagValuesFromFlags
  getPayloadsFromFlags: typeof getPayloadsFromFlags
  createFlagsResponseFromFlagsAndPayloads: typeof createFlagsResponseFromFlagsAndPayloads
  minimizeFlagCalledEventProperties: typeof minimizeFlagCalledEventProperties
  parsePayload: typeof parsePayload
  updateFlagValue: typeof updateFlagValue
  flagDetailsToResults: typeof flagDetailsToResults
  getPostHogCookieName: typeof getPostHogCookieName
  serializePostHogCookie: typeof serializePostHogCookie
  parsePostHogCookie: typeof parsePostHogCookie
  cookieStoreFromHeader: typeof cookieStoreFromHeader
  readPostHogCookie: typeof readPostHogCookie
  cookieStateToProperties: typeof cookieStateToProperties
  getConsentCookieName: typeof getConsentCookieName
  isOptedOut: typeof isOptedOut
  apiHostFromConfig: typeof apiHostFromConfig
  flagsApiHostFromConfig: typeof flagsApiHostFromConfig
  uiHostFromConfig: typeof uiHostFromConfig
  regionForHost: typeof regionForHost
  endpointFor: typeof endpointFor
  rateLimitContext: typeof rateLimitContext
  clampFlushInterval: typeof clampFlushInterval
  formatQueue: typeof formatQueue
  applyOffsets: typeof applyOffsets
  sortUnloadRequests: typeof sortUnloadRequests
  DEFAULT_BLOCKED_UA_STRS: typeof DEFAULT_BLOCKED_UA_STRS
  isBlockedUA: typeof isBlockedUA
  includes: typeof includes
  trim: typeof trim
  stripLeadingDollar: typeof stripLeadingDollar
  isDistinctIdStringLike: typeof isDistinctIdStringLike
  getPersonPropertiesHash: typeof getPersonPropertiesHash
  clampToRange: typeof clampToRange
  getRemoteConfigBool: typeof getRemoteConfigBool
  getRemoteConfigNumber: typeof getRemoteConfigNumber
  isValidSampleRate: typeof isValidSampleRate
  isNumber: typeof isNumber
  isEmptyObject: typeof isEmptyObject
  isEmptyString: typeof isEmptyString
  isPositiveNumber: typeof isPositiveNumber
  isPrimitive: typeof isPrimitive
  isBuiltin: typeof isBuiltin
  isYesLike: typeof isYesLike
  isNoLike: typeof isNoLike
  isKnownUnsafeEditableEvent: typeof isKnownUnsafeEditableEvent
  isKnownUnsafeEditableEventProperty: typeof isKnownUnsafeEditableEventProperty
  knownUnsafeEditableEvent: typeof knownUnsafeEditableEvent
  knownUnsafeEditableEventProperty: typeof knownUnsafeEditableEventProperty
  yesLikeValues: typeof yesLikeValues
  noLikeValues: typeof noLikeValues
  sanitizeString: typeof sanitizeString
  removeTrailingSlash: typeof removeTrailingSlash
  stripUrlHash: typeof stripUrlHash
  DEFAULT_EXCEPTION_RATE_LIMITER_REFILL_RATE: typeof DEFAULT_EXCEPTION_RATE_LIMITER_REFILL_RATE
  DEFAULT_EXCEPTION_RATE_LIMITER_BUCKET_SIZE: typeof DEFAULT_EXCEPTION_RATE_LIMITER_BUCKET_SIZE
  resolveExceptionRateLimiterConfig: typeof resolveExceptionRateLimiterConfig
  consumeBucketedRateLimit: typeof consumeBucketedRateLimit
}

export default kernel
