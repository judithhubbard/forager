// UX event tracker.
//
// Lightweight self-hosted analytics: each significant UX event
// (locate-me click, recording start, panel toggle, GPS gone-silent,
// etc) is appended to a client-side queue and flushed to
// public.ux_events in Supabase every ~10s, on visibility change, and
// before unload. Use this to evaluate UX over time, debug edge cases,
// and validate that fixes actually changed user behavior.
//
// Privacy posture:
//   - session_id is a random uuid generated per page load. NOT
//     persisted across sessions, NOT linked to any cookie.
//   - user_id is auth.uid() if signed in, null otherwise.
//   - props payload is whatever the call site passes — keep it
//     minimal and avoid PII (no names, no full lat/lng, no photo
//     contents). Coordinates can be rounded to 2 decimals (~1km)
//     when geographic context is needed.
//
// Failures are silent. Tracking must never break the app.

import { browser } from '$app/environment';
import { supabase } from '$lib/supabase';

interface PendingEvent {
  event_name: string;
  props: Record<string, unknown>;
  page: string;
  viewport_w: number;
  viewport_h: number;
  user_agent: string;
  created_at: string; // ISO; server fills if omitted, but we record at-event time
}

const FLUSH_INTERVAL_MS = 10_000;
const MAX_BATCH = 50;

let sessionId: string | null = null;
let queue: PendingEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let visListener: (() => void) | null = null;
let unloadListener: (() => void) | null = null;

function ensureSession(): string {
  if (!sessionId) {
    sessionId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
  }
  return sessionId;
}

function startFlushLoop(): void {
  if (!browser) return;
  if (flushTimer != null) return;
  flushTimer = setInterval(() => { void flush(); }, FLUSH_INTERVAL_MS);
  if (visListener == null) {
    visListener = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    document.addEventListener('visibilitychange', visListener);
  }
  if (unloadListener == null) {
    unloadListener = () => { void flush(); };
    window.addEventListener('pagehide', unloadListener);
  }
}

/** Append a UX event to the queue. Non-blocking; flushed periodically. */
export function track(event_name: string, props: Record<string, unknown> = {}): void {
  if (!browser) return;
  ensureSession();
  startFlushLoop();
  queue.push({
    event_name,
    props,
    page: typeof location !== 'undefined' ? location.pathname : '',
    viewport_w: typeof window !== 'undefined' ? window.innerWidth : 0,
    viewport_h: typeof window !== 'undefined' ? window.innerHeight : 0,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    created_at: new Date().toISOString()
  });
  // Flush early on big events to surface them quickly when debugging,
  // but don't flush every event — batch is the whole point.
  if (queue.length >= MAX_BATCH) void flush();
}

async function flush(): Promise<void> {
  if (!browser) return;
  if (queue.length === 0) return;
  const sid = ensureSession();
  const batch = queue.splice(0, MAX_BATCH);
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const rows = batch.map((e) => ({
      user_id: user?.id ?? null,
      session_id: sid,
      event_name: e.event_name,
      props: e.props,
      page: e.page,
      viewport_w: e.viewport_w,
      viewport_h: e.viewport_h,
      user_agent: e.user_agent,
      created_at: e.created_at
    }));
    const { error } = await supabase.from('ux_events' as never).insert(rows as never);
    if (error) {
      // Push back onto the queue so we retry next flush. Keeps things
      // bounded by the MAX_BATCH cap.
      queue.unshift(...batch);
      console.warn('[uxTracker] flush failed, retrying:', error.message);
    }
  } catch (err) {
    queue.unshift(...batch);
    console.warn('[uxTracker] flush exception:', err);
  }
}

/** Force-flush the queue. Useful in tests / before known navigations. */
export async function flushNow(): Promise<void> {
  await flush();
}
