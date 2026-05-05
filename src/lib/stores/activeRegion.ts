import { writable, type Readable } from 'svelte/store';
import { browser } from '$app/environment';

// PLAN §10 C26: a single accessor for the active region. Components
// must NOT read `localStorage.activeRegionId` directly. Use these
// exports instead.

const STORAGE_KEY = 'forager.activeRegionId';

function readInitial(): string | null {
  if (!browser) return null;
  return localStorage.getItem(STORAGE_KEY);
}

const store = writable<string | null>(readInitial());

if (browser) {
  store.subscribe((id) => {
    if (id === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, id);
  });
}

export const activeRegionId: Readable<string | null> = { subscribe: store.subscribe };

export function setActiveRegionId(id: string | null): void {
  store.set(id);
}
