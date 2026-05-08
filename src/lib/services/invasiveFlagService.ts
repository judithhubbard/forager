// Invasive species flagging service. The schema lives in
// supabase/migrations/20260508000068_species_invasive_flags.sql.
//
// Flags are user-scoped contributions to a community-curated metadata
// layer. Anyone signed-in can flag, anyone (including anon) can read.
// region_id = null means "globally invasive"; a specific region_id
// scopes the flag to that region only.

import { supabase } from '$lib/supabase';

export interface InvasiveFlag {
  id: string;
  species_id: string;
  region_id: string | null;
  flagged_by: string;
  notes: string | null;
  created_at: string;
}

export interface InvasiveCounts {
  global_count: number;
  regional_count: number;
  total_count: number;
}

/** Fetch all flags for a species (global + every region). The pin-detail
 *  panel uses this to compute "flagged invasive in N regions" plus
 *  "globally flagged by M users" plus whether the current user has
 *  already flagged it for this region. */
export async function listFlagsForSpecies(speciesId: string): Promise<InvasiveFlag[]> {
  const { data, error } = await supabase
    .from('species_invasive_flags' as never)
    .select('id, species_id, region_id, flagged_by, notes, created_at')
    .eq('species_id', speciesId);
  if (error) throw error;
  return (data ?? []) as unknown as InvasiveFlag[];
}

/** Add a flag. Returns the inserted row. */
export async function addFlag(
  speciesId: string,
  regionId: string | null,
  notes?: string | null
): Promise<InvasiveFlag> {
  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes.user?.id;
  if (!userId) throw new Error('Sign in to flag a species as invasive.');

  const { data, error } = await supabase
    .from('species_invasive_flags' as never)
    .insert({
      species_id: speciesId,
      region_id: regionId,
      flagged_by: userId,
      notes: notes ?? null
    } as never)
    .select('id, species_id, region_id, flagged_by, notes, created_at')
    .single();
  if (error) throw error;
  return data as unknown as InvasiveFlag;
}

/** Remove the current user's flag for this species+region (or global). */
export async function removeFlag(
  speciesId: string,
  regionId: string | null
): Promise<void> {
  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes.user?.id;
  if (!userId) throw new Error('Not signed in.');

  let q = supabase
    .from('species_invasive_flags' as never)
    .delete()
    .eq('species_id', speciesId)
    .eq('flagged_by', userId);
  q = regionId === null ? q.is('region_id', null) : q.eq('region_id', regionId);
  const { error } = await q;
  if (error) throw error;
}
