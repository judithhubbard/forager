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

// v8 bumped 2026-05-11 after the Round D deep crawl finished. Round D
// added ~107k pins across 20 new sources covering: Richmond VA (28.1k),
// Austin PARD (11.5k), Arlington MA (9.2k), Lawrence KS (6.8k),
// Wellesley MA (5.8k), Watertown WI (5.9k), Gaithersburg MD (5.7k),
// Tallahassee (5.7k), Duke University (5.0k), Yale University (5.0k),
// Stanford edible trees (1.1k), Allen TX (2.6k), Richardson TX (2.0k),
// Sarasota County FL (480), Leon County canopy roads (350), Smith
// College Botanic Garden (395), Bates College (380), Wichita KS (368),
// Hillsborough County FL (225), Newport News VA (216), Weaverville NC
// (511). New regions: 'Richmond public', 'Tallahassee public',
// 'Sarasota County public', 'Hillsborough County public', 'Austin
// public', 'Newport News public', 'Northampton public', 'Durham NC
// public', 'Stanford public', 'Weaverville public', 'Leon County
// public', 'Gaithersburg public', 'Wellesley public', 'Arlington MA
// public', 'Watertown WI public', 'Lewiston public', 'Wichita public',
// 'Richardson public', 'Allen TX public', 'Lawrence KS public'.
// Investigated and skipped/gated: Asheville NC (no point feed),
// Norfolk VA (no point feed), Roanoke VA (3D viz only, no species),
// Pinellas County FL (USDA codes, no Latin), Harrisburg PA (codes
// with no domain), Manchester NH (token-gated), Lowell MA (token-
// gated), CRTI/Morton Arb (canopy polygons only). Texas A&M MyCity-
// Trees and ArborScope both flagged for Phase 3 outreach. Invalidates
// v7 cached totals.
const LS_KEY = 'forager.global-stats.v8';
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
