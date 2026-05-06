-- Phase 1B: persisted per-user species preferences. Replaces the
-- in-memory selectedSpeciesIds set in +page.svelte that was lost
-- on every reload.
--
-- Semantics:
--   - Zero rows for a user → ALL species are enabled (back-compat
--     for existing users; matches today's default behavior).
--   - Any rows present → only species with enabled=true are visible.
--     This means turning the first species "off" upserts a row for
--     every other species set to true (so the "show all" default
--     doesn't bleed through). The store handles this materialize-on-
--     first-disable pattern client-side.
--
-- A single row per (user, species). Owner-only RLS — preferences are
-- never shared.

create table public.user_species_preferences (
  user_id    uuid not null references auth.users(id) on delete cascade,
  species_id uuid not null references public.species(id) on delete cascade,
  enabled    boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, species_id)
);

create index user_species_preferences_user_idx
  on public.user_species_preferences (user_id)
  where enabled = false;

alter table public.user_species_preferences enable row level security;

create policy "user_species_prefs_self_select"
  on public.user_species_preferences for select
  to authenticated
  using (user_id = auth.uid());

create policy "user_species_prefs_self_insert"
  on public.user_species_preferences for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "user_species_prefs_self_update"
  on public.user_species_preferences for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "user_species_prefs_self_delete"
  on public.user_species_preferences for delete
  to authenticated
  using (user_id = auth.uid());

-- Convenience view: each user paired with the species_ids they have
-- explicitly enabled. Useful if other features want to scope queries
-- by the active set without materializing it client-side. Not used
-- yet, but cheap to define.
create or replace view public.v_user_active_species
  with (security_invoker = on)
  as
  select user_id, species_id
    from public.user_species_preferences
    where enabled = true;
