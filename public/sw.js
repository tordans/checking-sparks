// Service worker of Checking Sparks. Written by hand, no build step (see docs/architecture.md,
// "PWA and push"). Three jobs: app shell offline, show push notifications, open the right page
// when one is tapped. /api/ is never cached: the app handles offline itself (local copy + sync).

// Bump to drop all old caches on the next activation. Hashed /assets/ files never need a bump:
// their names change with their content.
const CACHE_VERSION = 'v1'
const SHELL_CACHE = `shell-${CACHE_VERSION}`
const ASSET_CACHE = `assets-${CACHE_VERSION}`
const MAX_ASSET_ENTRIES = 80

const ICON = '/icons/icon-192.png'
const BADGE = '/icons/badge-96.png'
const DEFAULT_PATH = '/'

self.addEventListener('install', (event) => {
  event.waitUntil(precache())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE])
      for (const name of await caches.keys()) {
        if (!keep.has(name)) await caches.delete(name)
      }
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') void self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(shellNetworkFirst(request))
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(assetCacheFirst(request))
  }
})

/** Puts index.html and the hashed files it references into the cache, so the app opens offline. */
async function precache() {
  const shell = await caches.open(SHELL_CACHE)
  const response = await fetch('/index.html', { cache: 'no-cache' })
  if (!response.ok) return
  const html = await response.clone().text()
  await shell.put('/index.html', response)
  const assets = await caches.open(ASSET_CACHE)
  const urls = [...new Set(html.match(/\/assets\/[^"'\s)]+/g) ?? [])]
  await Promise.all(
    urls.map(async (assetUrl) => {
      try {
        await assets.add(assetUrl)
      } catch {
        // Not fatal: it is cached on first use.
      }
    }),
  )
}

/** Every navigation gets the SPA shell. Network first, so a deploy shows up on the next load. */
async function shellNetworkFirst(request) {
  const shell = await caches.open(SHELL_CACHE)
  try {
    const response = await fetch(request)
    if (response.ok && (response.headers.get('content-type') ?? '').includes('text/html')) {
      void shell.put('/index.html', response.clone())
    }
    return response
  } catch (error) {
    const cached = await shell.match('/index.html')
    if (cached) return cached
    throw error
  }
}

async function assetCacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) {
    await cache.put(request, response.clone())
    void trimCache(cache)
  }
  return response
}

/** Keeps the cache of old hashed files from growing forever: drops the oldest entries. */
async function trimCache(cache) {
  const keys = await cache.keys()
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ASSET_ENTRIES))) {
    await cache.delete(key)
  }
}

/** Only same-origin paths; anything else (from a bad payload) opens the start page. */
function safePath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return DEFAULT_PATH
  }
  return value
}

self.addEventListener('push', (event) => {
  let payload = {}
  if (event.data) {
    try {
      payload = event.data.json()
    } catch {
      payload = { body: event.data.text() }
    }
  }
  if (payload === null || typeof payload !== 'object') payload = {}

  const title =
    typeof payload.title === 'string' && payload.title ? payload.title : 'Checking Sparks'
  const options = {
    body: typeof payload.body === 'string' ? payload.body : '',
    icon: ICON,
    badge: BADGE,
    data: { path: safePath(payload.path) },
  }
  // A reminder id, if the server sends one, replaces an older notification of the same reminder.
  const tag = typeof payload.id === 'string' && payload.id ? payload.id : payload.tag
  if (typeof tag === 'string' && tag) options.tag = tag

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const path = safePath(event.notification.data && event.notification.data.path)

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const existing = windows.find((client) => new URL(client.url).origin === self.location.origin)
      if (existing) {
        // The app navigates itself (src/push/service-worker.ts): a reload would lock the passphrase again.
        existing.postMessage({ type: 'navigate', path })
        await existing.focus()
        return
      }
      await self.clients.openWindow(path)
    })(),
  )
})
