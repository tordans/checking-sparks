/**
 * Registers `public/sw.js` (app-shell cache + web push, see docs/architecture.md "PWA and push").
 * Only in production builds, so the Vite dev server is not disturbed by a caching worker; set
 * `VITE_ENABLE_SW=true` to try it with `bun run dev` anyway.
 */

/* oxlint-disable compat/compat -- every use sits behind 'serviceWorker' in navigator */

const SW_URL = '/sw.js'

function serviceWorkerEnabled(): boolean {
  return import.meta.env.PROD || import.meta.env['VITE_ENABLE_SW'] === 'true'
}

/** What the worker sends when a notification is tapped while the app is open. */
export function parseNavigateMessage(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null
  const { type, path } = data as { type?: unknown; path?: unknown }
  if (type !== 'navigate' || typeof path !== 'string') return null
  return path.startsWith('/') && !path.startsWith('//') ? path : null
}

export function registerServiceWorker(navigate: (path: string) => void): void {
  if (!serviceWorkerEnabled() || !('serviceWorker' in navigator)) return

  // Tapping a notification focuses this window and asks it to open the page. A full reload would
  // lose the passphrase that is only held in memory.
  navigator.serviceWorker.addEventListener('message', (event) => {
    const path = parseNavigateMessage(event.data)
    if (path) navigate(path)
  })

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(SW_URL, { scope: '/', updateViaCache: 'none' })
      .then((registration) => {
        // A new version takes over at once (no reload prompt: the shell is network-first anyway).
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              worker.postMessage({ type: 'SKIP_WAITING' })
            }
          })
        })
      })
      .catch((error: unknown) => {
        console.error('Service worker registration failed', error)
      })
  })
}
