import { isArray, isNoLike } from './helpers'
import { uuidv7 } from './uuidv7'

const COOKIE_PREFIX = 'ph_'
const COOKIE_SUFFIX = '_posthog'
const CONSENT_PREFIX = '__ph_opt_in_out_'

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

export function cookieStoreFromHeader(cookieHeader: string): CookieStore {
  const cookies: Record<string, string> = {}
  if (cookieHeader) {
    for (const pair of cookieHeader.split(';')) {
      const [key, ...valueParts] = pair.trim().split('=')
      if (key) {
        const raw = valueParts.join('=').trim()
        try {
          cookies[key.trim()] = decodeURIComponent(raw)
        } catch {
          cookies[key.trim()] = raw
        }
      }
    }
  }
  return { get: (name: string) => (name in cookies ? { value: cookies[name] } : undefined) }
}

export function getPostHogCookieName(apiKey: string): string {
  const sanitized = apiKey.replace(/\+/g, 'PL').replace(/\//g, 'SL').replace(/=/g, 'EQ')
  return `${COOKIE_PREFIX}${sanitized}${COOKIE_SUFFIX}`
}

export function serializePostHogCookie(anonymousId: string): string {
  const now = Date.now()
  const sessionId = uuidv7()
  return JSON.stringify({
    distinct_id: anonymousId,
    $device_id: anonymousId,
    $user_state: 'anonymous',
    $sesid: [now, sessionId, now],
  })
}

export function parsePostHogCookie(cookieValue: string): PostHogCookieState | null {
  if (!cookieValue) {
    return null
  }

  try {
    const parsed = JSON.parse(cookieValue)
    if (!parsed || typeof parsed !== 'object' || !parsed.distinct_id) {
      return null
    }

    const sesid = isArray(parsed.$sesid) ? parsed.$sesid[1] : undefined

    return {
      distinctId: String(parsed.distinct_id),
      isIdentified: parsed.$user_state === 'identified',
      sessionId: typeof sesid === 'string' ? sesid : undefined,
      deviceId: typeof parsed.$device_id === 'string' ? parsed.$device_id : undefined,
    }
  } catch {
    return null
  }
}

export function readPostHogCookie(cookies: CookieStore, apiKey: string): PostHogCookieState | null {
  const cookie = cookies.get(getPostHogCookieName(apiKey))
  return cookie ? parsePostHogCookie(cookie.value) : null
}

export function cookieStateToProperties(state: PostHogCookieState | null): Record<string, string> | undefined {
  if (!state) {
    return undefined
  }
  const props: Record<string, string> = {}
  if (state.sessionId) {
    props.$session_id = state.sessionId
  }
  if (state.deviceId) {
    props.$device_id = state.deviceId
  }
  return Object.keys(props).length > 0 ? props : undefined
}

export function getConsentCookieName(apiKey: string, config?: ConsentCookieConfig): string {
  if (config?.consent_persistence_name) {
    return config.consent_persistence_name
  }
  if (config?.opt_out_capturing_cookie_prefix) {
    return config.opt_out_capturing_cookie_prefix + apiKey
  }
  return CONSENT_PREFIX + apiKey
}

export function isOptedOut(cookies: CookieStore, apiKey: string, config?: ConsentCookieConfig): boolean {
  const cookie = cookies.get(getConsentCookieName(apiKey, config))
  if (cookie) {
    return isNoLike(cookie.value)
  }
  return config?.opt_out_capturing_by_default ?? false
}
