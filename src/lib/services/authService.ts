// Auth service: wraps supabase.auth.
// Per PLAN §10 C18, components import from here, not from the raw client.

import type { Session } from '@supabase/supabase-js';
import { supabase } from '$lib/supabase';

export type SignInResult =
  | { ok: true; session: Session }
  | { ok: false; message: string };

export async function signInWithPassword(email: string, password: string): Promise<SignInResult> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    return { ok: false, message: error?.message ?? 'Sign-in failed.' };
  }
  return { ok: true, session: data.session };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/** Subscribe to auth state changes. Returns an unsubscribe function. */
export function onAuthChange(cb: (session: Session | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}
