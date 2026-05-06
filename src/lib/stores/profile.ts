// Profile store: caches the current user's profile so pages don't have
// to refetch on every mount. Loaded once when `session` becomes
// non-null, cleared on sign-out.

import { writable, type Readable } from 'svelte/store';
import { browser } from '$app/environment';
import { session } from './auth';
import { getMine, type Profile } from '$lib/services/profileService';

const _profile = writable<Profile | null>(null);
const _loading = writable<boolean>(true);

let lastUserId: string | null = null;

async function refresh(): Promise<void> {
  _loading.set(true);
  try {
    _profile.set(await getMine());
  } catch (err) {
    console.error('[profile store] refresh failed:', err);
    _profile.set(null);
  } finally {
    _loading.set(false);
  }
}

if (browser) {
  // React to auth changes: load profile when user signs in, clear on
  // sign out. Skip if it's the same user (handles token-refresh events).
  session.subscribe((s) => {
    const userId = s?.user?.id ?? null;
    if (userId === lastUserId) return;
    lastUserId = userId;
    if (userId) {
      void refresh();
    } else {
      _profile.set(null);
      _loading.set(false);
    }
  });
}

export const profile: Readable<Profile | null> = { subscribe: _profile.subscribe };
export const profileLoading: Readable<boolean> = { subscribe: _loading.subscribe };

/** Manually trigger a refresh — used after the user updates their
 *  username so the store reflects the change immediately. */
export async function reloadProfile(): Promise<void> {
  await refresh();
}
