// Species service: read species and search by name/alias for typeahead.

import { supabase } from '$lib/supabase';
import type { Database } from '$lib/database.types';

export type Species = Database['public']['Tables']['species']['Row'];

let cache: Species[] | null = null;

/** Fetch all species (cached after first call; v1 has ~30). */
export async function listAll(): Promise<Species[]> {
  if (cache) return cache;
  const { data, error } = await supabase.from('species').select('*').order('common_name');
  if (error) {
    console.error('[speciesService] listAll error:', error);
    throw error;
  }
  cache = data ?? [];
  return cache;
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
