import { UUID, uuidv4, uuidv7 } from './uuidv7'
import {
  MINIMAL_FLAG_CALLED_EVENT_CAMPAIGN_PROPERTIES,
  MINIMAL_FLAG_CALLED_EVENT_PROPERTIES,
  createFlagsResponseFromFlagsAndPayloads,
  flagDetailsToResults,
  getFeatureFlagValue,
  getFlagValuesFromFlags,
  getPayloadsFromFlags,
  minimizeFlagCalledEventProperties,
  normalizeFlagsResponse,
  parsePayload,
  updateFlagValue,
} from './feature-flags'
import {
  cookieStateToProperties,
  cookieStoreFromHeader,
  getConsentCookieName,
  getPostHogCookieName,
  isOptedOut,
  parsePostHogCookie,
  readPostHogCookie,
  serializePostHogCookie,
} from './cookie'
import { apiHostFromConfig, endpointFor, flagsApiHostFromConfig, regionForHost, uiHostFromConfig } from './router'
import { rateLimitContext } from './rate-limit'
import { applyOffsets, clampFlushInterval, formatQueue, sortUnloadRequests } from './queue'

export function parseUuid(value: string): string {
  return UUID.parse(value).toString()
}

export function uuidFromFieldsV7(unixTsMs: number, randA: number, randBHi: number, randBLo: number): string {
  return UUID.fromFieldsV7(unixTsMs, randA, randBHi, randBLo).toString()
}

export function uuidToHex(value: string): string {
  return UUID.parse(value).toHex()
}

const kernel = {
  uuidv7,
  uuidv4,
  parseUuid,
  uuidFromFieldsV7,
  uuidToHex,
  normalizeFlagsResponse,
  getFeatureFlagValue,
  getFlagValuesFromFlags,
  getPayloadsFromFlags,
  createFlagsResponseFromFlagsAndPayloads,
  minimizeFlagCalledEventProperties,
  parsePayload,
  updateFlagValue,
  flagDetailsToResults,
  MINIMAL_FLAG_CALLED_EVENT_PROPERTIES,
  MINIMAL_FLAG_CALLED_EVENT_CAMPAIGN_PROPERTIES,
  getPostHogCookieName,
  serializePostHogCookie,
  parsePostHogCookie,
  cookieStoreFromHeader,
  readPostHogCookie,
  cookieStateToProperties,
  getConsentCookieName,
  isOptedOut,
  apiHostFromConfig,
  flagsApiHostFromConfig,
  uiHostFromConfig,
  regionForHost,
  endpointFor,
  rateLimitContext,
  clampFlushInterval,
  formatQueue,
  applyOffsets,
  sortUnloadRequests,
}

export {
  uuidv7,
  uuidv4,
  MINIMAL_FLAG_CALLED_EVENT_PROPERTIES,
  MINIMAL_FLAG_CALLED_EVENT_CAMPAIGN_PROPERTIES,
  normalizeFlagsResponse,
  getFeatureFlagValue,
  getFlagValuesFromFlags,
  getPayloadsFromFlags,
  createFlagsResponseFromFlagsAndPayloads,
  minimizeFlagCalledEventProperties,
  parsePayload,
  updateFlagValue,
  flagDetailsToResults,
  getPostHogCookieName,
  serializePostHogCookie,
  parsePostHogCookie,
  cookieStoreFromHeader,
  readPostHogCookie,
  cookieStateToProperties,
  getConsentCookieName,
  isOptedOut,
  apiHostFromConfig,
  flagsApiHostFromConfig,
  uiHostFromConfig,
  regionForHost,
  endpointFor,
  rateLimitContext,
  clampFlushInterval,
  formatQueue,
  applyOffsets,
  sortUnloadRequests,
}

export default kernel
