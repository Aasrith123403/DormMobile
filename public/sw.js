/**
 * RoomLedger service worker.
 *
 * Deliberately small and cautious. This exists for two reasons only:
 *   1. Chrome will not offer "Install app" without a service worker that
 *      handles fetch, and that install prompt is how Android users get the
 *      web app onto their home screen.
 *   2. Opening the app on a bad connection should show the app, not the
 *      browser's dinosaur.
 *
 * It is NOT an offline mode. Every piece of real data comes from Supabase over
 * the network, and stale balances are worse than no balances — so API traffic
 * is never touched here. Only the shell and the build's own static files are
 * cached.
 *
 * Bump CACHE_VERSION on any change to this file; the old caches are deleted on
 * activate, so a stale shell can never outlive a deploy.
 */

const CACHE_VERSION = 'roomledger-v1';
const SHELL_URL = '/';

/** Content-hashed build output and icons — safe to serve from cache forever. */
function isImmutableAsset(url) {
  return (
    url.pathname.startsWith('/_expo/') ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.ttf')
  );
}

self.addEventListener('install', (event) => {
  // Take over as soon as the new worker is ready rather than waiting for
  // every tab to close — a half-updated app is the thing to avoid.
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll([SHELL_URL, '/manifest.json']))
      .catch(() => {
        /* A failed precache must not block installation. */
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only ever GETs from this origin. Supabase auth, REST and realtime traffic
  // is cross-origin and falls straight through untouched.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network first, so a deploy is picked up immediately, with the
  // cached shell as the offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(SHELL_URL, copy));
          return response;
        })
        .catch(() => caches.match(SHELL_URL).then((cached) => cached ?? Response.error()))
    );
    return;
  }

  if (!isImmutableAsset(url)) return;

  // Static build output: cache first. These filenames carry a content hash, so
  // a cache hit is by definition the right bytes.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
    )
  );
});
