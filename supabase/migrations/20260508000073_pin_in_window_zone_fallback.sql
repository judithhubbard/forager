-- pin_in_window: when a pin's stored climate_zone_id is null, derive
-- it on the fly from coordinates via zone_for_point() instead of
-- giving up. Decouples the harvest-window estimator from the 1.3M-row
-- backfill that's been blocked by Supabase's 2-min statement timeout.
--
-- Cost per call: one GIST lookup against usda_hardiness_zones — same
-- as the trigger does on insert. Sub-millisecond on the indexed table.
-- For pins that DO have climate_zone_id stored (~556k US pins from the
-- earlier recompute), behavior is unchanged — the fallback only fires
-- when the column is null.

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
  derived_zc  text;
  derived_zid uuid;
begin
  select * into pin_row from public.pins where id = p_pin_id;
  if not found or pin_row.species_id is null then
    return false;
  end if;

  -- If the stored climate_zone_id is null, try to derive it from the
  -- pin's coordinates. Cheap (single GIST lookup) and only fires for
  -- the pins the bulk backfill hasn't covered yet.
  if pin_row.climate_zone_id is null then
    derived_zc := public.zone_for_point(
      ST_X(pin_row.location::geometry),
      ST_Y(pin_row.location::geometry)
    );
    if derived_zc is not null then
      select id into derived_zid
        from public.climate_zones where code = derived_zc limit 1;
      pin_row.climate_zone_id := derived_zid;
    end if;
  end if;

  -- Still null (truly outside any polygon — Mexico / Hawaii / parts
  -- of Alaska) → empirical-only fallback.
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
