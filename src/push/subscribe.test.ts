import { describe, expect, it } from 'vitest'
import { ApiError } from '@/sync/api-client'
import {
  defaultDeviceLabel,
  describePushError,
  isIos,
  pushSupport,
  sameKey,
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

describe('defaultDeviceLabel', () => {
  it('uses userAgentData when present', () => {
    expect(
      defaultDeviceLabel({
        userAgent: '',
        brands: ['Not A;Brand', 'Chromium', 'Google Chrome'],
        platform: 'macOS',
      }),
    ).toBe('Chrome auf Mac')
  })

  it('falls back to the user agent', () => {
    expect(defaultDeviceLabel({ userAgent: IPHONE_UA })).toBe('Safari auf iPhone')
    expect(
      defaultDeviceLabel({
        userAgent: 'Mozilla/5.0 (Android 15; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0',
      }),
    ).toBe('Firefox auf Android')
    expect(defaultDeviceLabel({ userAgent: 'curl/8' })).toBe('Dieses Gerät')
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

describe('sameKey', () => {
  it('compares bytes', () => {
    const expected = new Uint8Array([1, 2, 3])
    expect(sameKey(new Uint8Array([1, 2, 3]).buffer, expected)).toBe(true)
    expect(sameKey(new Uint8Array([1, 2, 4]).buffer, expected)).toBe(false)
    expect(sameKey(new Uint8Array([1, 2]).buffer, expected)).toBe(false)
    expect(sameKey(null, expected)).toBe(false)
  })
})

describe('toSubscriptionInput', () => {
  it('takes endpoint and keys and trims the label', () => {
    expect(
      toSubscriptionInput(
        { endpoint: 'https://push.example/abc', keys: { p256dh: 'P', auth: 'A' } },
        '  Lenas Handy ',
      ),
    ).toEqual({
      endpoint: 'https://push.example/abc',
      keys: { p256dh: 'P', auth: 'A' },
      label: 'Lenas Handy',
    })
  })

  it('rejects incomplete subscriptions', () => {
    expect(() => toSubscriptionInput({ endpoint: 'https://push.example/abc' }, 'x')).toThrow()
    expect(() => toSubscriptionInput({ keys: { p256dh: 'P', auth: 'A' } }, 'x')).toThrow()
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
