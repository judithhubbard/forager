// Profile (public username) service.

import { supabase } from '$lib/supabase';
import type { Database } from '$lib/database.types';

export type Profile = Database['public']['Tables']['profiles']['Row'];

/** A username is "real" once the user has chosen one — anything that
 *  still matches the `user_<8hex>` placeholder pattern was auto-issued
 *  by the auth trigger and prompts the picker UI. */
export function isPlaceholderUsername(u: string | null | undefined): boolean {
  return !!u && /^user_[0-9a-f]{8}$/.test(u);
}

/** Resolve the best display label for a profile-like row. Prefers
 *  display_name, falls back to @username, then to a generic "(unnamed)"
 *  if both are missing (shouldn't happen post-trigger). */
export function profileLabel(
  p: { username?: string | null; display_name?: string | null } | null | undefined
): string {
  if (!p) return '(unnamed)';
  if (p.display_name) return p.display_name;
  if (p.username) return '@' + p.username;
  return '(unnamed)';
}

export async function getMine(): Promise<Profile | null> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.error('[profileService] getMine error:', error);
    throw error;
  }
  return data;
}

export async function isAvailable(candidate: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('username_available', {
    candidate: candidate.toLowerCase()
  });
  if (error) {
    console.error('[profileService] isAvailable error:', error);
    throw error;
  }
  return data ?? false;
}

export interface UpdateProfileInput {
  username?: string;
  display_name?: string | null;
}

export async function update(input: UpdateProfileInput): Promise<Profile> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in.');
  const patch: { username?: string; display_name?: string | null } = {};
  if (input.username !== undefined) patch.username = input.username.toLowerCase();
  if (input.display_name !== undefined)
    patch.display_name = input.display_name?.trim() || null;
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select()
    .single();
  if (error) {
    // Surface unique-violation as a typed error so the UI can show
    // "username taken" without parsing Postgres error strings.
    if ((error as { code?: string }).code === '23505') {
      throw new UsernameTakenError(patch.username ?? '');
    }
    console.error('[profileService] update error:', error);
    throw error;
  }
  return data;
}

export class UsernameTakenError extends Error {
  constructor(public username: string) {
    super(`Username "${username}" is taken.`);
    this.name = 'UsernameTakenError';
  }
}
