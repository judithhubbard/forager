// Live track recorder. Phase C of the tracks feature.
//
// Limitations on PWA: navigator.geolocation.watchPosition runs in
// the foreground only. If the user backgrounds the tab or locks the
// screen, sampling pauses (the OS halts the timer). Capacitor's
// native geolocation plugin (Phase 4) lifts that restriction.
//
// For crash + reload safety the recording state is mirrored to
// localStorage on every push, so a tab refresh mid-walk does not
// lose the buffered points. The user can resume the same recording
// from the same browser session.

import { writable, get, type Writable } from 'svelte/store';
import { browser } from '$app/environment';
import { haversineMeters } from '$lib/utils/distance';

export interface RecordedPoint {
  lat: number;
  lng: number;
  accuracy_m: number | null;
  /** ms epoch — recorded_at when serialized for the API. */
  ts: number;
}

export type RecorderStatus = 'idle' | 'recording' | 'paused';

export interface RecorderState {
  status: RecorderStatus;
  /** ms epoch when the very first point was captured. */
  startedAt: number | null;
  /** ms epoch when the most recent point was captured. */
  endedAt: number | null;
  points: RecordedPoint[];
  /** Surfaces the latest geolocation error so the UI can show it. */
  error: string | null;
}

const KEY = 'forager.recording.v1';

function emptyState(): RecorderState {
  return {
    status: 'idle',
    startedAt: null,
    endedAt: null,
    points: [],
    error: null
  };
}

function loadInitial(): RecorderState {
  if (!browser) return emptyState();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<RecorderState>;
    // Resume in 'paused' regardless of last status — the watchPosition
    // handle is gone after a reload, so we should not pretend we're
    // still actively sampling. The user clicks Resume to start again.
    return {
      status: parsed.status === 'idle' ? 'idle' : 'paused',
      startedAt: parsed.startedAt ?? null,
      endedAt: parsed.endedAt ?? null,
      points: Array.isArray(parsed.points) ? parsed.points : [],
      error: null
    };
  } catch {
    return emptyState();
  }
}

const _store: Writable<RecorderState> = writable(loadInitial());
export const recording = { subscribe: _store.subscribe };

if (browser) {
  _store.subscribe((s) => {
    try {
      // Trim 'error' from the persisted form — it's a transient.
      const persist = { ...s, error: null };
      localStorage.setItem(KEY, JSON.stringify(persist));
    } catch {
      // Quota exceeded — drop oldest half of points and retry once.
      const half = Math.floor(s.points.length / 2);
      _store.update((cur) => ({ ...cur, points: cur.points.slice(half) }));
    }
  });
}

let watchId: number | null = null;

function clearWatch() {
  if (watchId != null && typeof navigator !== 'undefined') {
    navigator.geolocation.clearWatch(watchId);
  }
  watchId = null;
}

function startWatch() {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    _store.update((s) => ({ ...s, error: 'Geolocation not supported in this browser.' }));
    return;
  }
  if (watchId != null) return;
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const p: RecordedPoint = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy_m: Number.isFinite(pos.coords.accuracy)
          ? Math.round(pos.coords.accuracy)
          : null,
        ts: pos.timestamp || Date.now()
      };
      _store.update((s) => {
        // Drop very-jittery points (>200m accuracy) when we already
        // have a tighter previous point — saves clutter on poor GPS.
        if (
          p.accuracy_m != null &&
          p.accuracy_m > 200 &&
          s.points.length > 0 &&
          (s.points[s.points.length - 1].accuracy_m ?? 9999) < 200
        ) {
          return s;
        }
        // Skip near-duplicates within ~3m of the last point — the
        // user probably stopped to look at a tree.
        const last = s.points[s.points.length - 1];
        if (last && haversineMeters(last.lat, last.lng, p.lat, p.lng) < 3) {
          return s;
        }
        return {
          ...s,
          // startedAt is already set in start(); leave it alone so
          // the elapsed-time display ticks from the click rather
          // than from the first GPS fix.
          endedAt: p.ts,
          points: [...s.points, p],
          error: null
        };
      });
    },
    (err) => {
      const code = err.code;
      const msg =
        code === 1 ? 'Location permission denied — enable location for this site.'
        : code === 2 ? 'Could not determine location.'
        : code === 3 ? 'Location request timed out.'
        : err.message || 'Location error.';
      _store.update((s) => ({ ...s, error: msg }));
    },
    { enableHighAccuracy: true, timeout: 30_000, maximumAge: 5_000 }
  );
}


export function start(): void {
  const s = get(_store);
  if (s.status === 'recording') return;
  if (s.status === 'idle') {
    // Stamp startedAt at the click moment so the elapsed-time
    // display ticks immediately. Without this, indoor / no-GPS
    // sessions sat at 0:00 until the first fix arrived, which the
    // user reasonably read as the timer being broken.
    _store.set({ ...emptyState(), status: 'recording', startedAt: Date.now() });
  } else {
    _store.update((cur) => ({ ...cur, status: 'recording', error: null }));
  }
  startWatch();
}

export function pause(): void {
  const s = get(_store);
  if (s.status !== 'recording') return;
  clearWatch();
  _store.update((cur) => ({ ...cur, status: 'paused' }));
}

export function resume(): void {
  const s = get(_store);
  if (s.status !== 'paused') return;
  _store.update((cur) => ({ ...cur, status: 'recording', error: null }));
  startWatch();
}

/** Stop recording without saving anywhere. Caller is responsible
 *  for calling stopAndSave / discard to actually clear state.
 *  Returns the snapshot at stop time. */
export function stop(): RecorderState {
  clearWatch();
  const s = get(_store);
  _store.update((cur) => ({ ...cur, status: 'idle' }));
  return s;
}

export function discard(): void {
  clearWatch();
  _store.set(emptyState());
}

/** Computed total distance (meters) of the buffered points. */
export function bufferedDistanceMeters(state: RecorderState): number {
  let m = 0;
  for (let i = 1; i < state.points.length; i++) {
    m += haversineMeters(
      state.points[i - 1].lat, state.points[i - 1].lng,
      state.points[i].lat,     state.points[i].lng
    );
  }
  return m;
}
