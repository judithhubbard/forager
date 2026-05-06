-- Public usernames attached to observations and photos.
--
-- The `profiles` table and a barebones `handle_new_auth_user` trigger
-- already exist (see initial.sql). This migration:
--   1. Adds the `username` column + uniqueness constraint.
--   2. Backfills placeholder usernames for existing rows.
--   3. Replaces the trigger to also populate `username` on signup.
--   4. Replaces the SELECT/UPDATE RLS policies to be permissive enough
--      that any authenticated user can read profiles, and only the
--      owner can update.  (See the audit notes in this PR for why we
--      rejected a strict region-scoped read policy: the correlated
--      subquery would run per-row on every observation feed.)
--   5. Adds a `username_available()` SECURITY DEFINER helper for the UI.
--   6. Updates `v_observation_with_pin` to expose username +
--      display_name so the activity feed and pin detail can show
--      attribution in a single fetch.

-- 1. Add username column. NOT NULL via a placeholder default — the
-- check constraint enforces shape; lowercase regex prevents
-- case-insensitive duplicates from slipping through the unique index.
alter table public.profiles
  add column if not exists username text;

-- 2. Backfill existing rows with placeholders BEFORE making it NOT NULL.
update public.profiles
  set username = 'user_' || substr(replace(id::text, '-', ''), 1, 8)
  where username is null;

alter table public.profiles
  alter column username set not null;

-- Drop and recreate to be idempotent (pre-existing constraints with the
-- same names from re-runs would otherwise fail).
alter table public.profiles
  drop constraint if exists profiles_username_format;
alter table public.profiles
  add constraint profiles_username_format
    check (username ~ '^[a-z0-9_-]{3,20}$');

alter table public.profiles
  drop constraint if exists profiles_display_name_length;
alter table public.profiles
  add constraint profiles_display_name_length
    check (display_name is null or char_length(display_name) between 1 and 40);

create unique index if not exists profiles_username_key on public.profiles (username);

-- 3. Replace the trigger so new auth users get a placeholder username
-- alongside the profile row. Retry on the (extremely unlikely)
-- placeholder collision.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
  attempt int := 0;
begin
  loop
    candidate := 'user_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    begin
      insert into public.profiles (id, username)
        values (new.id, candidate)
        on conflict (id) do update set username = excluded.username
        where public.profiles.username is null;
      exit;
    exception when unique_violation then
      attempt := attempt + 1;
      if attempt >= 5 then raise; end if;
    end;
  end loop;
  return new;
end;
$$;

-- 4. RLS — simple policies. Any authenticated user can SELECT; only
-- the owner can UPDATE.
alter table public.profiles enable row level security;

drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated on public.profiles
  for select
  using (auth.uid() is not null);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Inserts are exclusively from the trigger (security definer) — no
-- client INSERT policy needed.

grant select, update on public.profiles to authenticated;

-- 5. Username availability check — used by the picker UI without
-- requiring SELECT permission to enumerate.
create or replace function public.username_available(candidate text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (
    select 1 from public.profiles where username = lower(candidate)
  );
$$;

grant execute on function public.username_available(text) to authenticated;

-- 6. Update v_observation_with_pin to expose attribution.
create or replace view public.v_observation_with_pin as
  select
    o.id,
    o.pin_id,
    o.user_id,
    o.observed_at,
    o.stage,
    o.quality_rating,
    o.quality_notes,
    o.created_at,
    p.region_id            as pin_region_id,
    p.display_name         as pin_display_name,
    p.status               as pin_status,
    s.id                   as species_id,
    s.common_name          as species_common_name,
    s.scientific_name      as species_scientific_name,
    pr.username            as user_username,
    pr.display_name        as user_display_name
  from public.observations o
  join public.pins p           on p.id = o.pin_id
  left join public.species s   on s.id = p.species_id
  left join public.profiles pr on pr.id = o.user_id;

grant select on public.v_observation_with_pin to authenticated, anon;
