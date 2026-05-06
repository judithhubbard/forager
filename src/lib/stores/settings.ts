// Persistent UI settings — basemap choice for now, plus room to grow.

import { writable, type Writable } from 'svelte/store';
import { browser } from '$app/environment';

export type Basemap = 'osm' | 'osm-hot' | 'topo' | 'satellite';

const KEY = 'forager.settings.v1';

interface Settings {
  basemap: Basemap;
}
const DEFAULT: Settings = { basemap: 'osm' };

function load(): Settings {
  if (!browser) return DEFAULT;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT, ...parsed };
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
