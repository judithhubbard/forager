// Auth store: reflects the current Supabase session.
// Components subscribe to this rather than calling authService directly for state.

import { writable, type Readable } from 'svelte/store';
import type { Session } from '@supabase/supabase-js';
import { browser } from '$app/environment';
import { getSession, onAuthChange } from '$lib/services/authService';

const _session = writable<Session | null>(null);
const _loading = writable<boolean>(true);

if (browser) {
  // Initial fetch of any persisted session.
  getSession()
    .then((s) => {
      _session.set(s);
    })
    .finally(() => _loading.set(false));

  // Keep store in sync with subsequent auth events.
  onAuthChange((s) => _session.set(s));
}

export const session: Readable<Session | null> = { subscribe: _session.subscribe };
export const authLoading: Readable<boolean> = { subscribe: _loading.subscribe };

/** True after the initial session fetch completes. Use to avoid flashing UI. */
export function ready(callback: () => void): void {
  // Once authLoading flips to false, run callback.
  const unsub = _loading.subscribe((isLoading) => {
    if (!isLoading) {
      callback();
      // Defer to avoid calling unsub before subscription is fully set up.
      setTimeout(() => unsub(), 0);
    }
  });
}
