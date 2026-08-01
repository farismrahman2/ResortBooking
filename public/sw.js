/*
 * Service worker for the field-visit module.
 *
 * Scope is deliberately narrow. This is an internal PMS where every other
 * page is live operational data — caching bookings or checkout would risk a
 * rep acting on a stale room list. Only the field-visit capture flow, which
 * is write-only and explicitly designed to work offline, is cached.
 *
 * Strategy:
 *   - navigations  → network-first, falling back to the cached offline shell
 *   - static build assets (/_next/static) → cache-first, they're immutable
 *   - everything else → straight to network, untouched
 */

const CACHE = 'gcr-fv-v1'
const SHELL = '/crm/field-visits/offline'

const PRECACHE = [SHELL, '/manifest.json']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(PRECACHE).catch(() => undefined))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Immutable build output — safe to serve from cache indefinitely.
  if (url.pathname.startsWith('/_next/static')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => undefined)
        return res
      })),
    )
    return
  }

  // Only the field-visit routes get an offline fallback.
  if (req.mode === 'navigate' && url.pathname.startsWith('/crm/field-visits')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => undefined)
          return res
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match(SHELL))),
    )
  }
})
