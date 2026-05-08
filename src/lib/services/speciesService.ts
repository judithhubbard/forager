// Species service: read species and search by name/alias for typeahead.

import { browser } from '$app/environment';
import { supabase } from '$lib/supabase';
import type { Database } from '$lib/database.types';

/** Species row + columns added after database.types.ts was last
 *  regenerated. Same pattern as profile.is_global_admin.
 *  - image_url, image_attribution: 20260506000028
 *  - invasive_flag_count: 20260508000068 (denormalized counter)
 *  - identification_notes, management_notes: 20260508000069
 *    (content for both foragable AND inedible-invasive entries)
 *  - is_forageable: existing column we now read explicitly so the
 *    "Show invasives" layer can filter by it.
 */
export type Species = Database['public']['Tables']['species']['Row'] & {
  image_url: string | null;
  image_attribution: string | null;
  invasive_flag_count: number;
  identification_notes: string | null;
  management_notes: string | null;
};

let cache: Species[] | null = null;

/** localStorage-backed cache so the species list survives a page
 *  reload. Cellular cold-starts used to pay ~500-1500ms for the
 *  full /rest/v1/species call on every refresh; persisting bumps
 *  reload-to-interactive significantly. TTL is 1 hour — species
 *  rarely change, but invasive-flag toggles bump invasive_flag_count
 *  on the row, and we want those to surface within an hour even
 *  without a manual cache clear (toggleInvasive() also calls
 *  clearCache() for the immediate path). */
const LS_KEY = 'forager.species.cache.v1';
const LS_TTL_MS = 60 * 60 * 1000;

function loadFromStorage(): Species[] | null {
  if (!browser) return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; data: Species[] };
    if (typeof parsed?.at !== 'number' || !Array.isArray(parsed.data)) return null;
    if (Date.now() - parsed.at > LS_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function saveToStorage(data: Species[]): void {
  if (!browser) return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // Quota exceeded or storage disabled — fine, in-memory cache still works.
  }
}

/** Fetch all species. Hits in-memory cache first, then localStorage
 *  (1h TTL), then network. Stale-while-revalidate: if localStorage
 *  has a hit, return it immediately AND fire a background refresh so
 *  the next call picks up any server-side changes. */
export async function listAll(): Promise<Species[]> {
  if (cache) return cache;
  const persisted = loadFromStorage();
  if (persisted) {
    cache = persisted;
    // Background refresh — don't block the caller, just freshen cache.
    void refreshFromServer().catch(() => {
      // Network failed; keep the persisted snapshot. UI keeps working
      // offline-degraded.
    });
    return cache;
  }
  return refreshFromServer();
}

async function refreshFromServer(): Promise<Species[]> {
  const { data, error } = await supabase.from('species').select('*').order('common_name');
  if (error) {
    console.error('[speciesService] listAll error:', error);
    throw error;
  }
  const fetched = (data ?? []) as unknown as Species[];
  cache = fetched;
  saveToStorage(fetched);
  return fetched;
}

/** Drop both in-memory and persisted caches so the next listAll()
 *  refetches. Call after any write that modifies a species row —
 *  invasive-flag toggles, curation edits — so map symbology and the
 *  species panel pick up the change without a hard reload. */
export function clearCache(): void {
  cache = null;
  if (browser) {
    try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
  }
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
