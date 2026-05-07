// User-species preferences store. Phase 1B (PLAN.md).
//
// Mental model: this store is a Map<species_id, enabled-bool>. Three
// derived states matter to consumers:
//
//   - allEnabled:    true iff the map is empty. UI should treat the
//                    species filter as "show all" and display every
//                    species without a per-species checkmark.
//   - enabledIds:    Set<species_id> of currently-enabled species, OR
//                    null when allEnabled. Components that filter pins
//                    by species use null=null-filter, set=filter-by-set.
//   - disabledIds:   inverse — useful for the welcome flow where we
//                    let the user opt OUT of a small set of species.
//
// Mutations are optimistic + debounced:
//   - toggle / setEnabled / disableMany / enableAll mutate the store
//     immediately so the UI reflects the change without a roundtrip.
//   - Each mutation is buffered into `pendingFlush` and a 500ms timer
//     starts. Subsequent mutations within that window reset the timer
//     and merge into the buffer. When it fires, one upsertMany call
//     covers everything.
//   - On flush error: revert the affected rows to the last
//     server-confirmed state and surface an `error` field that the UI
//     can show inline.

import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import {
  listMine,
  upsertMany,
  removeAllMine,
  type SpeciesPref
} from '$lib/services/userPreferencesService';
import { session } from './auth';

interface State {
  /** Per-species enabled flag. Absence of a key means "default" (= enabled). */
  prefs: Map<string, boolean>;
  loaded: boolean;
  error: string | null;
}

function emptyState(): State {
  return { prefs: new Map(), loaded: false, error: null };
}

const _store = writable<State>(emptyState());

/** Snapshot of pending changes, keyed by species_id, since last flush.
 *  When the timer fires, every entry here gets pushed to the server. */
let pendingFlush: Map<string, boolean> = new Map();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_DELAY_MS = 500;

/** Last server-confirmed state. Used to roll back optimistic changes
 *  if a flush fails. */
let lastConfirmed: Map<string, boolean> = new Map();

function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, FLUSH_DELAY_MS);
}

async function flush() {
  flushTimer = null;
  if (pendingFlush.size === 0) return;
  const batch: SpeciesPref[] = Array.from(pendingFlush.entries()).map(
    ([speciesId, enabled]) => ({ speciesId, enabled })
  );
  // Reset the buffer NOW; if more mutations land during the await,
  // they queue into a fresh buffer and trigger another flush.
  pendingFlush = new Map();
  // Anon users don't have user_species_preferences rows to write
  // to. Treat the flush as a successful no-op so the local state
  // sticks for the session (the species filter still works in the
  // UI), but no upsertMany is attempted that would throw 'Not
  // signed in' and trigger the rollback that wipes the local state
  // back to all-enabled — exactly the bug that made Clear briefly
  // hide pins and then re-show them.
  if (lastUserId === null) {
    for (const p of batch) lastConfirmed.set(p.speciesId, p.enabled);
    return;
  }
  try {
    await upsertMany(batch);
    // On success, fold this batch into lastConfirmed so future rollbacks
    // know the new baseline.
    for (const p of batch) lastConfirmed.set(p.speciesId, p.enabled);
  } catch (err) {
    // Rollback: revert the affected species back to lastConfirmed (or
    // delete the key if it had no prior confirmed state, putting it
    // back to "default-enabled").
    _store.update((s) => {
      const next = new Map(s.prefs);
      for (const p of batch) {
        const prev = lastConfirmed.get(p.speciesId);
        if (prev === undefined) next.delete(p.speciesId);
        else next.set(p.speciesId, prev);
      }
      const msg = err instanceof Error ? err.message : 'Could not save preferences.';
      return { ...s, prefs: next, error: msg };
    });
    return;
  }
  _store.update((s) => ({ ...s, error: null }));
}

/** Load preferences from the server. Idempotent — safe to call any
 *  time the user changes (e.g. on session change). Resets state on
 *  sign-out. */
