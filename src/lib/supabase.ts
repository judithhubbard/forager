import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';
import type { Database } from './database.types';

// The single Supabase client instance for the app.
// IMPORTANT: per PLAN §10 C18, this is the ONLY module that exports a raw
// client. All Supabase queries go through `src/lib/services/*.ts` modules,
// which provide domain-typed wrappers. Components must not import this file
// directly — they import the relevant service.
//
// Types come from `src/lib/database.types.ts`, generated from the live
// schema by `supabase gen types typescript --linked`. Re-run that whenever
// the schema changes.

const url = env.PUBLIC_SUPABASE_URL;
const anonKey = env.PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill in values from your Supabase dev project.'
  );
}

export type Db = Database;

export const supabase: SupabaseClient<Database> = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
