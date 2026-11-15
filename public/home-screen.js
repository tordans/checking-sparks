/*
 * Sets the manifest link of the app. A classic script in index.html, before the app starts.
 *
 * Why: on iPhone and iPad, a web app added with "Zum Home-Bildschirm" gets its own storage, empty
 * and separate from Safari's. Its localStorage never has the family key, so it can never pair.
 * It starts at the manifest's start_url, and Safari reads the manifest once, at page load. So,
 * in iOS Safari with a known family key, this script points the link at a data: manifest whose
 * start_url carries the key (`/verbinden#key=…`). The home-screen app then pairs itself on its
 * first start. Other browsers share their storage with the app and keep the plain manifest, so
 * the key never ends up in a file. Name, colours and icons must match /manifest.webmanifest;
 * they are repeated here because a data: manifest has no base URL and must be built synchronously.
 *
 * Plain ES5 on purpose: no build step, and it runs before the app bundle loads.
 */
;(function () {
  var origin = location.origin
  var link = document.createElement('link')
  link.rel = 'manifest'
  link.href = '/manifest.webmanifest'

  try {
    var iosSafari = 'standalone' in navigator && !navigator.standalone
    var key = keyFromPage() || keyFromStorage()
    if (iosSafari && key) {
      var json = JSON.stringify(manifestWithKey(origin, key))
      link.href = 'data:application/manifest+json,' + encodeURIComponent(json)
    }
  } catch (_error) {
    // Keep the plain manifest: the home-screen app then starts without pairing, as before.
  }

  document.head.appendChild(link)

  /** The key from the pairing link the user is looking at right now. */
  function keyFromPage() {
    if (location.pathname !== '/verbinden') return null
    var match = /(?:^#|&)key=([^&]+)/.exec(location.hash)
    return match ? decodeURIComponent(match[1]) : null
  }

  /** The key this browser already has (set by /verbinden, see src/sync/store.ts). */
  function keyFromStorage() {
    var server = JSON.parse(localStorage.getItem('checking-sparks:server:v1') || 'null')
    return server && typeof server.familyKey === 'string' && server.familyKey
      ? server.familyKey
      : null
  }

  /** Same fields as public/manifest.webmanifest, absolute URLs, start_url with the key. */
  function manifestWithKey(base, familyKey) {
    return {
      name: 'Checking Sparks',
      short_name: 'Checking Sparks',
      description: 'Vorsorgetermine der Familie im Blick: rechtzeitig buchen, erledigt abhaken.',
      lang: 'de',
      dir: 'ltr',
      id: base + '/',
      start_url: base + '/verbinden#key=' + encodeURIComponent(familyKey),
      scope: base + '/',
      display: 'standalone',
      orientation: 'any',
      theme_color: '#ffffff',
      background_color: '#f4f4f5',
      icons: [
        icon(base, '/pwa-icons/icon-192.png', '192x192', 'any'),
        icon(base, '/pwa-icons/icon-512.png', '512x512', 'any'),
        icon(base, '/pwa-icons/icon-maskable-192.png', '192x192', 'maskable'),
        icon(base, '/pwa-icons/icon-maskable-512.png', '512x512', 'maskable'),
      ],
    }
  }

  function icon(base, path, sizes, purpose) {
    return { src: base + path, sizes: sizes, type: 'image/png', purpose: purpose }
  }
})()
