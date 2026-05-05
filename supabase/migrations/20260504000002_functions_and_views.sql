-- Forager: pure logic in Postgres (per PLAN §10 C20).
-- Centralizes window resolution, region membership, and pin status auto-degrade.
-- Client UI reads from views/functions; raw rows are admin/debug only.

-- ============================================================
-- is_region_member(uid, rid) -> boolean
--   Used extensively in RLS policies. SECURITY DEFINER so it
--   sidesteps RLS on region_memberships (which would otherwise
--   create a circular dependency with the very policies that
--   depend on it).
-- ============================================================

create or replace function public.is_region_member(uid uuid, rid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.region_memberships m
    where m.user_id = uid and m.region_id = rid
  );
$$;

create or replace function public.is_region_admin(uid uuid, rid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.region_memberships m
    where m.user_id = uid and m.region_id = rid and m.role = 'admin'
  );
$$;

-- ============================================================
-- effective_status(p) -> pin_status
--   Computes the auto-degraded status: an active pin whose last
--   observation is older than 4 years is treated as
--   needs_verification. The stored `status` is preserved.
-- ============================================================

create or replace function public.effective_status(p public.pins)
returns pin_status
language sql
stable
as $$
  select case
    when p.status = 'active'
      and (p.last_observed_at is null or p.last_observed_at < now() - interval '4 years')
    then 'needs_verification'::pin_status
    else p.status
  end;
$$;

-- ============================================================
-- today_doy_in_region(region_id) -> int
--   "Today" in the region's timezone (PLAN §B10).
-- ============================================================

create or replace function public.today_doy_in_region(rid uuid)
returns int
language sql
stable
as $$
  select extract(doy from (now() at time zone r.timezone))::int
  from public.regions r
  where r.id = rid;
$$;

-- ============================================================
-- effective_windows(species, region, viewing_user, year, stage)
--   Returns rows of (start_doy, end_doy) for the resolved windows.
--   Multiple rows = multi-cycle (e.g. everbearing raspberry).
--
--   Resolution order (PLAN §3.3):
--     1. effective_default = user_override(species, region, stage)
--                            ?? region_default(species, region, stage)
--     2. + RegionSeasonalShift.offset_days for the year
--
--   Note: viewing_user may be NULL (skips override layer).
-- ============================================================

create or replace function public.effective_windows(
  p_species_id uuid,
  p_region_id  uuid,
  p_user_id    uuid,
  p_year       int,
  p_stage      stage
)
returns table (start_doy int, end_doy int)
language sql
stable
as $$
  with shift as (
    select coalesce(
      (select offset_days from public.region_seasonal_shifts
        where region_id = p_region_id and year = p_year),
      0
    ) as offset_days
  ),
  user_overrides as (
    select start_doy, end_doy
      from public.user_fruiting_window_overrides
     where p_user_id is not null
       and user_id    = p_user_id
       and species_id = p_species_id
       and region_id  = p_region_id
       and stage      = p_stage
  ),
  base as (
    select start_doy, end_doy from user_overrides
    union all
    select w.start_doy, w.end_doy
      from public.species_fruiting_windows w
     where w.species_id = p_species_id
       and w.region_id  = p_region_id
       and w.stage      = p_stage
       and not exists (select 1 from user_overrides)
  )
  select
    -- Wrap into [1, 366] after shift; clamp rather than wrap year boundaries
    -- (the rare species fruiting in Dec/Jan should be handled with two windows).
    greatest(1,   least(366, base.start_doy + shift.offset_days)) as start_doy,
    greatest(1,   least(366, base.end_doy   + shift.offset_days)) as end_doy
  from base, shift;
$$;

-- ============================================================
-- pin_in_window(pin_id, stage, viewing_user, target_date) -> bool
--   True iff target_date's DOY (in the region's timezone) lies
--   within any of the effective stage windows for the pin's
--   species in the pin's region for that target's year.
--
--   target_date defaults to today; viewing_user defaults to
--   auth.uid().
-- ============================================================

create or replace function public.pin_in_window(
  p_pin_id uuid,
  p_stage  stage,
  p_user_id uuid default null,
  p_target_date date default null
)
returns boolean
language plpgsql
stable
as $$
declare
  pin_row   public.pins%rowtype;
  region_tz text;
  target    date;
  yr        int;
  target_doy int;
  match     boolean;
begin
  select * into pin_row from public.pins where id = p_pin_id;
  if not found or pin_row.species_id is null then
    return false;
  end if;

  select timezone into region_tz from public.regions where id = pin_row.region_id;
  target := coalesce(p_target_date, (now() at time zone region_tz)::date);
  yr     := extract(year from target)::int;
  target_doy := extract(doy from target)::int;

  select exists (
    select 1
      from public.effective_windows(
        pin_row.species_id,
        pin_row.region_id,
        coalesce(p_user_id, auth.uid()),
        yr,
        p_stage
      ) w
     where target_doy between w.start_doy and w.end_doy
  ) into match;

  return match;
end;
$$;

-- ============================================================
-- v_pin_effective
--   Pins enriched with computed status, region timezone, and a
--   convenience boolean for "ripe now today" using auth.uid()'s
--   overrides. UI should read this view, not the raw pins table.
-- ============================================================

create or replace view public.v_pin_effective as
  select
    p.*,
    public.effective_status(p)                             as effective_status,
    r.timezone                                             as region_timezone,
    public.pin_in_window(p.id, 'ripe'::stage)              as is_ripe_now
  from public.pins p
  join public.regions r on r.id = p.region_id;

-- The view inherits RLS from the underlying tables, so members of
-- a region see only their region's pins through this view too.
