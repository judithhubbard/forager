// Species service: read species and search by name/alias for typeahead.

import { supabase } from '$lib/supabase';
import type { Database } from '$lib/database.types';

/** Species row + the image columns added in 20260506000028. The
 *  generated database.types.ts hasn't been regenerated, so we
 *  extend the row type here. Same pattern as profile.is_global_admin. */
export type Species = Database['public']['Tables']['species']['Row'] & {
  image_url: string | null;
  image_attribution: string | null;
};

let cache: Species[] | null = null;

/** Fetch all species (cached after first call; v1 has ~30). */
export async function listAll(): Promise<Species[]> {
  if (cache) return cache;
  const { data, error } = await supabase.from('species').select('*').order('common_name');
  if (error) {
    console.error('[speciesService] listAll error:', error);
    throw error;
  }
  cache = (data ?? []) as unknown as Species[];
  return cache;
}

/** Drop the cache so the next listAll() refetches. Call after any
 *  write that modifies a species row — invasive-flag toggles,
 *  curation edits — so map symbology and the species panel pick up
 *  the change without a hard reload. */
export function clearCache(): void {
  cache = null;
}

/** Curatable subset of species fields. Editable by global admins
 *  via the in-app /species/[id] curation UI. Other columns
 *  (scientific_name, common_name, aliases, taxonomy) are not
 *  exposed here — those would need a separate, more careful
 *  workflow because they affect import-matching. */
export interface SpeciesCurationPatch {
  forage_parts?: string[];
  preparation_methods?: string[];
  usage_notes?: string | null;
  harvest_tips?: string | null;
  toxicity_notes?: string | null;
  safety_notes?: string;
  /** Direct image URL — typically a Wikimedia Commons thumbnail
   *  but any public URL works. Pair with image_attribution. */
  image_url?: string | null;
  /** Free-form credit line. Required if image_url is set. */
  image_attribution?: string | null;
}

/** Update curatable fields on a species. Server-side enforcement
 *  via the species_update_admin RLS policy; non-admins get a
 *  permission error from PostgREST. The in-memory list cache is
 *  busted on success so the next listAll() call sees the change. */
export async function updateCuration(
  speciesId: string,
  patch: SpeciesCurationPatch
): Promise<Species> {
  // Cast through Record<string, unknown>: image_url / image_attribution
  // are not in the generated Database type yet (regen lag), so the
  // typed update() rejects them. Same pattern as profileService.
  const { data, error } = await supabase
    .from('species')
    .update(patch as unknown as Record<string, never>)
    .eq('id', speciesId)
    .select()
    .single();
  if (error) {
    console.error('[speciesService] updateCuration error:', error);
    throw error;
  }
  cache = null;
  return data as unknown as Species;
}

/** Client-side filter for typeahead. Matches common_name, scientific_name, aliases. */
export function search(species: Species[], query: string): Species[] {
  const q = query.trim().toLowerCase();
  if (!q) return species;
  return species.filter((s) => {
    if (s.common_name.toLowerCase().includes(q)) return true;
    if (s.scientific_name.toLowerCase().includes(q)) return true;
    return (s.aliases ?? []).some((a) => a.toLowerCase().includes(q));
  });
}
