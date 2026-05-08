// Persists the last-viewed map center + zoom across navigation. Without
// this, leaving / and coming back resets the map to the default
// (Cornell campus at zoom 14) — the user has to re-pan + re-zoom every
// time they visit /interests, /watchlist, etc. and click back.
//
// Storage shape is the minimal one: { lat, lng, zoom }. Saved to
// localStorage on every viewport change; read once on first subscribe.
// Defaults to Cornell (matches the prior hardcoded fallback in
// Map.svelte) so the first-visit UX is unchanged.

import { writable, type Writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface MapViewport {
  lat: number;
  lng: number;
  zoom: number;
}

const KEY = 'forager.mapViewport.v1';
const DEFAULT: MapViewport = { lat: 42.4534, lng: -76.4836, zoom: 14 };

function load(): MapViewport | null {
  if (!browser) return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MapViewport>;
    if (
      typeof parsed.lat === 'number' &&
      typeof parsed.lng === 'number' &&
      typeof parsed.zoom === 'number' &&
      Number.isFinite(parsed.lat) &&
      Number.isFinite(parsed.lng) &&
      Number.isFinite(parsed.zoom)
    ) {
      return { lat: parsed.lat, lng: parsed.lng, zoom: parsed.zoom };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function makeStore(): Writable<MapViewport> {
  const initial = load() ?? DEFAULT;
  const s = writable<MapViewport>(initial);
  if (browser) {
    s.subscribe((v) => {
      try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignore */ }
    });
  }
  return s;
}

export const mapViewport = makeStore();

export function setMapViewport(v: MapViewport): void {
  mapViewport.set(v);
}
