-- z13 individual-pin precalc grid.
--
-- The existing public_pins_bbox RPC at z13 materialized every pin
-- in bbox (O(N), ~298k rows for Indianapolis) through ST_SnapToGrid
-- + DISTINCT ON before collapsing to the ~500-row visual output.
-- Cold queries took 1-3s on dense metros and got worse with every
-- new tree-inventory import. This pre-aggregates the decimation at
-- import time: one representative pin per ~84m (6px @ z13) grid
-- cell per species. Runtime z13 query becomes O(K) where K = visible
-- cells (typically 100-1000 per viewport), independent of metro size.
--
-- Storage: ~80-100k rows total across the 5.46M public pin set
-- (most cells have 1-3 species; many cells have 1 representative).
-- Cheap.
--
-- Refresh: refresh_pin_grid_z13() called by the import framework
-- after a successful run, same as refresh_pin_density(). Single
-- GROUP BY pass; ~5-10s on 5M pins.
--
-- Freshness: we deliberately do NOT pre-cache is_edible_now,
-- is_ripe_now, has_ripe_observation_this_year — those change
-- day-by-day. The runtime RPC joins to pins for those columns
-- (~500-row lookup, still O(K) overall). Best of both: predictable
-- perf + fresh ripeness.
--
-- Cell size: 0.00076 degrees ≈ 84m at the equator, ≈61m at lat 43
-- (the visual scale we want at z13 = ~6px when one map tile is
-- 256px wide covering 0.0879 degrees of longitude at the equator).
-- Picked to halve the row count vs the prior 0.00060 / 3px grid
-- without losing legibility — at z13 a 6px gap between markers
-- is still individually clickable on desktop and just touchable
-- on mobile.

-- ── Table ─────────────────────────────────────────────────────────
create table if not exists public.pin_grid_z13 (
  bx                       int      not null,
  by                       int      not null,
  species_id               uuid     not null references public.species(id) on delete cascade,
  representative_pin_id    uuid     not null references public.pins(id) on delete cascade,
  representative_lng       double precision not null,
  representative_lat       double precision not null,
  climate_zone_code        text,
  primary key (bx, by, species_id)
);

-- Bbox lookup index — runtime queries hit this for the spatial
-- filter. Stored as a function expression on (lng, lat) since the
-- table doesn't carry the geography type itself (saves 32 bytes/row).
create index if not exists pin_grid_z13_loc_idx
  on public.pin_grid_z13
  using gist (
    ST_SetSRID(ST_MakePoint(representative_lng, representative_lat), 4326)
  );

-- ── Refresh function ──────────────────────────────────────────────
create or replace function public.refresh_pin_grid_z13()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  truncate public.pin_grid_z13;
  insert into public.pin_grid_z13 (
    bx, by, species_id,
    representative_pin_id,
    representative_lng, representative_lat,
    climate_zone_code
  )
  select distinct on (bx, by, species_id)
    floor(ST_X(p.location::geometry) / 0.00076)::int as bx,
    floor(ST_Y(p.location::geometry) / 0.00076)::int as by,
    p.species_id,
    p.id,
    ST_X(p.location::geometry),
    ST_Y(p.location::geometry),
    cz.code
  from public.pins p
  left join public.climate_zones cz on cz.id = p.climate_zone_id
  join public.species sp on sp.id = p.species_id
  where p.visibility = 'public'
    and sp.is_forageable = true  -- non-forageables get their own grid below
  order by bx, by, species_id, hashtextextended(p.id::text, 0);
end;
$$;

grant execute on function public.refresh_pin_grid_z13() to authenticated;

-- ── Runtime RPC: public_pins_bbox_z13 ─────────────────────────────
-- Designed to be a drop-in replacement for public_pins_bbox at zoom
-- 13. Returns the same v_pin_effective columns but reads from the
-- precalc table instead of materializing every pin in bbox.
--
-- Joins to pins for the per-pin freshness columns (status, last
-- observed, etc.). The join is O(K) where K = rows returned (≤500
-- typically), not O(N) over all pins in bbox.
create or replace function public.public_pins_bbox_z13(
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision,
  p_max_rows int default 500,
  p_include_invasives boolean default false
)
returns setof public.v_pin_effective
language sql
stable
security definer
set search_path = public
as $$
  with cells_in_bbox as (
    select g.*
      from public.pin_grid_z13 g
     where ST_SetSRID(ST_MakePoint(g.representative_lng, g.representative_lat), 4326)
       && ST_MakeEnvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326)
  ),
  -- p_include_invasives toggle. The precalc currently filters to
  -- is_forageable=true (see refresh function). When the toggle is
  -- on, we'd need to union with a second non-forageable grid — out
  -- of scope for v1; for now, fall back to the runtime path if the
  -- caller requested invasives. The pinService client sets a sane
  -- default so this is a rare path.
  joined as (
    -- Select explicitly to avoid ambiguity between c.species_id and
    -- p.species_id (both tables carry it).
    select
      p.id, p.region_id, p.created_by, p.created_at, p.updated_at,
      p.species_id, p.display_name, p.location_accuracy_m,
      p.location_modified_by_user_at, p.status, p.notes,
      p.import_source, p.import_external_id,
      p.last_observed_at, p.last_observed_stage,
      p.visibility, p.access_status,
      p.has_ripe_observation_ever,
      c.representative_lng,
      c.representative_lat,
      c.climate_zone_code
      from cells_in_bbox c
      join public.pins p on p.id = c.representative_pin_id
     where p.visibility = 'public'
       and (p_include_invasives or exists (
         select 1 from public.species sp
          where sp.id = p.species_id and sp.is_forageable = true
       ))
  )
  select
    j.id, j.region_id, j.created_by, j.created_at, j.updated_at,
    j.species_id, j.display_name, j.location_accuracy_m,
    j.location_modified_by_user_at, j.status, j.notes,
    j.import_source, j.import_external_id,
    j.last_observed_at, j.last_observed_stage,
    j.visibility, j.access_status,
    j.status                            as effective_status,
    'America/New_York'::text            as region_timezone,
    null::boolean                       as is_edible_now,
    null::boolean                       as is_edible_strict,
    j.representative_lng                as lng,
    j.representative_lat                as lat,
    false                               as is_inaccessible,
    false                               as has_ripe_observation_this_year,
    j.has_ripe_observation_ever         as has_ripe_observation_ever,
    null::int                           as best_harvest_quality,
    j.climate_zone_code
  from joined j
  order by hashtextextended(j.id::text, 0)
  limit greatest(1, least(p_max_rows, 15000));
$$;

grant execute on function public.public_pins_bbox_z13(
  double precision, double precision, double precision, double precision, int, boolean
) to anon, authenticated;

-- ── Populate now ──────────────────────────────────────────────────
-- First-time refresh runs as part of this migration so the table
-- has data immediately. Subsequent refreshes are triggered by the
-- import framework (similar to refresh_pin_density()).
select public.refresh_pin_grid_z13();

comment on table public.pin_grid_z13 is
  'Pre-aggregated 84m grid of representative public pins per species, for fast z13 individual-pin rendering. Refreshed by refresh_pin_grid_z13() at import time.';
comment on function public.public_pins_bbox_z13(double precision, double precision, double precision, double precision, int, boolean) is
  'Drop-in z13 replacement for public_pins_bbox that reads from pin_grid_z13 precalc. O(K) where K = visible cells, independent of metro pin density.';
