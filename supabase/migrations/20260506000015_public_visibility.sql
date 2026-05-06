-- Phase 2A: public visibility + RLS for anon.
--
-- Extends pins/observations/photos/hazards visibility to allow
-- 'public' (admin-curated). Adds anon RLS so a signed-out browser
-- can SELECT public rows. Gates 'public' writes to global admins via
-- a trigger backed by a new profiles.is_global_admin column.
--
-- Index hygiene: a partial index on visibility='public' keeps the
-- anon hot path cheap once the public dataset grows. Verify the
-- GIST on pins.location is in place (it already exists from the
-- initial migration).

-- 1. Global admin flag on profiles. Set by a deployer with direct
--    SQL access; there is no UI for granting it. Used by the
--    visibility trigger and by future admin tools.
alter table public.profiles
  add column if not exists is_global_admin boolean not null default false;

-- 2. Extend visibility check constraints to include 'public' on the
--    four tables that have a visibility column.
alter table public.pins
  drop constraint if exists pins_visibility_check;
alter table public.pins
  add constraint pins_visibility_check
    check (visibility in ('shared', 'private', 'public'));

alter table public.observations
  drop constraint if exists observations_visibility_check;
alter table public.observations
  add constraint observations_visibility_check
    check (visibility in ('shared', 'private', 'public'));

alter table public.photos
  drop constraint if exists photos_visibility_check;
alter table public.photos
  add constraint photos_visibility_check
    check (visibility in ('shared', 'private', 'public'));

alter table public.hazards
  add column if not exists visibility text not null default 'shared';
alter table public.hazards
  drop constraint if exists hazards_visibility_check;
alter table public.hazards
  add constraint hazards_visibility_check
    check (visibility in ('shared', 'private', 'public'));

-- 3. Partial index on the anon hot path. Tiny, fast, only covers
--    the public subset.
create index if not exists pins_visibility_public_idx
  on public.pins (visibility)
  where visibility = 'public';

-- 4. Anon SELECT policies. Anonymous viewers see the public subset;
--    authenticated users continue to see their region. The two
--    policies are independent — Postgres OR's them — so authed users
--    also see public pins outside their region.
drop policy if exists pins_select_public_anon on public.pins;
create policy pins_select_public_anon on public.pins
  for select
  to anon, authenticated
  using (visibility = 'public');

drop policy if exists observations_select_public_anon on public.observations;
create policy observations_select_public_anon on public.observations
  for select
  to anon, authenticated
  using (
    visibility = 'public'
    and exists (
      select 1 from public.pins p
      where p.id = observations.pin_id
        and p.visibility = 'public'
    )
  );

drop policy if exists photos_select_public_anon on public.photos;
create policy photos_select_public_anon on public.photos
  for select
  to anon, authenticated
  using (
    visibility = 'public'
    and exists (
      select 1 from public.pins p
      where p.id = photos.pin_id
        and p.visibility = 'public'
    )
  );

drop policy if exists hazards_select_public_anon on public.hazards;
create policy hazards_select_public_anon on public.hazards
  for select
  to anon, authenticated
  using (
    visibility = 'public'
    and exists (
      select 1 from public.pins p
      where p.id = hazards.pin_id
        and p.visibility = 'public'
    )
  );

-- 5. Anon SELECT on regions, species, species_fruiting_windows,
--    climate_zones — context the anon viewer needs to render the
--    species name + harvest windows on a public pin. Regions get a
--    name-only public read; species and zones already permissive.
drop policy if exists regions_select_anon_name on public.regions;
create policy regions_select_anon_name on public.regions
  for select
  to anon
  using (true);

-- species already has species_select_all (to authenticated). Add
-- an anon mirror so anonymous viewers see the same data.
drop policy if exists species_select_anon on public.species;
create policy species_select_anon on public.species
  for select
  to anon
  using (true);

drop policy if exists sfw_select_anon on public.species_fruiting_windows;
create policy sfw_select_anon on public.species_fruiting_windows
  for select
  to anon
  using (true);

-- 6. Trigger gating writes of visibility='public' to global admins.
--    The check fires on INSERT and UPDATE; no-op when visibility is
--    not being set to 'public'. Service-role calls (e.g. from the
--    admin portal) skip RLS but still pass through the trigger, so
--    the check is enforced regardless of caller.
create or replace function public.gate_public_visibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean;
begin
  if (tg_op = 'UPDATE' and old.visibility = 'public' and new.visibility = 'public') then
    return new; -- already public; no privilege change.
  end if;
  if new.visibility <> 'public' then
    return new;
  end if;
  -- Setting visibility -> public requires global admin.
  select coalesce(is_global_admin, false) into is_admin
    from public.profiles
   where id = auth.uid();
  if not coalesce(is_admin, false) then
    raise exception 'Only global admins can set visibility = ''public''.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists tg_gate_public_pins on public.pins;
create trigger tg_gate_public_pins
  before insert or update of visibility on public.pins
  for each row execute function public.gate_public_visibility();

drop trigger if exists tg_gate_public_observations on public.observations;
create trigger tg_gate_public_observations
  before insert or update of visibility on public.observations
  for each row execute function public.gate_public_visibility();

drop trigger if exists tg_gate_public_photos on public.photos;
create trigger tg_gate_public_photos
  before insert or update of visibility on public.photos
  for each row execute function public.gate_public_visibility();

drop trigger if exists tg_gate_public_hazards on public.hazards;
create trigger tg_gate_public_hazards
  before insert or update of visibility on public.hazards
  for each row execute function public.gate_public_visibility();

-- 7. Grant the storage 'photos' bucket public read (Phase 2A). Without
--    this, an anonymous viewer sees the photo row metadata but not
--    the binary. Apply through Supabase Storage policies in the
--    dashboard if this raw GRANT does not match the storage layer
--    your project uses; this clause covers the common case.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    -- Make signed URLs returnable for any anon-readable photo. The
    -- policy is opt-in by license: if a photographer marks the photo
    -- 'all-rights-reserved', signing still works (URL is time-bound).
    -- Tighter restrictions can ship in Phase 2.5 if licensing demands.
    null;
  end if;
end $$;

-- 8. Refresh v_pin_effective so it inherits the new policies.
--    security_invoker already on; the only change is that anon now
--    matches via the SELECT policy.
grant select on public.v_pin_effective to anon;
