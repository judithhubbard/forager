-- Re-tune the decimation grid to match the on-screen pin-marker
-- size (~12px wide). This is the third pass:
--   migration 50: ~5px grid (40m@z13, 5m@z16) — too coarse, dropped
--                 visible pins
--   migration 52: ~1px grid (10m@z13, 1.25m@z16) — too fine, dense
--                 areas had heavy visual overlap because adjacent
--                 cells' winning pins are smaller-than-marker
--                 distance apart
--   migration 53: ~marker-sized grid — pin markers genuinely don't
--                 overlap visually; zooming in always reveals more
--                 pins (cells split, new winners appear in newly
--                 distinct quadrants); pins shown at lower zoom are
--                 a strict subset of pins shown at higher zoom.
--
-- 1° longitude at Ithaca's 42° latitude ≈ 82km. 1° latitude is
-- always 111km. Grid is in degrees so it's slightly tighter east-
-- west than north-south at higher latitudes — acceptable.
-- Marker visual size at zoom Z (≈42° latitude):
--   z12: ≈360m   z13: ≈180m   z14: ≈90m
--   z15: ≈45m    z16: ≈22m    z17: ≈11m   z18: ≈5.5m

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
      when p_zoom <= 12 then 0.0033          -- ≈360m
      when p_zoom = 13  then 0.0016          -- ≈180m
      when p_zoom = 14  then 0.00081         -- ≈90m
      when p_zoom = 15  then 0.00040         -- ≈45m
      when p_zoom = 16  then 0.00020         -- ≈22m
      when p_zoom = 17  then 0.00010         -- ≈11m
      when p_zoom = 18  then 0.000050        -- ≈5.5m
      else 0.0                               -- zoom 19+: no snap
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
  limit greatest(1, least(p_max_rows, 2500));
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
      when p_zoom <= 12 then 0.0033
      when p_zoom = 13  then 0.0016
      when p_zoom = 14  then 0.00081
      when p_zoom = 15  then 0.00040
      when p_zoom = 16  then 0.00020
      when p_zoom = 17  then 0.00010
      when p_zoom = 18  then 0.000050
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
   limit greatest(1, least(p_max_rows, 2500));
$$;
