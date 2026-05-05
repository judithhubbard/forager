/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

// PLAN §B12: build-time version stamp drives cache invalidation.
// SvelteKit gives us `version` via $service-worker (a hash of the build).

import { build, version } from '$service-worker';

declare const self: ServiceWorkerGlobalScope;

const CACHE_NAME = `forager-${version}`;

// In dev, the service worker just gets in the way of Vite HMR. Detect
// dev by checking if `build` is empty (production has the app shell file
// list; dev has none) and bail out hard — unregister and reload clients
// so the page is no longer SW-controlled.
const IS_DEV = build.length === 0;

self.addEventListener('install', (event) => {
  if (IS_DEV) {
    // In dev, refuse to install — clear caches and unregister so the page
    // is no longer SW-controlled and Vite HMR works normally.
    event.waitUntil(
      (async () => {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
        await self.registration.unregister();
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach((c) => (c as WindowClient).navigate((c as WindowClient).url));
      })()
    );
    return;
  }
  // Skip waiting so a new service worker takes over on the next page load.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  if (IS_DEV) return;
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
// cache-first-with-network-fallback strategy. For now we register no
// fetch handler so the browser does not warn about a no-op handler.

export {};
