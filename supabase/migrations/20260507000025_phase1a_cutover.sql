-- Phase 1A cutover: pin_in_window / effective_windows look up species
-- harvest windows by climate_zone_id instead of region_id. This makes
-- the per-pin climate_zone_id from migration 23 actually drive
-- ripeness predictions, which in turn lets a pin in any USDA zone
-- (Phoenix=9b, Seattle=8b, …) get its species' window if we have one
-- for that zone. Until empirical data lands for new zones (PLAN §5.10),
-- this just preserves Ithaca's behavior — a 5b pin still resolves the
-- same windows as before, but via climate_zone_id rather than region_id.
--
-- region_id stays in species_fruiting_windows for now: dropping it
-- would also invalidate region_seasonal_shifts and the
-- user_fruiting_window_overrides path, both of which are region-keyed
-- by design and still useful (a region admin's "this year ran 2 weeks
-- late in Ithaca" adjustment is region-level, not zone-level).
-- We'll defer the column drop until those callers are migrated.

-- Index on (species_id, climate_zone_id, stage) so the new lookup is
-- as cheap as the old (species_id, region_id) one.
create index if not exists sfw_species_zone_stage_idx
  on public.species_fruiting_windows (species_id, climate_zone_id, stage);

-- New variant: takes climate_zone_id for the species_fruiting_windows
-- filter, keeps region_id for shifts/overrides. Same return shape as
-- the original.
create or replace function public.effective_windows(
  p_species_id      uuid,
  p_region_id       uuid,
  p_climate_zone_id uuid,
  p_user_id         uuid,
  p_year            int,
  p_stage           stage
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
     where w.species_id      = p_species_id
       and w.climate_zone_id = p_climate_zone_id
       and w.stage           = p_stage
       and not exists (select 1 from user_overrides)
  )
  select
    greatest(1, least(366, base.start_doy + shift.offset_days)) as start_doy,
    greatest(1, least(366, base.end_doy   + shift.offset_days)) as end_doy
  from base, shift;
$$;

grant execute on function public.effective_windows(uuid, uuid, uuid, uuid, int, stage)
  to anon, authenticated;

-- Update pin_in_window to look up the pin's climate_zone_id and call
-- the new effective_windows variant. Empirical-observation logic is
-- unchanged (per-pin observations override window predictions).
create or replace function public.pin_in_window(
  p_pin_id      uuid,
  p_stage       stage,
  p_user_id     uuid default null,
  p_target_date date default null,
  p_buffer_days int  default 10
)
returns boolean
language plpgsql
stable
as $$
declare
  pin_row     public.pins%rowtype;
  region_tz   text;
  target      date;
  yr          int;
  target_doy  int;
  emp_min     int;
  emp_max     int;
begin
  select * into pin_row from public.pins where id = p_pin_id;
  if not found or pin_row.species_id is null then
    return false;
  end if;
  -- No climate zone assigned (pin outside the USDA dataset) → can't
  -- consult species_fruiting_windows by zone; return false unless an
  -- empirical observation window exists.
  if pin_row.climate_zone_id is null then
    select
      min(extract(doy from (o.observed_at at time zone coalesce(
        (select timezone from public.regions where id = pin_row.region_id),
        'America/New_York'
      )))::int),
      max(extract(doy from (o.observed_at at time zone coalesce(
        (select timezone from public.regions where id = pin_row.region_id),
        'America/New_York'
      )))::int)
      into emp_min, emp_max
      from public.observations o
     where o.pin_id = p_pin_id
       and o.stage = p_stage
       and (o.quality_rating is null or o.quality_rating > 0);
    if emp_min is not null and emp_max is not null then
      target := coalesce(p_target_date, current_date);
      target_doy := extract(doy from target)::int;
      return target_doy
        between greatest(1, emp_min - p_buffer_days)
        and    least(366, emp_max + p_buffer_days);
    end if;
    return false;
  end if;

  select timezone into region_tz from public.regions where id = pin_row.region_id;
  target := coalesce(p_target_date, (now() at time zone region_tz)::date);
  yr := extract(year from target)::int;
  target_doy := extract(doy from target)::int;

  -- Empirical window from past observations of this stage on this pin.
  select
    min(extract(doy from (o.observed_at at time zone region_tz))::int),
    max(extract(doy from (o.observed_at at time zone region_tz))::int)
    into emp_min, emp_max
    from public.observations o
   where o.pin_id = p_pin_id
     and o.stage = p_stage
     and (o.quality_rating is null or o.quality_rating > 0);

  if emp_min is not null and emp_max is not null then
    return target_doy
      between greatest(1, emp_min - p_buffer_days)
      and    least(366, emp_max + p_buffer_days);
  end if;

  return exists (
    select 1
      from public.effective_windows(
        pin_row.species_id,
        pin_row.region_id,
        pin_row.climate_zone_id,
        coalesce(p_user_id, auth.uid()),
        yr,
        p_stage
      ) w
     where target_doy
       between greatest(1, w.start_doy - p_buffer_days)
       and    least(366, w.end_doy + p_buffer_days)
  );
end;
$$;

grant execute on function public.pin_in_window(uuid, stage, uuid, date, int) to anon, authenticated;

-- The old (species_id, region_id) effective_windows variant is no
-- longer called from pin_in_window. Drop it so callers don't pick it
-- up by accident; they should pass climate_zone_id.
drop function if exists public.effective_windows(uuid, uuid, uuid, int, stage);
