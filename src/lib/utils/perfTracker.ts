// Lightweight perf tracker for pin/heatmap viewport fetches.
//
// Records per-fetch timings — server+network round-trip, client render
// time, total wall-clock — into a 30-sample ring buffer. Surfaces
// median/p90/last-sample via a HUD shown when `?perf=1` is in the URL,
// so the admin can profile click+zoom interactions without any
// settings UI.

import { writable, type Writable } from 'svelte/store';

export interface PerfSample {
  /** Zoom level at the time of the fetch. */
  zoom: number;
  /** How many cells / pins came back in the response. */
  result_count: number;
  /** Server + network round-trip in ms (RPC start → response received). */
  fetch_ms: number;
  /** Client render time in ms (buckets assigned → next animation frame). */
  render_ms: number;
  /** fetch_ms + render_ms. */
  total_ms: number;
  /** Bbox area in degrees^2 — bigger viewport = bigger payload. */
  bbox_area_deg2: number;
  /** Mode: 'heatmap' (zoom < 13), 'individual' (runtime decimation
   *  RPC for z15+ or when invasives are on), 'precalc-z13' or
   *  'precalc-z14' (migration-27/28 fast paths). Helps distinguish
   *  "is the precalc actually firing?" from "are queries fast?"
   *  at a glance in the HUD. */
  mode: 'heatmap' | 'individual' | 'precalc-z13' | 'precalc-z14';
  /** Wall-clock time when this sample finished. */
  finished_at: number;
}

export interface PerfStats {
  count: number;
  last: PerfSample | null;
  median: { fetch: number; render: number; total: number };
  p90: { fetch: number; render: number; total: number };
  max: { fetch: number; render: number; total: number };
}

const RING_SIZE = 30;
const samples: PerfSample[] = [];

export const perfStore: Writable<PerfStats> = writable(emptyStats());

function emptyStats(): PerfStats {
  return {
    count: 0,
    last: null,
    median: { fetch: 0, render: 0, total: 0 },
    p90: { fetch: 0, render: 0, total: 0 },
    max: { fetch: 0, render: 0, total: 0 }
  };
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

function recompute() {
  if (samples.length === 0) {
    perfStore.set(emptyStats());
    return;
  }
  const fetches = samples.map((s) => s.fetch_ms);
  const renders = samples.map((s) => s.render_ms);
  const totals = samples.map((s) => s.total_ms);
  perfStore.set({
    count: samples.length,
    last: samples[samples.length - 1],
    median: {
      fetch: percentile(fetches, 0.5),
      render: percentile(renders, 0.5),
      total: percentile(totals, 0.5)
    },
    p90: {
      fetch: percentile(fetches, 0.9),
      render: percentile(renders, 0.9),
      total: percentile(totals, 0.9)
    },
    max: {
      fetch: Math.max(...fetches),
      render: Math.max(...renders),
      total: Math.max(...totals)
    }
  });
}

export function recordSample(s: PerfSample): void {
  samples.push(s);
  while (samples.length > RING_SIZE) samples.shift();
  recompute();
}

export function clearSamples(): void {
  samples.length = 0;
  recompute();
}

/** Pending-fetch state, used by the HUD to show "loading…" between
 *  fetch start and render end. */
export const pendingFetch: Writable<{
  zoom: number;
  startedAt: number;
} | null> = writable(null);

/** True when the perf HUD should render. Reads in this priority:
 *  1. URL `?perf=1` → enables AND persists to localStorage so it
 *     stays on across page reloads + same-tab navigation.
 *  2. URL `?perf=0` → disables AND clears the localStorage flag.
 *  3. localStorage `forager.perf` === '1' → enabled (set previously).
 *
 *  So once you append `?perf=1` once, the HUD stays on for the
 *  session until you append `?perf=0`. That makes it useful for
 *  "validate this performance change across several pans/zooms"
 *  without re-typing the query string each time. */
const PERF_LS_KEY = 'forager.perf';
export const perfEnabled: boolean = (() => {
  if (typeof window === 'undefined') return false;
  try {
    const url = new URLSearchParams(window.location.search).get('perf');
    if (url === '1') {
      try { localStorage.setItem(PERF_LS_KEY, '1'); } catch { /* storage disabled */ }
      return true;
    }
    if (url === '0') {
      try { localStorage.removeItem(PERF_LS_KEY); } catch { /* storage disabled */ }
      return false;
    }
    try { return localStorage.getItem(PERF_LS_KEY) === '1'; } catch { return false; }
  } catch {
    return false;
  }
})();
