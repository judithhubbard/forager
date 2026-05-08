// In-memory session state for the species filter panel on the map.
// Distinct from user_species_preferences (the persistent /interests
// deny-list): the panel's Clear / Select-all / individual-checkbox
// flips are ephemeral viewport filters that don't change the user's
// long-term active species set.
//
// SEMANTICS — DENY-LIST.
//
//   null = "no panel filter" — show every species the user has not
//          disabled in /interests.
//   Set<string> = species ids to HIDE from the map. New species
//          encountered when panning to a different region or city
//          default to visible (not in the set).
//   Set<string> with the special "all-off" sentinel = "show none"
//          (Clear was clicked). The Map filter logic treats this as
//          a hide-everything signal.
//
// Why deny-list and not allow-list:
//   The previous allow-list semantics ("show only these species")
//   captured a snapshot of eligible species at toggle time. When the
//   user panned to a different city (e.g. Toronto) whose species
//   weren't in the snapshot, those pins disappeared from the map
//   even though the user hadn't intentionally hidden them. Deny-list
//   matches the natural mental model: "I unchecked apple → hide
//   apples everywhere I go," and unfamiliar species default to
//   visible.
//
// Storage: in-memory only. Resets on page reload by design — the
// persistent decision lives on /interests.

import { writable, type Writable } from 'svelte/store';

/** Sentinel used in the deny set when the user clicks "Clear" — it
 *  means "show nothing" without enumerating every eligible species
 *  (which would be brittle as the catalog grows). The map filter
 *  logic checks for this sentinel before consulting individual ids. */
export const HIDE_ALL = '__hide_all__';

export const panelSelection: Writable<Set<string> | null> = writable(null);

/** Hide every species — Clear button. */
export function clearAll(): void {
  panelSelection.set(new Set([HIDE_ALL]));
}

/** Show every species — Select-all button. */
export function selectAll(): void {
  panelSelection.set(null);
}

/** Toggle one species' hidden state. Adds the id to the deny set if
 *  not present, removes it otherwise.
 *
 *  When the previous state was the HIDE_ALL sentinel ("Clear" was
 *  active), tapping a single species transitions to "show only
 *  this one" by recording the rest of `eligibleIds` as hidden. The
 *  caller passes the set of currently-eligible species so this
 *  helper doesn't need to import the species catalog.
 *
 *  When the deny set ends up empty, normalize to null (no filter)
 *  so callers don't have to special-case empty sets. */
export function toggle(id: string, eligibleIds: readonly string[]): void {
  panelSelection.update((current) => {
    if (current === null) {
      return new Set([id]);
    }
    if (current.has(HIDE_ALL)) {
      // Was "show none". Tapping a species means "show only this one"
      // — equivalent to a deny set of all OTHER eligible species.
      const next = new Set<string>(eligibleIds);
      next.delete(id);
      return next.size === 0 ? null : next;
    }
    const next = new Set(current);
    if (next.has(id)) {
      next.delete(id);
      return next.size === 0 ? null : next;
    }
    next.add(id);
    return next;
  });
}

/** Helper: returns true iff the species would be VISIBLE under the
 *  current panel selection. Pure function so callers (filteredPins,
 *  checkbox state) share one rule. */
export function isVisible(
  current: Set<string> | null,
  speciesId: string | null | undefined
): boolean {
  if (current === null) return true;
  if (current.has(HIDE_ALL)) return false;
  if (!speciesId) return true; // un-IDed pins (display_name only) bypass
  return !current.has(speciesId);
}

/** Build a deny-set that hides every other id in `eligibleIds`,
 *  effectively "show only this one species." Useful from /ripe's
 *  Show-on-map button and from URLs that pass ?species=<id>.
 *
 *  Species not in eligibleIds (e.g., Toronto species when the user
 *  is in Ithaca) are NOT in the resulting deny-set, so panning to
 *  Toronto still shows pins there — the deny-list semantic prevents
 *  the prior allow-list bug where a remote viewport showed nothing. */
export function setShowOnly(id: string, eligibleIds: readonly string[]): void {
  const next = new Set<string>(eligibleIds);
  next.delete(id);
  panelSelection.set(next.size === 0 ? null : next);
}