export async function loadFromServer(): Promise<void> {
  try {
    const rows = await listMine();
    const map = new Map<string, boolean>();
    for (const r of rows) map.set(r.speciesId, r.enabled);
    lastConfirmed = new Map(map);
    _store.set({ prefs: map, loaded: true, error: null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not load preferences.';
    _store.set({ prefs: new Map(), loaded: true, error: msg });
  }
}

function clearLocal(): void {
  pendingFlush = new Map();
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  lastConfirmed = new Map();
  _store.set(emptyState());
}

/** Mirrors the signed-in user id as the auth store updates.
 *  Module-scoped (rather than block-scoped inside the browser
 *  guard) so flush() can check whether a server upsert is even
 *  possible — anon users have no row to write to. */
let lastUserId: string | null = null;

if (browser) {
  // Reload preferences whenever the signed-in user changes; clear
  // them on sign-out so a fresh sign-in doesn't leak the previous
  // user's settings.
  session.subscribe((s) => {
    const uid = s?.user?.id ?? null;
    if (uid === lastUserId) return;
    lastUserId = uid;
    if (uid) void loadFromServer();
    else clearLocal();
  });
}

/** Public read store. */
export const userPreferences = {
  subscribe: _store.subscribe
};

/** True iff the user has zero preference rows — meaning every species
 *  is enabled by default. Maps to the "no filter" UI state. */
export const allEnabled = derived(_store, (s) => s.prefs.size === 0);

/** Set of currently-enabled species_ids. When allEnabled is true,
 *  this is null (no filter); otherwise it is the explicit set so
 *  consumers don't have to invert disabled. The set is rebuilt only
 *  when prefs changes, so it's safe to use directly in reactive
 *  blocks. */
export const enabledIds = derived(_store, (s): Set<string> | null => {
  if (s.prefs.size === 0) return null;
  const out = new Set<string>();
  for (const [id, enabled] of s.prefs) {
    if (enabled) out.add(id);
  }
  return out;
});

/** Toggle a single species. If the user is currently in the
 *  default-all-enabled state, this materializes a row so the OFF
 *  state can be persisted. */
export function toggle(speciesId: string, allSpeciesIds: readonly string[]): void {
  setEnabled(speciesId, !isEnabled(speciesId), allSpeciesIds);
}

export function isEnabled(speciesId: string): boolean {
  const s = get(_store);
  if (s.prefs.size === 0) return true;
  return s.prefs.get(speciesId) === true;
}

/** Mutate one species' enabled state. allSpeciesIds is needed to
 *  materialize the "show all by default" state into explicit rows
 *  the first time a species is turned off — without it, turning the
 *  first species off would still leave every other species in the
 *  default-enabled state (but server zero rows would still mean
 *  "all enabled"). After materialization, a single OFF row would
 *  contradict the "zero rows = all enabled" rule. */
export function setEnabled(
  speciesId: string,
  enabled: boolean,
  allSpeciesIds: readonly string[]
): void {
  _store.update((s) => {
    const next = new Map(s.prefs);
    // First-disable materialization: we're moving from "implicit
    // all-enabled" (size 0) to a partial set, so write enabled=true
    // for every other species and enabled=false for this one.
    if (s.prefs.size === 0 && !enabled) {
      for (const id of allSpeciesIds) {
        next.set(id, id !== speciesId);
        pendingFlush.set(id, id !== speciesId);
      }
    } else {
      next.set(speciesId, enabled);
      pendingFlush.set(speciesId, enabled);
    }
    return { ...s, prefs: next, error: null };
  });
  scheduleFlush();
}

/** Convenience helper for the welcome flow: disable everything not
 *  in the keep set. Materializes rows for every species. */
export function setExplicitSet(
  enabledSet: Set<string>,
  allSpeciesIds: readonly string[]
): void {
  _store.update((s) => {
    const next = new Map<string, boolean>();
    for (const id of allSpeciesIds) {
      const en = enabledSet.has(id);
      next.set(id, en);
      pendingFlush.set(id, en);
    }
    return { ...s, prefs: next, error: null };
  });
  scheduleFlush();
}

/** Drop all explicit rows so the user falls back to the
 *  zero-rows-means-all-enabled default. Cancels any pending flush
 *  (those upserts would race the delete) and clears local state
 *  immediately for snappy UI; rolls back if the network DELETE fails. */
export async function enableAll(_allSpeciesIds?: readonly string[]): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  pendingFlush = new Map();
  const previous = get(_store);
  _store.set({ prefs: new Map(), loaded: previous.loaded, error: null });
  try {
    await removeAllMine();
    lastConfirmed = new Map();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not reset preferences.';
    _store.set({ ...previous, error: msg });
  }
}
