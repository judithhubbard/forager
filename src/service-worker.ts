/// <reference lib="webworker" />

// PLAN §B12: build-time version stamp drives cache invalidation.
// On activate we purge any cache whose name doesn't match the current build.

declare const __BUILD_VERSION__: string;
declare const self: ServiceWorkerGlobalScope;

const CACHE_NAME = `forager-${__BUILD_VERSION__}`;

self.addEventListener('install', (event) => {
  // Skip waiting so a new service worker takes over on the next page load.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// Phase 3 will add fetch-handling for app-shell and tile caching with a
// cache-first-with-network-fallback strategy. For now we install only the
// version-stamp + purge-old-caches behavior so Phase 1 deploys don't leave
// stale caches behind.

self.addEventListener('fetch', () => {
  // Pass through to network. Real strategy in Phase 3.
});

export {};
