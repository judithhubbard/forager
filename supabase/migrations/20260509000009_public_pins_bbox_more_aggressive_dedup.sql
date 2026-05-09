-- public_pins_bbox: more aggressive grid decimation at z13/z14 to keep
-- the post-decimation row count manageable on city-wide bboxes.
--
-- After mig 08 dropped the per-row pin_is_edible_now calls, the
-- bottleneck moved to row volume. At z13 over Hamilton the function
-- returned 7,406 rows with p90 fetch ~3.8 s — close to the anon
-- timeout. Making the grid coarser at z13/z14 cuts the row count
-- without losing visual fidelity (at z13 pins are tiny anyway; at
-- z14 individual trees stay visible).
--
-- z13: 0.000378° → 0.00060°  (≈42m → 67m equator; ~50m at lat 43)
-- z14: 0.000135° → 0.00025°  (≈15m → 28m equator; ~21m at lat 43)
-- z15+: unchanged (no dedup)
--
-- Expected row-count drops: ~2.5x at z13, ~3x at z14.

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
      when p_zoom <= 12 then 0.00075      -- ≈83m, 3px@z12 (unchanged)
      when p_zoom = 13  then 0.00060      -- ≈67m equator, 50m at lat 43
      when p_zoom = 14  then 0.00025      -- ≈28m equator, 21m at lat 43
      else 0.0                            -- z15+: no dedup
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
    status                              as effective_status,
    'America/New_York'::text            as region_timezone,
    null::boolean                       as is_edible_now,
    null::boolean                       as is_edible_strict,
    ST_X(location::geometry)            as lng,
    ST_Y(location::geometry)            as lat,
    false                               as is_inaccessible,
    false                               as has_ripe_observation_this_year,
    has_ripe_observation_ever           as has_ripe_observation_ever,
    null::int                           as best_harvest_quality,
    climate_zone_code
  from picked
  order by hashtextextended(id::text, 0)
  limit greatest(1, least(p_max_rows, 15000));
$$;
