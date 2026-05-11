// Global "scope of the dataset" stats — total pins, species, regions,
// observations. Used to show users how big Forager is across the
// About page and welcome flow. Backed by the global_stats() RPC
// (migration 77), which uses pg_class.reltuples for fast approximate
// pin count instead of a 2M-row seqscan.
//
// Auto-update: TTL-based. The cache expires every 15 minutes; the
// next page-view fires a fresh fetch in the background. New pins
// added to the DB show up after at most 15 min + the next ANALYZE
// (Supabase autovacuums every few hours, so reltuples freshens
// itself naturally).

import { browser } from '$app/environment';
import { supabase } from '$lib/supabase';

export interface GlobalStats {
  total_pins: number;
  total_species: number;
  total_cities: number;
  /** Wall-clock time the row was fetched. Used to render an "as of"
   *  timestamp so users can see how fresh the headline is. */
  fetched_at: string;
}

// v6 bumped 2026-05-10 after the top-untouched-metros Phase 4 batch
// (Houston, Charlotte, Atlanta, Salt Lake City — ~151k new pins from
// city-owned inventories; Phoenix/Dallas/Tucson/Detroit remain Phase 3
// outreach). Invalidates v5 cached totals.
const LS_KEY = 'forager.global-stats.v6';
const TTL_MS = 24 * 60 * 60 * 1000;

let inMemory: GlobalStats | null = null;

function loadFromStorage(): GlobalStats | null {
  if (!browser) return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GlobalStats;
    if (typeof parsed?.fetched_at !== 'string') return null;
    if (Date.now() - new Date(parsed.fetched_at).getTime() > TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveToStorage(stats: GlobalStats): void {
  if (!browser) return;
  try { localStorage.setItem(LS_KEY, JSON.stringify(stats)); } catch { /* storage full / disabled — fine */ }
}

/** Fetch global stats. Returns immediately from cache if fresh
 *  (in-memory → localStorage), otherwise fires a network call.
 *  On stale-cache hit, fires a background refresh so the next call
 *  picks up newer numbers. Never throws — returns null on hard
 *  failure so the UI can show "—" instead of crashing. */
export async function getGlobalStats(): Promise<GlobalStats | null> {
  if (inMemory) return inMemory;
  const cached = loadFromStorage();
  if (cached) {
    inMemory = cached;
    void refreshFromServer().catch(() => undefined);
    return cached;
  }
  return refreshFromServer();
}

async function refreshFromServer(): Promise<GlobalStats | null> {
  try {
    const { data, error } = await supabase.rpc('global_stats' as never).single();
    if (error) {
      console.error('[statsService] global_stats RPC failed:', error);
      return null;
    }
    const row = data as unknown as Omit<GlobalStats, 'fetched_at'>;
    const stats: GlobalStats = {
      total_pins: Number(row.total_pins ?? 0),
      total_species: Number(row.total_species ?? 0),
      total_cities: Number((row as unknown as { total_cities?: number }).total_cities ?? 0),
      fetched_at: new Date().toISOString()
    };
    inMemory = stats;
    saveToStorage(stats);
    return stats;
  } catch (err) {
    console.error('[statsService] refreshFromServer failed:', err);
    return null;
  }
}

/** Format big integers with M/k abbreviations for the headline.
 *  >= 1M → "2.3M". 100k-1M → "287K". 10k-100k → "12K". <10k → exact. */
export function formatPinCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 100_000)   return Math.round(n / 1000) + 'K';
  if (n >= 10_000)    return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}
