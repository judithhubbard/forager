-- Per-item visibility for pins, observations, photos, and hazards.
--
-- Until now, every region member could see every pin in the region.
-- This migration introduces a 'shared' / 'private' axis so users can
-- keep individual spots (mushroom patches, neighbors' yards, etc.)
-- secret while still contributing the rest of their pins to the
-- group.
--
-- Design notes:
--   * `pins.visibility` is the source of truth. Photos, hazards, and
--     observations on a private pin are always invisible to other
--     users — there's no scenario where you'd want to see a hazard
--     for a pin you can't see.
--   * Observations and photos also carry their own `visibility` flag
--     so a user can post a private note on an otherwise-shared pin
--     ("I tend to find them on the north side"). Effective visibility
--     of an observation/photo = min(pin.visibility, item.visibility).
--   * `regions.default_pin_visibility` lets a region creator set
--     'shared' (community-oriented) or 'private' (personal-oriented)
--     as the default for new pins. Members can still flip per-pin.

-- ============================================================
-- 1. Schema additions
-- ============================================================

alter table public.pins
  add column if not exists visibility text not null default 'shared';
alter table public.pins
  drop constraint if exists pins_visibility_check;
alter table public.pins
  add constraint pins_visibility_check
  check (visibility in ('shared', 'private'));

alter table public.observations
  add column if not exists visibility text not null default 'shared';
alter table public.observations
  drop constraint if exists observations_visibility_check;
alter table public.observations
  add constraint observations_visibility_check
  check (visibility in ('shared', 'private'));

alter table public.photos
  add column if not exists visibility text not null default 'shared';
alter table public.photos
  drop constraint if exists photos_visibility_check;
alter table public.photos
  add constraint photos_visibility_check
  check (visibility in ('shared', 'private'));

alter table public.hazards
  add column if not exists visibility text not null default 'shared';
alter table public.hazards
  drop constraint if exists hazards_visibility_check;
alter table public.hazards
  add constraint hazards_visibility_check
  check (visibility in ('shared', 'private'));

alter table public.regions
  add column if not exists default_pin_visibility text not null default 'shared';
alter table public.regions
  drop constraint if exists regions_default_pin_visibility_check;
alter table public.regions
  add constraint regions_default_pin_visibility_check
  check (default_pin_visibility in ('shared', 'private'));

-- ============================================================
-- 2. Helper: is a pin visible to a given user?
--
-- Encapsulates the "you can see it if (a) you own it, or (b) it's
-- shared and you're a member of its region" rule. Used by photos,
-- hazards, and observations whose visibility chains through the pin.
-- ============================================================

create or replace function public.pin_visible_to(uid uuid, pid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pins p
    where p.id = pid
      and (
        p.created_by = uid
        or (
          p.visibility = 'shared'
          and public.is_region_member(uid, p.region_id)
        )
      )
  );
$$;
grant execute on function public.pin_visible_to(uuid, uuid) to authenticated;

-- ============================================================
-- 3. RLS — pins
-- ============================================================

drop policy if exists pins_select_member on public.pins;
create policy pins_select_member on public.pins
  for select
  to authenticated
  using (
    public.is_region_member(auth.uid(), region_id)
    and (
      visibility = 'shared'
      or created_by = auth.uid()
    )
  );

-- ============================================================
-- 4. RLS — observations, photos, hazards
--
-- All three chain off the parent pin's visibility via pin_visible_to.
-- Their own visibility flag adds an extra layer for items the user
-- wants to keep private even on a shared pin.
-- ============================================================

drop policy if exists observations_select_member on public.observations;
create policy observations_select_member on public.observations
  for select
  to authenticated
  using (
    public.pin_visible_to(auth.uid(), pin_id)
    and (
      visibility = 'shared'
      or user_id = auth.uid()
    )
  );

drop policy if exists photos_select_member on public.photos;
create policy photos_select_member on public.photos
  for select
  to authenticated
  using (
    public.pin_visible_to(auth.uid(), pin_id)
    and (
      visibility = 'shared'
      or user_id = auth.uid()
    )
  );

drop policy if exists hazards_select_member on public.hazards;
create policy hazards_select_member on public.hazards
  for select
  to authenticated
  using (
    public.pin_visible_to(auth.uid(), pin_id)
    and (
      visibility = 'shared'
      or user_id = auth.uid()
    )
  );

-- ============================================================
-- 5. Notes
--
-- - INSERT / UPDATE / DELETE policies don't need changes: only the
--   owner or admin can modify, regardless of visibility.
-- - The existing v_pin_effective and v_observation_with_pin views
--   already have security_invoker = on, so they inherit the new
--   visibility filters automatically.
-- ============================================================
