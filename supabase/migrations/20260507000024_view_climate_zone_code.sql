-- Surface the pin's climate-zone code (e.g. '7b') on v_pin_effective
-- so the pin detail UI can show "Zone 7b" without a second fetch.
-- Joins via pins.climate_zone_id (added in migration 23) → climate_zones
-- via id, so a left join keeps pins outside the USDA dataset
-- (Toronto, Alaska, Hawaii) showing as null.
--
-- Append-only: new column lands at the end of the select list, the
-- existing column order doesn't change. The slim public_pins_bbox
-- from migration 19/21 also needs the trailing column or it'll
-- fail the return-type check; updated below.

create or replace view public.v_pin_effective
  with (security_invoker = on)
  as
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
    p.visibility,
    p.access_status,
    public.effective_status(p)                                     as effective_status,
    r.timezone                                                     as region_timezone,
    public.pin_in_window(p.id, 'ripe'::stage, null, null, 10)      as is_ripe_now,
    public.pin_in_window(p.id, 'ripe'::stage, null, null, 0)       as is_ripe_strict,
    ST_X(p.location::geometry)                                     as lng,
    ST_Y(p.location::geometry)                                     as lat,
    (
      p.access_status in (
        'private_no_permission'::access_status,
        'fenced'::access_status,
        'dangerous_access'::access_status
      )
      or exists (
        select 1 from public.hazards h
        where h.pin_id = p.id
          and h.hazard_type in (
            'inaccessible'::hazard_type,
            'out_of_reach'::hazard_type,
            'fenced'::hazard_type,
            'private_property'::hazard_type
          )
      )
    ) as is_inaccessible,
    exists (
      select 1 from public.observations o
      where o.pin_id = p.id
        and o.stage = 'ripe'::stage
        and (o.quality_rating is null or o.quality_rating > 0)
        and extract(year from (o.observed_at at time zone r.timezone))
          = extract(year from (now() at time zone r.timezone))
    ) as has_ripe_observation_this_year,
    -- Now reads from the precomputed column (migration 21) instead of
    -- a per-row EXISTS subquery; cheap.
    p.has_ripe_observation_ever,
    (
      select max(o.quality_rating) from public.observations o
       where o.pin_id = p.id
         and o.stage = 'ripe'::stage
         and o.quality_rating is not null
         and o.quality_rating > 0
    ) as best_harvest_quality,
    cz.code as climate_zone_code
  from public.pins p
  join public.regions r on r.id = p.region_id
  left join public.climate_zones cz on cz.id = p.climate_zone_id;

grant select on public.v_pin_effective to authenticated, anon;

-- Update the slim public_pins_bbox to match the new view shape.
-- Same SECURITY DEFINER + cheap fields trick from migration 19/21.
create or replace function public.public_pins_bbox(
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision,
  p_max_rows int default 500
)
returns setof public.v_pin_effective
language sql
stable
security definer
set search_path = public
as $$
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
    p.visibility,
    p.access_status,
    p.status                             as effective_status,
    'America/New_York'::text             as region_timezone,
    false                                as is_ripe_now,
    false                                as is_ripe_strict,
    ST_X(p.location::geometry)           as lng,
    ST_Y(p.location::geometry)           as lat,
    false                                as is_inaccessible,
    false                                as has_ripe_observation_this_year,
    p.has_ripe_observation_ever          as has_ripe_observation_ever,
    null::int                            as best_harvest_quality,
    cz.code                              as climate_zone_code
    from public.pins p
    left join public.climate_zones cz on cz.id = p.climate_zone_id
   where p.visibility = 'public'
     and p.location && ST_MakeEnvelope(
           p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326
         )
   order by p.created_at desc
   limit greatest(1, least(p_max_rows, 1000));
$$;

grant execute on function public.public_pins_bbox(
  double precision, double precision, double precision, double precision, int
) to anon, authenticated;
