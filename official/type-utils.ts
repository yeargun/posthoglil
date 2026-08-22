import { includes } from './string-utils'

const ObjProto = Object.prototype
export const hasOwnProperty = ObjProto.hasOwnProperty
const toString = ObjProto.toString

export const isArray = Array.isArray

export const isObject = (x: unknown): x is Record<string, any> => {
  return x === Object(x) && !isArray(x)
}

export const isEmptyObject = (x: unknown) => {
  if (isObject(x)) {
    for (const key in x) {
      if (hasOwnProperty.call(x, key)) {
        return false
      }
    }
    return true
  }
  return false
}

export const isString = (x: unknown): x is string => {
  return toString.call(x) == '[object String]'
}

export const isEmptyString = (x: unknown): boolean => isString(x) && x.trim().length === 0

export const isNumber = (x: unknown): x is number => {
  return toString.call(x) == '[object Number]' && x === x
}

export const isPositiveNumber = (value: unknown): value is number => {
  return isNumber(value) && value > 0
}

export function isPrimitive(value: unknown): boolean {
  return value === null || typeof value !== 'object'
}

export function isBuiltin(candidate: unknown, className: string): boolean {
  return Object.prototype.toString.call(candidate) === `[object ${className}]`
}

export const knownUnsafeEditableEvent = [
  '$snapshot',
  '$pageview',
  '$pageleave',
  '$set',
  'survey dismissed',
  'survey sent',
  'survey shown',
  '$identify',
  '$groupidentify',
  '$create_alias',
  '$$client_ingestion_warning',
  '$web_experiment_applied',
  '$feature_enrollment_update',
  '$feature_flag_called',
] as const

export const knownUnsafeEditableEventProperty = ['token'] as const

export const isKnownUnsafeEditableEvent = (x: unknown): boolean => {
  return includes(knownUnsafeEditableEvent as unknown as string[], x)
}

export const isKnownUnsafeEditableEventProperty = (x: unknown): boolean => {
  return includes(knownUnsafeEditableEventProperty as unknown as string[], x)
}

export const yesLikeValues = [true, 'true', 1, '1', 'yes']
export const isYesLike = (val: string | boolean | number): boolean => includes(yesLikeValues, val)
export const noLikeValues = [false, 'false', 0, '0', 'no']
export const isNoLike = (val: string | boolean | number): boolean => includes(noLikeValues, val)
