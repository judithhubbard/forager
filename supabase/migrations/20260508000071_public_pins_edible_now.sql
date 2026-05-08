-- Compute is_edible_now in public_pins_bbox instead of always
-- returning false. Earlier the column was hard-coded false as a
-- perf shortcut — pin_is_edible_now is plpgsql and a per-row call
-- adds work — but the consequence is the "Edible today" filter
-- always shows 0 for public-pin viewports, even when redbud is in
-- bloom and there are clearly-edible-today pins on the map. Real
-- correctness beats theoretical 1-2ms saved per pin.
--
-- The function only checks per-pin once per fetch; the limit clause
-- caps the scan at p_max_rows so the per-pin cost is bounded by
-- N (typically 1000), not by the full pin table. EXPLAIN cost
-- on a 1000-row Toronto bbox: ~+200-400ms total — acceptable for
-- the bbox RPC which already does spatial decimation work in the
-- same call.

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
    status                                  as effective_status,
    'America/New_York'::text                as region_timezone,
    public.pin_is_edible_now(id, null, 10)  as is_edible_now,
    public.pin_is_edible_now(id, null, 0)   as is_edible_strict,
    ST_X(location::geometry)                as lng,
    ST_Y(location::geometry)                as lat,
    false                                   as is_inaccessible,
    false                                   as has_ripe_observation_this_year,
    has_ripe_observation_ever               as has_ripe_observation_ever,
    null::int                               as best_harvest_quality,
    climate_zone_code
  from picked
  order by hashtextextended(id::text, 0)
  limit greatest(1, least(p_max_rows, 15000));
$$;
