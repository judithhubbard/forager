-- public_pins_bbox: drop the per-pin pin_is_edible_now() / pin_is_edible_strict()
-- calls from the bbox response. They were called twice per row, and at z14 over
-- a dense city the function now decimates to ~5000 rows — meaning ~10000 calls
-- to a function that itself does several spatial + window-table lookups per call.
-- Hamilton, Toronto, and other dense-public-pin areas were timing out at the
-- 3-second anon row limit, returning empty (= "trees aren't loading").
--
-- Trade-off: the edible-now glow on map markers is no longer driven for pins
-- fetched via bbox. The /pins/[id] detail page can still compute it on demand
-- (single-row cost is fine). The "edible today" status filter loses these pins
-- because the client uses `is_edible_now === true`. Both are acceptable
-- regressions vs. the current outage.
--
-- Followup: a per-(species, climate_zone, day) materialized lookup table that
-- pin_is_edible_now can hit instead of the per-call window join + zone fallback.
-- That would let us re-add is_edible_now to the bbox path without the time hit.

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
      when p_zoom <= 12 then 0.00075          -- ≈83m, 3px@z12
      when p_zoom = 13  then 0.000378         -- 3px@z13 (≈42m)
      when p_zoom = 14  then 0.000135         -- 2px@z14 (≈15m)
      else 0.0                                -- z15+: no dedup
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
