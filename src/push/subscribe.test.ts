import { describe, expect, it } from 'vitest'
import { ApiError } from '@/sync/api-client'
import {
  describePushError,
  isIos,
  pushSupport,
  toSubscriptionInput,
  urlBase64ToUint8Array,
} from './subscribe'
import type { PushEnvironment } from './subscribe'

const desktop: PushEnvironment = {
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130.0 Safari/537.36',
  platform: 'MacIntel',
  maxTouchPoints: 0,
  standalone: false,
}

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

describe('pushSupport', () => {
  it('is supported when all three APIs exist', () => {
    expect(pushSupport(desktop)).toBe('supported')
  })

  it('asks iPhone users in Safari to install the app first', () => {
    const iphone = {
      ...desktop,
      hasPushManager: false,
      hasNotification: false,
      userAgent: IPHONE_UA,
      platform: 'iPhone',
      maxTouchPoints: 5,
    }
    expect(pushSupport(iphone)).toBe('ios-not-installed')
  })

  it('treats an iPad that reports as a Mac like iOS', () => {
    const ipad = { ...desktop, hasPushManager: false, maxTouchPoints: 5 }
    expect(isIos(ipad)).toBe(true)
    expect(pushSupport(ipad)).toBe('ios-not-installed')
  })

  it('is unsupported on iOS when installed but the API is still missing, and on other browsers', () => {
    expect(
      pushSupport({ ...desktop, userAgent: IPHONE_UA, hasPushManager: false, standalone: true }),
    ).toBe('unsupported')
    expect(pushSupport({ ...desktop, hasServiceWorker: false })).toBe('unsupported')
  })
})

describe('urlBase64ToUint8Array', () => {
  it('decodes URL-safe base64 without padding', () => {
    // 0xfb 0xff 0xfe is "-__-" in url-safe base64
    expect([...urlBase64ToUint8Array('-__-')]).toEqual([0xfb, 0xff, 0xfe])
    expect([...urlBase64ToUint8Array('AQID')]).toEqual([1, 2, 3])
    expect([...urlBase64ToUint8Array('AQI')]).toEqual([1, 2])
    expect([...urlBase64ToUint8Array('AQ')]).toEqual([1])
  })

  it('decodes a 65 byte VAPID key', () => {
    const key = 'B' + 'A'.repeat(86)
    expect(urlBase64ToUint8Array(key)).toHaveLength(65)
  })
})

describe('toSubscriptionInput', () => {
  it('takes endpoint and keys only', () => {
    expect(
      toSubscriptionInput({
        endpoint: 'https://push.example/abc',
        keys: { p256dh: 'P', auth: 'A' },
        expirationTime: null,
      }),
    ).toEqual({ endpoint: 'https://push.example/abc', keys: { p256dh: 'P', auth: 'A' } })
  })

  it('rejects incomplete subscriptions', () => {
    expect(() => toSubscriptionInput({ endpoint: 'https://push.example/abc' })).toThrow()
    expect(() => toSubscriptionInput({ keys: { p256dh: 'P', auth: 'A' } })).toThrow()
  })
})

describe('describePushError', () => {
  it('explains the common failures in German', () => {
    expect(describePushError(new ApiError(503, 'x'))).toContain('noch nicht eingerichtet')
    expect(describePushError(new ApiError(401, 'x'))).toContain('Familienschlüssel')
    expect(describePushError(new DOMException('', 'NotAllowedError'))).toContain('blockiert')
    expect(describePushError(new DOMException('', 'AbortError'))).toContain('Push-Dienst')
    expect(describePushError(new TypeError('fetch failed'))).toContain('Keine Verbindung')
    expect(describePushError('boom')).toContain('nicht geklappt')
  })
})
