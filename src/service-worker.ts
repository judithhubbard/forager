/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

// Phase 1 offline support (data/offline-plan.md).
//
// Strategies:
// - App shell (built JS/CSS, /static images, manifest, icons):
//   precached at install time, served cache-first thereafter.
// - HTML navigations: network-first with the cached app shell as
//   fallback so the app loads when the network is gone.
// - OSM map tiles: stale-while-revalidate, capped at 8000 entries.
// - Static GeoJSON / data files (USDA zones, species seed): stale-
//   while-revalidate.
// - Everything else (Supabase REST/RPCs, Wikidata, Wikipedia): pass
//   through to the network — caching live data here would corrupt
//   freshness; Phase 2 handles offline data via IndexedDB instead.
//
// Build-time version stamp from $service-worker drives shell-cache
// invalidation; tile cache stays stable across deploys (tile IDs
// don't change as the app deploys).

import { build, files, version } from '$service-worker';

declare const self: ServiceWorkerGlobalScope;

const SHELL_CACHE = `forager-shell-${version}`;
const TILE_CACHE = 'forager-tiles-v1';
const STATIC_DATA_CACHE = `forager-static-data-${version}`;

const PRECACHE_PATHS = [...build, ...files];

const TILE_HOST_PATTERN = /(?:tile\.openstreetmap\.fr|tile\.openstreetmap\.org|arcgisonline\.com|tile\.opentopomap\.org)$/;
const STATIC_DATA_SUFFIXES = ['/usda-zones.geojson'];
const TILE_CACHE_MAX_ENTRIES = 8000;

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
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(PRECACHE_PATHS);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  if (IS_DEV) return;
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) =>
            k.startsWith('forager-') && k !== SHELL_CACHE &&
            k !== TILE_CACHE && k !== STATIC_DATA_CACHE
          )
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

/** LRU-trim a runtime cache to a max entry count. The default tile
 *  cache could otherwise grow unbounded as the user pans across the
 *  country. Cheap: caches.keys() is fast and we only trim on writes. */
async function trimCache(cacheName: string, maxEntries: number): Promise<void> {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  const overflow = keys.length - maxEntries;
  for (let i = 0; i < overflow; i++) await cache.delete(keys[i]);
}

async function staleWhileRevalidate(cacheName: string, request: Request): Promise<Response> {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((res) => {
      if (res && res.ok) {
        // Don't await the cache write or the trim — let them happen
        // in the background while the response goes back to the page.
        void cache
          .put(request, res.clone())
          .then(() => trimCache(cacheName, TILE_CACHE_MAX_ENTRIES));
      }
      return res;
    })
    .catch(() => cached); // network failure → whatever's cached (may be undefined)
  return cached ?? (await fetchPromise) ?? new Response('Offline', { status: 503 });
}

async function networkFirstShell(request: Request): Promise<Response> {
  try {
    return await fetch(request);
  } catch {
    // Offline: fall back to precached shell. Match by ignoring search
    // params so /forager/?utm_source=x still resolves to the cached root.
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    // Last resort: precached app entry.
    const fallback = await caches.match('/', { ignoreSearch: true });
    if (fallback) return fallback;
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

self.addEventListener('fetch', (event) => {
  if (IS_DEV) return;
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Map tiles — third-party CDN. Stale-while-revalidate; capped.
  if (TILE_HOST_PATTERN.test(url.host)) {
    event.respondWith(staleWhileRevalidate(TILE_CACHE, req));
    return;
  }

  if (url.origin === self.location.origin) {
    // Static data files served from /static (USDA zones, etc.).
    if (STATIC_DATA_SUFFIXES.some((p) => url.pathname.endsWith(p))) {
      event.respondWith(staleWhileRevalidate(STATIC_DATA_CACHE, req));
      return;
    }
    // Precached app shell — try cache first.
    if (PRECACHE_PATHS.some((p) => url.pathname.endsWith(p))) {
      event.respondWith(
        caches.match(req).then((cached) => cached ?? fetch(req))
      );
      return;
    }
    // HTML navigations: network-first, shell fallback when offline.
    if (
      req.mode === 'navigate' ||
      (req.headers.get('accept') ?? '').includes('text/html')
    ) {
      event.respondWith(networkFirstShell(req));
      return;
    }
  }

  // Everything else (Supabase REST/RPC, Wikidata, etc.): pass through.
});

export {};
