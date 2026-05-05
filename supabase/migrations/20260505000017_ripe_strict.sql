-- pin_in_window gets a buffer parameter so callers can ask for either:
--   - 10 day buffer (default) — "possibly ripe today"
--   - 0 day buffer (strict)   — "ripe today, in the predicted window"
-- v_pin_effective now exposes both: is_ripe_now (buffered) and
-- is_ripe_strict (no buffer) so the map can render distinct symbols.

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
    return target_doy
      between greatest(1, emp_min - p_buffer_days)
      and    least(366, emp_max + p_buffer_days);
  end if;

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
       between greatest(1, w.start_doy - p_buffer_days)
       and    least(366, w.end_doy + p_buffer_days)
  );
end;
$$;

grant execute on function public.pin_in_window(uuid, stage, uuid, date, int) to anon, authenticated;

drop view if exists public.v_pin_effective;

create or replace view public.v_pin_effective as
  select
    p.id,
    p.region_id,
    p.created_by,
    p.created_at,
    p.updated_at,
    p.species_id,
    p.display_name,
    p.location_accuracy_m,
    p.location_modified_by_user_at,
    p.status,
    p.notes,
    p.import_source,
    p.import_external_id,
    p.import_raw,
    p.last_observed_at,
    p.last_observed_stage,
    public.effective_status(p)                                     as effective_status,
    r.timezone                                                     as region_timezone,
    public.pin_in_window(p.id, 'ripe'::stage, null, null, 10)      as is_ripe_now,
    public.pin_in_window(p.id, 'ripe'::stage, null, null, 0)       as is_ripe_strict,
    ST_X(p.location::geometry)                                     as lng,
    ST_Y(p.location::geometry)                                     as lat,
    exists (
      select 1 from public.hazards h
      where h.pin_id = p.id
        and h.hazard_type in ('inaccessible'::hazard_type,
                              'out_of_reach'::hazard_type,
                              'fenced'::hazard_type,
                              'private_property'::hazard_type)
    ) as is_inaccessible,
    exists (
      select 1 from public.observations o
      where o.pin_id = p.id
        and o.stage = 'ripe'::stage
        and (o.quality_rating is null or o.quality_rating > 0)
        and extract(year from (o.observed_at at time zone r.timezone))
          = extract(year from (now() at time zone r.timezone))
    ) as has_ripe_observation_this_year,
    exists (
      select 1 from public.observations o
      where o.pin_id = p.id
        and o.stage = 'ripe'::stage
        and (o.quality_rating is null or o.quality_rating > 0)
    ) as has_ripe_observation_ever,
    (
      select max(o.quality_rating) from public.observations o
       where o.pin_id = p.id
         and o.stage = 'ripe'::stage
         and o.quality_rating is not null
         and o.quality_rating > 0
    ) as best_harvest_quality
  from public.pins p
  join public.regions r on r.id = p.region_id;

grant select on public.v_pin_effective to authenticated, anon;
