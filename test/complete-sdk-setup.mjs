import {vi} from 'vitest'

// Core and browser own different upstream test environments. In particular,
// browser turns unexpected console warnings into errors; core explicitly tests
// warning-producing helpers and must use its original setup instead.
if (typeof window === 'undefined') {
  vi.setConfig({fakeTimers:{toFake:['setTimeout','clearTimeout','setInterval','clearInterval','setImmediate','clearImmediate','Date','performance']}})
  await import('../vendor/posthog-js/tooling/vitest/setup-fake-timers.ts')
} else {
  await import('../vendor/posthog-js/packages/browser/src/__tests__/setup.js')
}
