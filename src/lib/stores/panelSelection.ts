// In-memory session state for the species filter panel on the map.
// Distinct from user_species_preferences (the persistent /interests
// deny-list): the panel's Clear / Select-all / individual-checkbox
// flips are ephemeral viewport filters that don't change the user's
// long-term active species set.
//
// null = "no panel filter" — show every species the user has not
// disabled in /interests.
// Set<string> = "show only these species" (which can be empty,
// meaning Clear was hit and the user wants no pins visible).
//
// Storage: in-memory only. Resets on page reload by design — the
// persistent decision lives on /interests.

import { writable, type Writable } from 'svelte/store';

export const panelSelection: Writable<Set<string> | null> = writable(null);

export function clearAll(): void {
  panelSelection.set(new Set());
}

export function selectAll(): void {
  panelSelection.set(null);
}

/** Toggle a single species in the panel selection.
 *  - When currently null (no filter), this snapshots the provided
 *    eligibleIds (everything the user can see), then removes the
 *    one being toggled — turning into "everything except this." */
export function toggle(id: string, eligibleIds: readonly string[]): void {
  panelSelection.update((current) => {
    if (current === null) {
      const next = new Set(eligibleIds);
      next.delete(id);
      return next;
    }
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}
