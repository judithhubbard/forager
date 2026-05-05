-- Two phenology improvements:
--
--   1. Empirical refinement — if a pin has past observations of the
--      target stage, use the min/max DOY of those observations as the
--      pin-specific window (overrides the species default for that pin).
--      Excludes 'no harvest' (quality_rating = 0) observations.
--
--   2. ±10 day buffer applied to whichever window we use, so a tree
--      predicted ripe DOY 175–195 also reads as "possibly ripe" from
--      DOY 165–205. Captures species-level prediction uncertainty.
--
-- Affects: pin_in_window(), and therefore is_ripe_now in v_pin_effective
-- and the 'Possibly ripe today' map filter.

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
  pin_row     public.pins%rowtype;
  region_tz   text;
  target      date;
  yr          int;
  target_doy  int;
  buffer_days constant int := 10;
  emp_min     int;
  emp_max     int;
begin
  select * into pin_row from public.pins where id = p_pin_id;
  if not found or pin_row.species_id is null then
    return false;
  end if;

  select timezone into region_tz from public.regions where id = pin_row.region_id;
  target := coalesce(p_target_date, (now() at time zone region_tz)::date);
  yr := extract(year from target)::int;
  target_doy := extract(doy from target)::int;

  -- Empirical window from past observations of this stage on this pin.
  -- Skip 'no harvest' (quality 0) observations.
  select
    min(extract(doy from (o.observed_at at time zone region_tz))::int),
    max(extract(doy from (o.observed_at at time zone region_tz))::int)
    into emp_min, emp_max
    from public.observations o
   where o.pin_id = p_pin_id
     and o.stage = p_stage
     and (o.quality_rating is null or o.quality_rating > 0);

  if emp_min is not null and emp_max is not null then
    -- Use the empirical window with ±buffer when we have history for it.
    return target_doy
      between greatest(1, emp_min - buffer_days)
      and    least(366, emp_max + buffer_days);
  end if;

  -- Otherwise fall back to species/region window (with seasonal shift +
  -- user override) widened by ±buffer.
  return exists (
    select 1
      from public.effective_windows(
        pin_row.species_id,
        pin_row.region_id,
        coalesce(p_user_id, auth.uid()),
        yr,
        p_stage
      ) w
     where target_doy
       between greatest(1, w.start_doy - buffer_days)
       and    least(366, w.end_doy + buffer_days)
  );
end;
$$;
