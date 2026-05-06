// Watchlist service. Phase 2F (PLAN.md). Lets a signed-in user
// star a species or a specific pin so they can be notified when it
// hits ripe. The notification *delivery* is a separate piece (a
// pg_cron job or edge function) that writes to public.notifications;
// this service only handles the user-facing "watch this" CRUD.

import { v4 as uuidv4 } from 'uuid';
import { supabase } from '$lib/supabase';

export type WatchlistRow = {
  id: string;
  user_id: string;
  species_id: string | null;
  pin_id: string | null;
  notify_email: boolean;
  notify_in_app: boolean;
  created_at: string;
};

export type NotificationKind = 'ripe_now' | 'comment_reply' | 'correction' | 'system';

export type NotificationRow = {
  id: string;
  user_id: string;
  kind: NotificationKind;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export async function listMine(): Promise<WatchlistRow[]> {
  const { data, error } = await supabase
    .from('watchlist')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[watchlistService] listMine error:', error);
    throw error;
  }
  return (data ?? []) as WatchlistRow[];
}

export async function watchSpecies(
  speciesId: string,
  prefs: { notifyEmail?: boolean; notifyInApp?: boolean } = {}
): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error('Sign in to watch a species.');
  const id = uuidv4();
  const { error } = await supabase.from('watchlist').insert({
    id,
    user_id: uid,
    species_id: speciesId,
    pin_id: null,
    notify_email: prefs.notifyEmail ?? true,
    notify_in_app: prefs.notifyInApp ?? true
  });
  if (error) {
    console.error('[watchlistService] watchSpecies error:', error);
    throw error;
  }
  return id;
}

export async function watchPin(
  pinId: string,
  prefs: { notifyEmail?: boolean; notifyInApp?: boolean } = {}
): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error('Sign in to watch a pin.');
  const id = uuidv4();
  const { error } = await supabase.from('watchlist').insert({
    id,
    user_id: uid,
    species_id: null,
    pin_id: pinId,
    notify_email: prefs.notifyEmail ?? true,
    notify_in_app: prefs.notifyInApp ?? true
  });
  if (error) {
    console.error('[watchlistService] watchPin error:', error);
    throw error;
  }
  return id;
}

export async function unwatch(rowId: string): Promise<void> {
  const { error } = await supabase.from('watchlist').delete().eq('id', rowId);
  if (error) {
    console.error('[watchlistService] unwatch error:', error);
    throw error;
  }
}

/** Quick lookup helpers used by the pin/species detail UIs to render
 *  the "Watch / Unwatch" toggle without re-fetching the full list. */
export async function isWatchingSpecies(speciesId: string): Promise<WatchlistRow | null> {
  const { data, error } = await supabase
    .from('watchlist')
    .select('*')
    .eq('species_id', speciesId)
    .maybeSingle();
  if (error) {
    console.error('[watchlistService] isWatchingSpecies error:', error);
    return null;
  }
  return (data ?? null) as WatchlistRow | null;
}

export async function isWatchingPin(pinId: string): Promise<WatchlistRow | null> {
  const { data, error } = await supabase
    .from('watchlist')
    .select('*')
    .eq('pin_id', pinId)
    .maybeSingle();
  if (error) {
    console.error('[watchlistService] isWatchingPin error:', error);
    return null;
  }
  return (data ?? null) as WatchlistRow | null;
}

/** In-app notifications inbox. The bell icon in the header reads
 *  this; the daily ripe-job writes it. Email delivery happens
 *  outside the app (Supabase / Resend / Postmark). */
export async function listNotifications(opts: { unreadOnly?: boolean } = {}): Promise<
  NotificationRow[]
> {
  let q = supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (opts.unreadOnly) q = q.is('read_at', null);
  const { data, error } = await q;
  if (error) {
    console.error('[watchlistService] listNotifications error:', error);
    throw error;
  }
  return (data ?? []) as NotificationRow[];
}

export async function markRead(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId);
  if (error) {
    console.error('[watchlistService] markRead error:', error);
    throw error;
  }
}

export async function markAllRead(): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null);
  if (error) {
    console.error('[watchlistService] markAllRead error:', error);
    throw error;
  }
}
