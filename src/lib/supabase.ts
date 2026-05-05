import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';

// The single Supabase client instance for the app.
// IMPORTANT: per PLAN §10 C18, this is the ONLY module that exports a raw
// client. All Supabase queries go through `src/lib/services/*.ts` modules,
// which provide domain-typed wrappers. Components must not import this file
// directly — they import the relevant service.
//
// Database<T> typing will be added in Phase 1 once `supabase gen types` runs.
//
// We use $env/dynamic/public (not /static/) so the scaffold type-checks even
// without a committed .env file. Real values come from .env.local in dev and
// GitHub Actions secrets in prod.

const url = env.PUBLIC_SUPABASE_URL;
const anonKey = env.PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill in values from your Supabase dev project.'
  );
}

export const supabase: SupabaseClient = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
