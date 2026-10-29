import type { ApiClient } from '@/sync/api-client'
import { ApiError } from '@/sync/api-client'

/**
 * Web Push in the browser: feature detection, the iOS "not installed" case, subscribing with the
 * server's VAPID key and unsubscribing. Pure helpers first (tested), browser calls at the end.
 */

/* oxlint-disable compat/compat -- callers check `pushSupport()` before touching these APIs */

export type PushEnvironment = {
  hasServiceWorker: boolean
  hasPushManager: boolean
  hasNotification: boolean
  userAgent: string
  platform: string
  maxTouchPoints: number
  /** Running as an installed app (home screen), not in a browser tab. */
  standalone: boolean
}

export type PushSupport = 'supported' | 'ios-not-installed' | 'unsupported'

export function isIos({
  userAgent,
  platform,
  maxTouchPoints,
}: Pick<PushEnvironment, 'userAgent' | 'platform' | 'maxTouchPoints'>): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true
  // iPadOS reports itself as a Mac, but has a touch screen.
  return platform === 'MacIntel' && maxTouchPoints > 1
}

/**
 * iOS only offers push to apps added to the home screen: in a Safari tab `PushManager` is missing,
 * so the user needs the hint instead of a dead end.
 */
export function pushSupport(env: PushEnvironment): PushSupport {
  if (env.hasServiceWorker && env.hasPushManager && env.hasNotification) return 'supported'
  if (isIos(env) && !env.standalone) return 'ios-not-installed'
  return 'unsupported'
}

export function readPushEnvironment(): PushEnvironment {
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  return {
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
    hasNotification: 'Notification' in window,
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone,
  }
}

const MAX_LABEL_LENGTH = 100

/** Browser and system for the editable device name, e.g. `Safari auf iPhone`. */
export function defaultDeviceLabel({
  userAgent,
  brands = [],
  platform,
}: {
  userAgent: string
  /** `navigator.userAgentData.brands` names. */
  brands?: string[]
  /** `navigator.userAgentData.platform`. */
  platform?: string
}): string {
  const system = systemName(platform) ?? systemFromUserAgent(userAgent)
  const browser = browserFromBrands(brands) ?? browserFromUserAgent(userAgent)
  const label = browser && system ? `${browser} auf ${system}` : (system ?? browser ?? '')
  return (label || 'Dieses Gerät').slice(0, MAX_LABEL_LENGTH)
}

function systemName(platform: string | undefined): string | null {
  if (!platform) return null
  if (platform === 'macOS') return 'Mac'
  return platform
}

function systemFromUserAgent(userAgent: string): string | null {
  if (/iPhone/.test(userAgent)) return 'iPhone'
  if (/iPad/.test(userAgent)) return 'iPad'
  if (/Android/.test(userAgent)) return 'Android'
  if (/Windows/.test(userAgent)) return 'Windows'
  if (/CrOS/.test(userAgent)) return 'ChromeOS'
  if (/Macintosh|Mac OS X/.test(userAgent)) return 'Mac'
  if (/Linux/.test(userAgent)) return 'Linux'
  return null
}

function browserFromBrands(brands: string[]): string | null {
  const known = brands.find((brand) =>
    /^(Microsoft Edge|Google Chrome|Opera|Brave|Vivaldi)$/.test(brand),
  )
  if (known) return known.replace('Microsoft ', '').replace('Google ', '')
  return null
}

