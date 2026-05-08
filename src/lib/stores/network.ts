// Online/offline state. Subscribe to the navigator events so the UI
// can show a banner and disable write affordances when the network
// is unavailable. Initial value mirrors navigator.onLine on first
// subscribe; falls back to `true` during SSR.

import { readable, type Readable } from 'svelte/store';
import { browser } from '$app/environment';

export const online: Readable<boolean> = readable(true, (set) => {
  if (!browser) return;
  set(navigator.onLine);
  const onOnline = () => set(true);
  const onOffline = () => set(false);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
});
