// Persistent UI settings — basemap choice for now, plus room to grow.

import { writable, type Writable } from 'svelte/store';
import { browser } from '$app/environment';

export type Basemap =
  | 'osm-hot'
  | 'satellite'
  | 'topo'
  | 'cyclosm'
  | 'voyager'
  | 'sentinel';

const KEY = 'forager.settings.v1';

interface Settings {
  basemap: Basemap;
  /** ISO timestamp the user clicked "I understand" on the foraging
   *  disclaimer. Null = never shown / never dismissed → modal will
   *  appear on next map load. */
  disclaimerAcceptedAt: string | null;
}
const DEFAULT: Settings = { basemap: 'osm-hot', disclaimerAcceptedAt: null };

/** Migrate older saved values to the current option set. */
function normalize(s: Partial<Settings>): Settings {
  const allowed: Basemap[] = [
    'osm-hot', 'satellite', 'topo', 'cyclosm', 'voyager', 'sentinel'
  ];
  const b = s.basemap && allowed.includes(s.basemap) ? s.basemap : DEFAULT.basemap;
  return { basemap: b, disclaimerAcceptedAt: s.disclaimerAcceptedAt ?? null };
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
