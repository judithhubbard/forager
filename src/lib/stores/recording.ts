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
  /** Set when the watchdog detects the GPS watch has gone silent
   *  (no fix in WATCHDOG_SILENT_MS while status==='recording'). The
   *  recorder UI shows a "GPS lost" warning so the user can react.
   *  Cleared on the next successful fix. */
  gpsSilent: boolean;
}

const KEY = 'forager.recording.v1';

function emptyState(): RecorderState {
  return {
    status: 'idle',
    startedAt: null,
    endedAt: null,
    points: [],
    error: null,
    gpsSilent: false
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
      error: null,
      gpsSilent: false
    };
  } catch {
    return emptyState();
  }
}

const _store: Writable<RecorderState> = writable(loadInitial());
export const recording = { subscribe: _store.subscribe };

/** Throttled persist. Earlier code wrote the full state JSON to
 *  localStorage on every GPS fix. For an hour-long walk that's
 *  ~3600 synchronous JSON.stringify + disk writes of a steadily
 *  growing array, on the main thread. Now we batch: while
 *  recording, write at most every PERSIST_MS; always flush
 *  immediately on a status transition (start/pause/stop) so
 *  crash-recovery still has the right idle-vs-paused signal. */
const PERSIST_MS = 5_000;
let pendingState: RecorderState | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let lastPersistedStatus: RecorderStatus | null = null;

function writeNow(s: RecorderState) {
  try {
    const persist = { ...s, error: null };
    localStorage.setItem(KEY, JSON.stringify(persist));
    lastPersistedStatus = s.status;
  } catch {
    const half = Math.floor(s.points.length / 2);
    _store.update((cur) => ({ ...cur, points: cur.points.slice(half) }));
  }
}

if (browser) {
  _store.subscribe((s) => {
    pendingState = s;
    // Status transitions write through immediately so the persisted
    // 'idle' / 'paused' marker is never stale.
    if (s.status !== lastPersistedStatus) {
      if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
      writeNow(s);
      return;
    }
    if (persistTimer) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      if (pendingState) writeNow(pendingState);
    }, PERSIST_MS);
  });
}

let watchId: number | null = null;
/** Wall-clock timestamp of the last GPS fix that survived filtering
 *  (above-200m-accuracy + within-3m-of-last-point are both rejected).
 *  Drives the watchdog: if this is more than WATCHDOG_SILENT_MS
 *  behind Date.now() while we're nominally recording, the watch has
 *  gone silent and we surface that to the UI. */
let lastFixAt = 0;
/** ms threshold before declaring the GPS watch silent. iOS Safari
 *  can pause watchPosition silently when the tab backgrounds. 60s
 *  is long enough that a normal indoor "no signal" gap doesn't fire,
 *  short enough that a real glitch is caught before the user has
 *  walked far. */
// 30s silent gap → re-arm. Was 60s, but mobile users were seeing the
// dot freeze for up to a minute before the watchdog kicked in. 30s
// trades faster recovery against slightly more aggressive re-arms
// during intermittent GPS (under tree cover, urban canyons).
const WATCHDOG_SILENT_MS = 30_000;
let watchdogTimer: ReturnType<typeof setInterval> | null = null;
let visListener: (() => void) | null = null;

function clearWatch() {
  if (watchId != null && typeof navigator !== 'undefined') {
    navigator.geolocation.clearWatch(watchId);
  }
  watchId = null;
  if (watchdogTimer != null) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
  if (visListener != null && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', visListener);
    visListener = null;
  }
}

/** Tear down + re-arm the geolocation watch. Called from the
 *  watchdog when a silent stop is detected, and from the
 *  visibilitychange handler when the user comes back to the tab
 *  (mobile browsers sometimes pause watchPosition silently while
 *  backgrounded). Idempotent. */
function rearmWatch() {
  if (watchId != null && typeof navigator !== 'undefined') {
    navigator.geolocation.clearWatch(watchId);
  }
  watchId = null;
  startWatch();
}

function startWatch() {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    _store.update((s) => ({ ...s, error: 'Geolocation not supported in this browser.' }));
    return;
  }
  if (watchId != null) return;
  // Reset the heartbeat so we don't immediately fire the watchdog
  // before the first real fix arrives.
  lastFixAt = Date.now();
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      // Heartbeat: any callback (even one we drop for accuracy) is
      // proof the watch is alive. Update before the filter check.
      lastFixAt = Date.now();
      const p: RecordedPoint = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy_m: Number.isFinite(pos.coords.accuracy)
          ? Math.round(pos.coords.accuracy)
          : null,
        ts: pos.timestamp || Date.now()
      };
      _store.update((s) => {
        // Clear any prior gpsSilent / error state on a healthy fix.
        const cleared = s.gpsSilent || s.error
          ? { ...s, gpsSilent: false, error: null }
          : s;
        // Drop very-jittery points (>200m accuracy) when we already
        // have a tighter previous point — saves clutter on poor GPS.
        if (
          p.accuracy_m != null &&
          p.accuracy_m > 200 &&
          cleared.points.length > 0 &&
          (cleared.points[cleared.points.length - 1].accuracy_m ?? 9999) < 200
        ) {
          return cleared;
        }
        // Skip near-duplicates within ~3m of the last point — the
        // user probably stopped to look at a tree.
        const last = cleared.points[cleared.points.length - 1];
        if (last && haversineMeters(last.lat, last.lng, p.lat, p.lng) < 3) {
          return cleared;
        }
        return {
          ...cleared,
          // startedAt is already set in start(); leave it alone so
          // the elapsed-time display ticks from the click rather
          // than from the first GPS fix.
          endedAt: p.ts,
          points: [...cleared.points, p]
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

  // Start the watchdog if it isn't running. Fires every 10s; if
  // we're recording and lastFixAt is more than WATCHDOG_SILENT_MS
  // behind the wall clock, declare a silent stop and try to re-arm
  // the watch. The user-facing UI also surfaces the gpsSilent flag
  // so a glitched recording is visibly broken, not invisibly broken.
  if (watchdogTimer == null && typeof window !== 'undefined') {
    watchdogTimer = setInterval(() => {
      const s = get(_store);
      if (s.status !== 'recording') return;
      const gap = Date.now() - lastFixAt;
      if (gap > WATCHDOG_SILENT_MS) {
        _store.update((cur) => ({
          ...cur,
          gpsSilent: true,
          error: cur.error ?? 'GPS has gone quiet — re-arming the watch.'
        }));
        rearmWatch();
      }
    }, 10_000);
  }

  // Re-arm on visibility regain. Mobile browsers commonly pause
  // watchPosition while the tab is backgrounded; coming back to
  // foreground without re-arming leaves the recording dead silent.
  if (visListener == null && typeof document !== 'undefined') {
    visListener = () => {
      if (document.visibilityState !== 'visible') return;
      const s = get(_store);
      if (s.status !== 'recording') return;
      // Force a re-arm — clearing + re-creating the watchPosition
      // handle is cheap and reliably revives the geolocation pump.
      rearmWatch();
    };
    document.addEventListener('visibilitychange', visListener);
  }
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
