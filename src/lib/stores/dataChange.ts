// Cross-page invalidation. Two flavors:
//
//   bumpDataChange()  — coarse: "something changed, refetch the
//                       whole region you're showing." Use for
//                       cross-page or unknown-pin invalidations.
//
//   bumpPinChanged(id) — fine: "this specific pin is dirty, just
//                        re-pull its row." Pages can patch the one
//                        pin in their local state instead of
//                        triggering a region-wide refetch through
//                        the slow v_pin_effective view.
//
// Pages that handle granular updates should subscribe to
// pinChanged; pages that don't can keep using dataChange and get
// the full hammer.

import { writable, type Readable } from 'svelte/store';

const _bumps = writable(0);
const _pinChanged = writable<{ pinId: string; v: number } | null>(null);
let _pinV = 0;

export const dataChange: Readable<number> = { subscribe: _bumps.subscribe };
export const pinChanged: Readable<{ pinId: string; v: number } | null> = {
  subscribe: _pinChanged.subscribe
};

export function bumpDataChange(): void {
  _bumps.update((n) => n + 1);
}

export function bumpPinChanged(pinId: string): void {
  _pinV += 1;
  _pinChanged.set({ pinId, v: _pinV });
}
