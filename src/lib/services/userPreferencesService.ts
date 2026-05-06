// User-species preferences service. Phase 1B (PLAN.md). Persists which
// species are visible on the map across reloads + devices.
//
// Storage shape (Postgres): one row per (user_id, species_id) with
// enabled bool. Zero rows for a user means "all enabled" — we do not
// pre-materialize all-enabled rows on signup, and the store treats
// zero rows as the show-all state.

import { supabase } from '$lib/supabase';

export interface SpeciesPref {
  speciesId: string;
  enabled: boolean;
}

/** Fetch all preferences for the current user. Empty array means
 *  "all species enabled" — not "no species enabled." */
export async function listMine(): Promise<SpeciesPref[]> {
  const { data, error } = await supabase
    .from('user_species_preferences')
    .select('species_id, enabled');
  if (error) {
    console.error('[userPreferencesService] listMine error:', error);
    throw error;
  }
  return (data ?? []).map((r) => ({
    speciesId: r.species_id,
    enabled: r.enabled
  }));
}

/** Bulk upsert. Preserves rows not mentioned in the input — call
 *  remove() to drop a row entirely. */
export async function upsertMany(prefs: SpeciesPref[]): Promise<void> {
  if (prefs.length === 0) return;
  const { data: userData, error: ue } = await supabase.auth.getUser();
  if (ue || !userData.user) {
    throw new Error('Not signed in.');
  }
  const userId = userData.user.id;
  const rows = prefs.map((p) => ({
    user_id: userId,
    species_id: p.speciesId,
    enabled: p.enabled,
    updated_at: new Date().toISOString()
  }));
  const { error } = await supabase
    .from('user_species_preferences')
    .upsert(rows, { onConflict: 'user_id,species_id' });
  if (error) {
    console.error('[userPreferencesService] upsertMany error:', error);
    throw error;
  }
}

/** Remove a single (user, species) preference row. Used to "reset"
 *  a species back to the default-enabled state when zero rows exist
 *  but the user is in the materialized state. */
export async function removeMany(speciesIds: string[]): Promise<void> {
  if (speciesIds.length === 0) return;
  const { error } = await supabase
    .from('user_species_preferences')
    .delete()
    .in('species_id', speciesIds);
  if (error) {
    console.error('[userPreferencesService] removeMany error:', error);
    throw error;
  }
}

/** Wipe every preference row for the current user — back to the
 *  default-all-enabled state. RLS scopes the delete to auth.uid()
 *  so the unfiltered DELETE is safe. */
export async function removeAllMine(): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const { error } = await supabase
    .from('user_species_preferences')
    .delete()
    .eq('user_id', uid);
  if (error) {
    console.error('[userPreferencesService] removeAllMine error:', error);
    throw error;
  }
}
