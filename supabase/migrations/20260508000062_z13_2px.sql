-- Bump z13 cell from 1px to 2px so Toronto-scale dense viewports
-- (12k pins post-dedup, taxing for canvas to pan smoothly) drop
-- another ~25-30% of pins. At 2px the marker (12px) overlap is
-- 10/12 = 83% — only a sliver of the bottom pin's color is
-- visible. "Essentially obscured" rather than "fully obscured."
-- Other zooms keep the strict 1px rule.

create or replace function public.public_pins_bbox(
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision,
  p_max_rows int default 500,
  p_zoom int default 18
)
returns setof public.v_pin_effective
language sql
stable
security definer
set search_path = public
as $$
  with cell_size as (
    select case
      when p_zoom <= 12 then 0.0005           -- ≈55m, 2px@z12
      when p_zoom = 13  then 0.000252         -- 2px@z13 (≈28m)
      when p_zoom = 14  then 0.0000673        -- 1px@z14
      when p_zoom = 15  then 0.0000332
      when p_zoom = 16  then 0.0000166
      when p_zoom = 17  then 0.0000084
      else 0.0
    end as deg
  ),
  candidates as (
    select p.*,
           cz.code as climate_zone_code,
           case when cs.deg = 0
                then ST_AsText(p.location::geometry)
                else ST_AsText(ST_SnapToGrid(p.location::geometry, cs.deg, cs.deg))
           end as grid_cell
      from public.pins p
      cross join cell_size cs
      left join public.climate_zones cz on cz.id = p.climate_zone_id
     where p.visibility = 'public'
       and p.location && ST_MakeEnvelope(
             p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326
           )
  ),
  picked as (
    select distinct on (grid_cell) *
      from candidates
     order by grid_cell, hashtextextended(id::text, 0)
  )
  select
    id, region_id, created_by, created_at, updated_at,
    species_id, display_name, location_accuracy_m,
    location_modified_by_user_at, status, notes,
    import_source, import_external_id,
    last_observed_at, last_observed_stage,
    visibility, access_status,
    status                     as effective_status,
    'America/New_York'::text   as region_timezone,
    false                      as is_edible_now,
    false                      as is_edible_strict,
    ST_X(location::geometry)   as lng,
    ST_Y(location::geometry)   as lat,
    false                      as is_inaccessible,
    false                      as has_ripe_observation_this_year,
    has_ripe_observation_ever  as has_ripe_observation_ever,
    null::int                  as best_harvest_quality,
    climate_zone_code
  from picked
  order by hashtextextended(id::text, 0)
  limit greatest(1, least(p_max_rows, 15000));
$$;

create or replace function public.region_pins_bbox(
  p_region_id uuid,
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision,
  p_max_rows int default 1000,
  p_zoom int default 18
)
returns setof public.v_pin_effective
language sql
stable
security invoker
as $$
  with cell_size as (
    select case
      when p_zoom <= 12 then 0.0005
      when p_zoom = 13  then 0.000252
      when p_zoom = 14  then 0.0000673
      when p_zoom = 15  then 0.0000332
      when p_zoom = 16  then 0.0000166
      when p_zoom = 17  then 0.0000084
      else 0.0
    end as deg
  ),
  candidates as (
    select v.*,
           case when cs.deg = 0
                then ST_AsText(ST_SetSRID(ST_MakePoint(v.lng, v.lat), 4326))
                else ST_AsText(ST_SnapToGrid(
                       ST_SetSRID(ST_MakePoint(v.lng, v.lat), 4326),
                       cs.deg, cs.deg))
           end as grid_cell
      from public.v_pin_effective v
      cross join cell_size cs
     where v.region_id = p_region_id
       and v.visibility <> 'public'
       and v.lng between p_min_lng and p_max_lng
       and v.lat between p_min_lat and p_max_lat
  ),
  picked as (
    select distinct on (grid_cell) *
      from candidates
     order by grid_cell, hashtextextended(id::text, 0)
  )
  select picked.id, picked.region_id, picked.created_by, picked.created_at,
         picked.updated_at, picked.species_id, picked.display_name,
         picked.location_accuracy_m, picked.location_modified_by_user_at,
         picked.status, picked.notes, picked.import_source,
         picked.import_external_id, picked.last_observed_at,
         picked.last_observed_stage, picked.visibility, picked.access_status,
         picked.effective_status, picked.region_timezone, picked.is_edible_now,
         picked.is_edible_strict, picked.lng, picked.lat, picked.is_inaccessible,
         picked.has_ripe_observation_this_year, picked.has_ripe_observation_ever,
         picked.best_harvest_quality, picked.climate_zone_code
    from picked
   order by hashtextextended(picked.id::text, 0)
   limit greatest(1, least(p_max_rows, 15000));
$$;