function browserFromUserAgent(userAgent: string): string | null {
  if (/Edg\//.test(userAgent)) return 'Edge'
  if (/OPR\//.test(userAgent)) return 'Opera'
  if (/Firefox\/|FxiOS\//.test(userAgent)) return 'Firefox'
  if (/Chrome\/|CriOS\//.test(userAgent)) return 'Chrome'
  if (/Safari\//.test(userAgent)) return 'Safari'
  return null
}

type UserAgentData = { brands?: { brand: string }[]; platform?: string }

export function currentDeviceLabel(): string {
  const data = (navigator as Navigator & { userAgentData?: UserAgentData }).userAgentData
  return defaultDeviceLabel({
    userAgent: navigator.userAgent,
    brands: data?.brands?.map((entry) => entry.brand) ?? [],
    ...(data?.platform ? { platform: data.platform } : {}),
  })
}

/**
 * VAPID public keys are URL-safe base64 without padding; `pushManager.subscribe` wants bytes.
 */
export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded.replaceAll('-', '+').replaceAll('_', '/'))
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function sameKey(existing: ArrayBuffer | null | undefined, expected: Uint8Array): boolean {
  if (!existing || existing.byteLength !== expected.byteLength) return false
  const bytes = new Uint8Array(existing)
  return bytes.every((byte, index) => byte === expected[index])
}

/** The JSON form of a subscription, checked for what the server needs. */
export function toSubscriptionInput(
  json: PushSubscriptionJSON,
  label: string,
): { endpoint: string; keys: { p256dh: string; auth: string }; label: string } {
  const { endpoint, keys } = json
  if (!endpoint || !keys?.['p256dh'] || !keys['auth']) {
    throw new Error('The browser returned an incomplete push subscription')
  }
  return {
    endpoint,
    keys: { p256dh: keys['p256dh'], auth: keys['auth'] },
    label: label.trim().slice(0, MAX_LABEL_LENGTH),
  }
}

/** German message for whatever went wrong while enabling or testing. */
export function describePushError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 503) return 'Der Server hat Benachrichtigungen noch nicht eingerichtet.'
    if (error.status === 401) return 'Der Server lehnt den Familienschlüssel ab.'
    return `Der Server hat nicht geantwortet (HTTP ${error.status}).`
  }
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return 'Benachrichtigungen sind blockiert.'
    if (error.name === 'AbortError' || error.name === 'InvalidStateError') {
      return 'Der Push-Dienst deines Browsers ist nicht erreichbar. Prüfe die Verbindung und versuche es erneut.'
    }
  }
  if (error instanceof TypeError) return 'Keine Verbindung zum Server.'
  return 'Das hat nicht geklappt. Versuche es erneut.'
}

// --- Browser calls ----------------------------------------------------------------------------

export type EnableResult =
  | { ok: true }
  | { ok: false; reason: 'denied' | 'dismissed' | 'no-service-worker' }

async function activeRegistration(): Promise<ServiceWorkerRegistration | null> {
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) return null
  if (!registration.active) await navigator.serviceWorker.ready
  return registration
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null
  const registration = await navigator.serviceWorker.getRegistration()
  return registration ? registration.pushManager.getSubscription() : null
}

/**
 * Must be called from a click: the permission prompt needs a user gesture (and iOS insists on it).
 */
export async function enablePush(
  api: Pick<ApiClient, 'getVapidPublicKey' | 'subscribe'>,
  label: string,
): Promise<EnableResult> {
  const permission = await Notification.requestPermission()
  if (permission === 'denied') return { ok: false, reason: 'denied' }
  if (permission !== 'granted') return { ok: false, reason: 'dismissed' }

  const registration = await activeRegistration()
  if (!registration) return { ok: false, reason: 'no-service-worker' }

  const { key } = await api.getVapidPublicKey()
  const applicationServerKey = urlBase64ToUint8Array(key)

  let subscription = await registration.pushManager.getSubscription()
  // A subscription is bound to one VAPID key; after a key change it has to be replaced.
  if (subscription && !sameKey(subscription.options.applicationServerKey, applicationServerKey)) {
    await subscription.unsubscribe()
    subscription = null
  }
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  })

  await api.subscribe(toSubscriptionInput(subscription.toJSON(), label))
  return { ok: true }
}

/** Removes the subscription from this device and, if reachable, from the server. */
export async function disablePush(api: Pick<ApiClient, 'unsubscribe'>): Promise<void> {
  const subscription = await currentSubscription()
  if (!subscription) return
  const { endpoint } = subscription
  await subscription.unsubscribe()
  try {
    await api.unsubscribe(endpoint)
  } catch {
    // Offline: the server drops the endpoint itself when the push service answers 404/410.
  }
}
