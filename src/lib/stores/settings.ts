// Persistent UI settings — basemap choice for now, plus room to grow.

import { writable, type Writable } from 'svelte/store';
import { browser } from '$app/environment';

export type Basemap = 'osm-hot' | 'satellite';

const KEY = 'forager.settings.v1';

interface Settings {
  basemap: Basemap;
}
const DEFAULT: Settings = { basemap: 'osm-hot' };

/** Migrate older saved values that referred to options we no longer
 *  ship (Standard OSM, OpenTopoMap) so the user doesn't get stuck on
 *  a missing basemap. */
function normalize(s: Partial<Settings>): Settings {
  const allowed: Basemap[] = ['osm-hot', 'satellite'];
  const b = s.basemap && allowed.includes(s.basemap) ? s.basemap : DEFAULT.basemap;
  return { basemap: b };
}

function load(): Settings {
  if (!browser) return DEFAULT;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return normalize(parsed);
  } catch {
    return DEFAULT;
  }
}

function makeStore(): Writable<Settings> {
  const s = writable<Settings>(load());
  if (browser) {
    s.subscribe((v) => {
      try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignore */ }
    });
  }
  return s;
}

export const settings = makeStore();

export function setBasemap(b: Basemap): void {
  settings.update((s) => ({ ...s, basemap: b }));
}
