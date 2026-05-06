// Lightweight cross-page invalidation: bump a counter every time we
// write through a service, and pages that depend on that data
// re-fetch reactively. Avoids the "I just added an observation but
// the windows timeline still shows the old set" class of bug, where
// the consumer page only refetches on mount or activeRegion change.
//
// Use sparingly — this is a global "something changed, please
// re-validate" hammer, not a fine-grained channel. Pages should
// already be refetching on their own primary triggers; this just
// closes the gap when a write happens elsewhere in the app.

import { writable, type Readable } from 'svelte/store';

const _bumps = writable(0);

export const dataChange: Readable<number> = { subscribe: _bumps.subscribe };

export function bumpDataChange(): void {
  _bumps.update((n) => n + 1);
}
