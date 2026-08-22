import { isNumber } from './type-utils'

type Logger = { warn: (...args: unknown[]) => void }

export function clampToRange(value: unknown, min: number, max: number, logger: Logger, fallbackValue?: number): number {
  if (min > max) {
    logger.warn('min cannot be greater than max.')
    min = max
  }

  if (!isNumber(value)) {
    logger.warn(' must be a number. using max or fallback. max: ' + max + ', fallback: ' + fallbackValue)
    return clampToRange(fallbackValue || max, min, max, logger)
  } else if (value > max) {
    logger.warn(' cannot be  greater than max: ' + max + '. Using max value instead.')
    return max
  } else if (value < min) {
    logger.warn(' cannot be less than min: ' + min + '. Using min value instead.')
    return min
  } else {
    return value
  }
}

export function getRemoteConfigBool(
  field: boolean | { [key: string]: unknown } | undefined,
  key: string,
  defaultValue: boolean = true,
): boolean {
  if (field == null) {
    return defaultValue
  }
  if (typeof field === 'boolean') {
    return field
  }
  if (typeof field === 'object') {
    const value = field[key]
    return typeof value === 'boolean' ? value : defaultValue
  }
  return defaultValue
}

export function getRemoteConfigNumber(
  field: boolean | { [key: string]: unknown } | undefined,
  key: string,
): number | undefined {
  if (field == null || typeof field !== 'object') {
    return undefined
  }

  const value = field[key]
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') {
      return undefined
    }
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  return undefined
}

export function isValidSampleRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}
