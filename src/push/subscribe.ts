import type { ApiClient, PushSubscriptionInput } from '@/sync/api-client'
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

/** The JSON form of a subscription, checked for what the server needs. */
export function toSubscriptionInput(json: PushSubscriptionJSON): PushSubscriptionInput {
  const { endpoint, keys } = json
  if (!endpoint || !keys?.['p256dh'] || !keys['auth']) {
    throw new Error('The browser returned an incomplete push subscription')
  }
  return {
    endpoint,
    keys: { p256dh: keys['p256dh'], auth: keys['auth'] },
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
 * Returns false when the user did not grant permission or there is no service worker.
 */
export async function enablePush(
  api: Pick<ApiClient, 'getVapidPublicKey' | 'subscribe'>,
): Promise<boolean> {
  if ((await Notification.requestPermission()) !== 'granted') return false

  const registration = await activeRegistration()
  if (!registration) return false

  const { key } = await api.getVapidPublicKey()
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    }))

  await api.subscribe(toSubscriptionInput(subscription.toJSON()))
  return true
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
