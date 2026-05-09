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
  /** Mode: 'heatmap' (zoom < 13) or 'individual' (zoom ≥ 13). */
  mode: 'heatmap' | 'individual';
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

/** True when the URL includes ?perf=1. Read once at module load —
 *  toggling requires a reload, which is fine for a debug HUD. */
export const perfEnabled: boolean = (() => {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('perf') === '1';
  } catch {
    return false;
  }
})();
