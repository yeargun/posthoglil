import { describe, expect, it } from 'vitest'
import { UUID } from '../vendor/posthog-js/packages/browser-common/src/utils/uuidv7'
import { each, errorToProperties, extend, safewrap } from '../vendor/posthog-js/packages/browser-common/src/utils/general-utils'
import { RequestRouter } from '../vendor/posthog-js/packages/browser/src/utils/request-router'
import { RetryQueue } from '../vendor/posthog-js/packages/browser/src/retry-queue'
import { RateLimiter } from '../vendor/posthog-js/packages/browser/src/rate-limiter'
import { ConsentManager } from '../vendor/posthog-js/packages/browser/src/consent'
import { SessionIdManager } from '../vendor/posthog-js/packages/browser/src/sessionid'

describe('whole-module port boundary behavior', () => {
  it.each([
    ['RequestRouter', RequestRouter, ['apiHost', 'flagsApiHost', 'uiHost', 'region']],
    ['RetryQueue', RetryQueue, ['length']],
    ['RateLimiter', RateLimiter, ['captureEventsPerSecond', 'captureEventsBurstLimit']],
    ['ConsentManager', ConsentManager, ['_config', 'consent', '_storageKey', '_storedConsent', '_storage']],
    ['SessionIdManager', SessionIdManager, ['sessionTimeoutMs']],
  ] as const)('preserves native class getter descriptors for %s', (_name, constructor, names) => {
    expect(Object.getOwnPropertyNames(constructor.prototype).some(name => name.startsWith('__lil_'))).toBe(false)
    for (const name of names) {
      const descriptor = Object.getOwnPropertyDescriptor(constructor.prototype, name)!
      expect(descriptor.enumerable).toBe(false)
      expect(descriptor.configurable).toBe(true)
      expect(descriptor.set).toBeUndefined()
      expect(descriptor.get!.name).toBe(`get ${name}`)
      expect(descriptor.get!.length).toBe(0)
      expect(Object.hasOwn(descriptor.get!, 'prototype')).toBe(false)
      expect(() => Reflect.construct(Object, [], descriptor.get!)).toThrow(TypeError)
    }
  })

  it('preserves the native UUID static method ABI', () => {
    const descriptor = Object.getOwnPropertyDescriptor(UUID, 'fromFieldsV7')!
    expect(descriptor).toMatchObject({ enumerable: false, configurable: true, writable: true })
    expect(descriptor.value.name).toBe('fromFieldsV7')
    expect(descriptor.value.length).toBe(4)
    expect(Object.hasOwn(descriptor.value, 'prototype')).toBe(false)
    expect(() => Reflect.construct(Object, [], descriptor.value)).toThrow(TypeError)
    expect(Object.getOwnPropertyNames(UUID.prototype).some(name => name.startsWith('__lil_'))).toBe(false)
  })

  it.each([
    [0, 0, 0, 0, '00000000-0000-7000-8000-000000000000'],
    [0xffffffffffff, 0xfff, 0x3fffffff, 0xffffffff, 'ffffffff-ffff-7fff-bfff-ffffffffffff'],
    [0x123456789abc, 0xdef, 0x12345678, 0x9abcdef0, '12345678-9abc-7def-9234-56789abcdef0'],
  ])('preserves UUID fields across the full unsigned ranges', (timestamp, a, hi, lo, expected) => {
    const uuid = UUID.fromFieldsV7(timestamp as number, a as number, hi as number, lo as number)
    expect(uuid.toString()).toBe(expected)
    expect(uuid).toBeInstanceOf(UUID)
    expect(uuid.clone().toString()).toBe(expected)
    expect(uuid.clone().bytes).not.toBe(uuid.bytes)
  })

  it('keeps the caller-owned byte array observable', () => {
    const bytes = new Uint8Array(16)
    const value = new UUID(bytes)
    expect(value.bytes).toBe(bytes)
    const clone = value.clone()
    bytes[0] = 255
    expect(value.toString()).toBe('ff000000-0000-0000-0000-000000000000')
    expect(clone.toString()).toBe('00000000-0000-0000-0000-000000000000')
    expect(value.compareTo(clone)).toBe(1)
    expect(clone.compareTo(value)).toBe(-1)
    expect(clone.equals(value)).toBe(false)
  })

  it('rejects invalid UUID fields without narrowing them into valid int32 values', () => {
    for (const value of [-1, 0.5, NaN, Infinity, -Infinity, '0', null, undefined]) {
      for (let position = 0; position < 4; position++) {
        const args: any[] = [0, 0, 0, 0]
        args[position] = value
        expect(() => (UUID.fromFieldsV7 as any)(...args)).toThrow(RangeError)
      }
    }
    for (const args of [[2 ** 48, 0, 0, 0], [0, 2 ** 12, 0, 0], [0, 0, 2 ** 30, 0], [0, 0, 0, 2 ** 32]]) {
      expect(() => (UUID.fromFieldsV7 as any)(...args)).toThrow(RangeError)
    }
  })

  it('retains symbols, own __proto__ data, and Error getter evaluation order', () => {
    const calls: string[] = []
    const symbol = Symbol('detail')
    const error = new Error('failure')
    error.stack = 'stack'
    Object.defineProperty(error, '__proto__', { value: { private: true }, enumerable: true })
    Object.defineProperty(error, 'custom', { enumerable: true, get() { calls.push('custom'); return 3 } })
    Object.defineProperty(error, symbol, { enumerable: true, get() { calls.push('symbol'); return 4 } })
    const result = errorToProperties(error)
    expect(calls).toEqual(['custom', 'symbol'])
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
    expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(true)
    expect((result as any)[symbol]).toBe(4)
    expect(result).toMatchObject({ custom: 3, name: 'Error', message: 'failure', stack: 'stack' })
  })

  it('does not turn inherited enumeration or sparse arrays into own dense iteration', () => {
    const seen: unknown[] = []
    const input = Object.assign(Object.create({ inherited: 1 }), { own: 2 })
    each(input, (value, key) => seen.push([key, value]))
    expect(seen).toEqual([['own', 2]])
    const sparse = new Array(3)
    sparse[1] = 'middle'
    each(sparse, (value, key) => seen.push([key, value]))
    expect(seen).toEqual([['own', 2], [1, 'middle']])
    expect(extend({}, input)).toEqual({ own: 2, inherited: 1 })
  })

  it('preserves receiver and argument forwarding in safe wrappers', () => {
    const owner = { tag: 'owner' }
    const method = safewrap(function (this: typeof owner, ...args: unknown[]) {
      return { tag: this.tag, args }
    })
    expect(method.call(owner, 1, undefined, 3)).toEqual({ tag: 'owner', args: [1, undefined, 3] })
  })
})
