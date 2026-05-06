// PLAN §10 C26: a single accessor for the active region.
// Components must NOT read `localStorage.activeRegionId` directly.
//
// Behavior:
// - On mount + on auth change, load the user's regions.
// - Active = persisted choice if it's still in the user's regions list,
//   else the first region, else null (which routes the user to /no-regions).

import { writable, derived, get, type Readable } from 'svelte/store';
import { browser } from '$app/environment';
import { session } from './auth';
import { listMyRegions, type RegionWithRole } from '$lib/services/regionService';

const STORAGE_KEY = 'forager.activeRegionId';

const _regions = writable<RegionWithRole[]>([]);
const _activeId = writable<string | null>(readInitialId());
const _loading = writable<boolean>(false);

function readInitialId(): string | null {
  if (!browser) return null;
  return localStorage.getItem(STORAGE_KEY);
}

if (browser) {
  _activeId.subscribe((id) => {
    if (id === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, id);
  });

  // Reload regions whenever auth changes.
  session.subscribe(async (s) => {
    if (!s) {
      _regions.set([]);
      _activeId.set(null);
      return;
    }
    _loading.set(true);
    try {
      const list = await listMyRegions();
      _regions.set(list);

      // Keep the persisted choice if still valid; else fall back to first.
      const current = get(_activeId);
      const validIds = new Set(list.map((r) => r.id));
      if (current && validIds.has(current)) {
        // keep
      } else if (list.length > 0) {
        _activeId.set(list[0].id);
      } else {
        _activeId.set(null);
      }
    } catch (err) {
      console.error('[activeRegion] failed to load regions:', err);
      _regions.set([]);
      _activeId.set(null);
    } finally {
      _loading.set(false);
    }
  });
}

export const myRegions: Readable<RegionWithRole[]> = { subscribe: _regions.subscribe };
export const activeRegionId: Readable<string | null> = { subscribe: _activeId.subscribe };
export const regionsLoading: Readable<boolean> = { subscribe: _loading.subscribe };

export const activeRegion: Readable<RegionWithRole | null> = derived(
  [_regions, _activeId],
  ([$regions, $id]) => $regions.find((r) => r.id === $id) ?? null
);

export function setActiveRegionId(id: string): void {
  _activeId.set(id);
}

/** Force a fresh region list reload (used after the user creates a
 *  region or accepts an invitation, so the new region appears in the
 *  switcher immediately and can be set as active). If `selectId` is
 *  given, that region becomes active provided it's actually in the
 *  reloaded list. */
export async function reloadRegions(selectId?: string): Promise<void> {
  if (!browser) return;
  _loading.set(true);
  try {
    const list = await listMyRegions();
    _regions.set(list);
    const validIds = new Set(list.map((r) => r.id));
    if (selectId && validIds.has(selectId)) {
      _activeId.set(selectId);
    } else {
      const current = get(_activeId);
      if (!current || !validIds.has(current)) {
        _activeId.set(list.length > 0 ? list[0].id : null);
      }
    }
  } catch (err) {
    console.error('[activeRegion] reload failed:', err);
  } finally {
    _loading.set(false);
  }
}
