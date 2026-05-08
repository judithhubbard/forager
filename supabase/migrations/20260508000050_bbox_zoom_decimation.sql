-- Zoom-aware spatial decimation for the bbox RPCs. Replaces the
-- pseudo-random hash sample (migration 47) which fixed the
-- newest-first geographic gap but still showed misleading detail
-- across zoom levels: the user would zoom in and suddenly see
-- many more trees in the SAME area, when those trees were always
-- there but the cap had silently dropped them.
--
-- New behavior: at each zoom level, snap each pin's location to a
-- grid whose cell size matches roughly the on-screen size of the
-- pin at that zoom (≈5m on a side). DISTINCT ON (grid_cell) keeps
-- one pin per cell — guaranteeing no two pins overlap on screen.
-- Zooming reveals more cells, so more pins, intuitively. The
-- bboxSummary RPC always shows the TRUE total so the user knows
-- how many trees actually exist in the viewport, even when the
-- visible markers are decimated.
--
-- Cell size at each zoom (degrees ≈ meters / 111320):
--   zoom 13: 0.00036° (≈40m)
--   zoom 14: 0.00018° (≈20m)
--   zoom 15: 0.00009° (≈10m)
--   zoom 16: 0.000045° (≈5m)
--   zoom 17: 0.0000225° (≈2.5m)
--   zoom 18+: 0 (no decimation; return every pin)
--
-- The "best" pin per cell is picked by a stable hash of the id —
-- spatially uniform within each cell but no preference for any
-- particular import. Future improvement (task #50): prefer pins
-- with observations / higher harvest_quality so a represented
-- pin is one a user is likely to want.

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
      when p_zoom <= 12 then 0.00072       -- ≈80m
      when p_zoom = 13  then 0.00036       -- ≈40m
      when p_zoom = 14  then 0.00018       -- ≈20m
      when p_zoom = 15  then 0.00009       -- ≈10m
      when p_zoom = 16  then 0.000045      -- ≈5m
      when p_zoom = 17  then 0.0000225     -- ≈2.5m
      else 0.0                             -- zoom 18+: no snap
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
      when p_zoom <= 12 then 0.00072
      when p_zoom = 13  then 0.00036
      when p_zoom = 14  then 0.00018
      when p_zoom = 15  then 0.00009
      when p_zoom = 16  then 0.000045
      when p_zoom = 17  then 0.0000225
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

grant execute on function public.region_pins_bbox(
  uuid, double precision, double precision, double precision, double precision, int, int
) to authenticated;
