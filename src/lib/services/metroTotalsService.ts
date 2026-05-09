// Per-metro pin totals for heatmap-tooltip "Boston area · 14,283 pins".
//
// Fetches the global band-1 density grid (~600 cells, sub-100KB) and
// aggregates by metro client-side. Caches in localStorage for 24h —
// the underlying pin counts only change on imports, which are
// infrequent and never daily.

import { supabase } from '$lib/supabase';
import { aggregateByMetro } from '$lib/utils/metros';

const LS_KEY = 'forager.metro-totals.v1';
const TTL_MS = 24 * 60 * 60 * 1000;

interface CachedTotals {
  totals: Record<string, number>;
  fetched_at: string;
}

let memo: Promise<Record<string, number>> | null = null;

export function getMetroTotals(): Promise<Record<string, number>> {
  if (memo) return memo;
  memo = loadMetroTotals();
  return memo;
}

async function loadMetroTotals(): Promise<Record<string, number>> {
  // Check localStorage first.
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CachedTotals;
      const age = Date.now() - new Date(parsed.fetched_at).getTime();
      if (age < TTL_MS) return parsed.totals;
    }
  } catch {
    // ignore parse / storage errors, fall through to refetch
  }

  // World-spanning bbox so the RPC returns every band-1 cell.
  const { data, error } = await supabase.rpc('public_pins_density_json' as never, {
    p_min_lng: -180,
    p_min_lat: -85,
    p_max_lng: 180,
    p_max_lat: 85,
    p_zoom: 6 // band 1
  } as never);
  if (error) {
    console.warn('[metroTotalsService] fetch failed, falling back to empty', error);
    return {};
  }
  const cells = (data ?? []) as unknown as Array<{
    centroid_lat: number;
    centroid_lng: number;
    count_pins: number;
  }>;
  const totals = aggregateByMetro(cells);

  try {
    const payload: CachedTotals = { totals, fetched_at: new Date().toISOString() };
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota errors
  }
  return totals;
}
