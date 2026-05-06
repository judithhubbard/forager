// Per-user list of which uploaded tracks are currently rendered as
// polylines on the map. The list of track IDs persists in
// localStorage; the actual point arrays are loaded lazily by the
// map and held only in memory.
//
// Separate from the foraging-heatmap toggle: that one shows ALL
// the user's track points as a density layer; this one shows
// chosen tracks as crisp colored lines you can follow. Both can
// be on at the same time.

import { writable, derived, type Readable } from 'svelte/store';
import { browser } from '$app/environment';

const KEY = 'forager.displayedTracks.v1';

function loadInitial(): Set<string> {
  if (!browser) return new Set();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed.filter((x) => typeof x === 'string'));
  } catch {
    // fallthrough
  }
  return new Set();
}

const _ids = writable<Set<string>>(loadInitial());

if (browser) {
  _ids.subscribe((s) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(Array.from(s)));
    } catch {
      // quota or private mode — best effort
    }
  });
}

export const displayedTrackIds: Readable<Set<string>> = { subscribe: _ids.subscribe };

export function showTrack(id: string): void {
  _ids.update((s) => {
    if (s.has(id)) return s;
    const next = new Set(s);
    next.add(id);
    return next;
  });
}

export function hideTrack(id: string): void {
  _ids.update((s) => {
    if (!s.has(id)) return s;
    const next = new Set(s);
    next.delete(id);
    return next;
  });
}

export function clearAll(): void {
  _ids.set(new Set());
}

/** Convenience derived: a stable Array view for templates that
 *  want to iterate (Sets aren't directly each-able in Svelte 4
 *  templates without a conversion). */
export const displayedTrackIdsArray = derived(_ids, (s) => Array.from(s));
