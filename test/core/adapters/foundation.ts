import { cookieStore, localStore, sessionStore, memoryStore, createLocalPlusCookieStore, chooseCookieDomain, resetSubDomainCache } from '@upstream/storage'
import { _copyAndTruncateStrings, isCrossDomainCookie, extend, stripEmptyProperties } from '@posthog/browser-common/utils/general-utils'
import { isEmptyObject, isString, isNumber, isObject } from '@posthog/core'
import { getCookieValue } from '@posthog/browser-common/utils/cookie-utils'
import { uuidv7 } from '@posthog/browser-common/utils/uuidv7'
import { logger } from '@posthog/browser-common/utils/logger'
import Config from '@upstream/config'

function storeFor(kind: string, custom: any, prefer: boolean): any {
    if (kind === 'cookie') return cookieStore
    if (kind === 'local') return localStore
    if (kind === 'session') return sessionStore
    if (kind === 'memory') return memoryStore
    return createLocalPlusCookieStore(custom, prefer)
}

export function storeOp(kind: string, custom: any, prefer: boolean, op: string, name: string, value: any, days: any, cross: any, secure: any): any {
    const store = storeFor(kind, custom, prefer)
    if (op === 'supported') return store._is_supported()
    if (op === 'get') return store._get(name)
    if (op === 'parse') return store._parse(name)
    if (op === 'set') return store._set(name, value, days, cross, secure)
    store._remove(name, cross)
    return undefined
}

export function utilOp(op: string, a: any, b: any): any {
    if (op === 'truncate') return _copyAndTruncateStrings(a, b)
    if (op === 'crossDomain') return isCrossDomainCookie(a)
    if (op === 'extend') return extend(a, b)
    if (op === 'emptyObject') return isEmptyObject(a)
    if (op === 'isString') return isString(a)
    if (op === 'isNumber') return isNumber(a)
    if (op === 'isObject') return isObject(a)
    if (op === 'strip') return stripEmptyProperties(a)
    if (op === 'cookieDomain') return chooseCookieDomain(String(a), b)
    if (op === 'resetDomain') { resetSubDomainCache(); return undefined }
    if (op === 'cookie') return getCookieValue(String(a))
    if (op === 'uuid') return uuidv7()
    if (op === 'debug') { Config.DEBUG = !!a; return undefined }
    if (op === 'log') { logger.info('hello', a); logger.critical('crit', b); return undefined }
    return undefined
}

import { PostHogPersistence } from '@upstream/posthog-persistence'
import { getEventProperties, getCampaignParams, getPersonInfo, getInitialPersonPropsFromInfo, getReferrerInfo, getSearchInfo } from '@posthog/browser-common/utils/event-utils'
import { getQueryParam, maskQueryParams } from '@posthog/browser-common/utils/request-utils'

export function newPersistence(config: any, disabled: boolean, owns: boolean): any {
    return new PostHogPersistence(config, disabled, owns)
}

export function eventOp(op: string, a: any, b: any, c: any, d: any): any {
    if (op === 'eventProps') return getEventProperties(a, b, c, !!d)
    if (op === 'campaign') return getCampaignParams(a, b, c)
    if (op === 'personInfo') return getPersonInfo(a, b, !!c)
    if (op === 'initialPerson') return getInitialPersonPropsFromInfo(a, !!b)
    if (op === 'referrer') return getReferrerInfo()
    if (op === 'search') return getSearchInfo()
    if (op === 'query') return getQueryParam(String(a), String(b))
    if (op === 'mask') return maskQueryParams(a, b, String(c))
    return undefined
}
