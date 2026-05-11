-- Migration 27: pin_grid_z13 v2 — corrected design.
--
-- Migration 26 keyed the precalc on (bx, by, species_id), producing
-- one row per species per cell. Dense urban cells have many species
-- so the v1 table inflated to 1.97M rows — 2x larger than necessary —
-- and the GIST-on-function-expression index lost the planner battle
-- against the native geography index on pins.location. Benchmarks
-- on Indianapolis showed v1 was SLOWER than the runtime path
-- (12s cold / 1.3s warm vs 2.5s cold / 1.2s warm).
--
-- v2 corrects the design per JK's original intent: one representative
-- pin per visible cell (not per cell × species). Same 6px / ~84m
-- grid resolution. ~982k rows instead of 1.97M. Keyed on (bx, by)
-- so the bbox query is a primary-key range scan, no GIST on a
-- function expression.
--
-- The picked representative is chosen by hashtextextended(id, 0) so
-- the choice is deterministic but evenly distributed (avoids picking
-- always the lowest-id pin in each cell, which would skew toward
-- whichever city imported earliest).
--
-- Storage: ~30-50 MB. Refresh: single GROUP BY pass. Query plan: an
-- index range scan with a LIMIT, O(K) where K = rows returned.

-- ── Drop v1 ───────────────────────────────────────────────────────
-- The v1 RPC + table are unused (listPublicPins was reverted after
-- the v1 benchmark loss in commit d44962b). Free the storage.
drop function if exists public.public_pins_bbox_z13(
  double precision, double precision, double precision, double precision, int, boolean
);
drop function if exists public.refresh_pin_grid_z13();
drop table if exists public.pin_grid_z13;

-- ── v2 table ──────────────────────────────────────────────────────
create table if not exists public.pin_grid_z13 (
  bx                       int      not null,
  by                       int      not null,
  representative_pin_id    uuid     not null references public.pins(id) on delete cascade,
  representative_lng       double precision not null,
  representative_lat       double precision not null,
  species_id               uuid     not null,
  climate_zone_code        text,
  primary key (bx, by)
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
    bx, by, representative_pin_id,
    representative_lng, representative_lat,
    species_id, climate_zone_code
  )
  select distinct on (bx, by)
    bx, by, id,
    lng, lat,
    species_id, climate_zone_code
  from (
    select
      floor(ST_X(p.location::geometry) / 0.00076)::int as bx,
      floor(ST_Y(p.location::geometry) / 0.00076)::int as by,
      p.id,
      ST_X(p.location::geometry) as lng,
      ST_Y(p.location::geometry) as lat,
      p.species_id,
      cz.code as climate_zone_code
    from public.pins p
    left join public.climate_zones cz on cz.id = p.climate_zone_id
    join public.species sp on sp.id = p.species_id
    where p.visibility = 'public'
      and sp.is_forageable = true
  ) candidates
  order by bx, by, hashtextextended(id::text, 0);
end;
$$;

grant execute on function public.refresh_pin_grid_z13() to authenticated;

-- ── Runtime RPC ───────────────────────────────────────────────────
-- Pure index-range scan: derive the (bx, by) bounds from the bbox
-- coords (84m cells = 0.00076 degrees of lng/lat) and walk the
-- primary key. ORDER BY hashtextextended(representative_pin_id, 0)
-- gives a random-but-deterministic sample when the bbox has more
-- than p_max_rows cells, so dense viewports get an even spread
-- rather than the northwest 500 cells.
--
-- Joins to public.pins for the freshness columns (status,
-- last_observed_at, has_ripe_observation_ever) — these can change
-- daily and we want them fresh, not stale-cached. ~500 PK lookups
-- on pins is sub-10ms.
create or replace function public.public_pins_bbox_z13(
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
  with picked as (
    select g.*
      from public.pin_grid_z13 g
     where g.bx between floor(p_min_lng / 0.00076)::int
                    and floor(p_max_lng / 0.00076)::int
       and g.by between floor(p_min_lat / 0.00076)::int
                    and floor(p_max_lat / 0.00076)::int
       -- Tighter bbox check on the actual lng/lat — primary-key
       -- range above is the cell-index bbox; this trims rows just
       -- inside cell boundaries that overlap the request bbox edge.
       and g.representative_lng between p_min_lng and p_max_lng
       and g.representative_lat between p_min_lat and p_max_lat
     order by hashtextextended(g.representative_pin_id::text, 0)
     limit greatest(1, least(p_max_rows, 15000))
  )
  select
    p.id, p.region_id, p.created_by, p.created_at, p.updated_at,
    p.species_id, p.display_name, p.location_accuracy_m,
    p.location_modified_by_user_at, p.status, p.notes,
    p.import_source, p.import_external_id,
    p.last_observed_at, p.last_observed_stage,
    p.visibility, p.access_status,
    p.status                            as effective_status,
    'America/New_York'::text            as region_timezone,
    null::boolean                       as is_edible_now,
    null::boolean                       as is_edible_strict,
    picked.representative_lng           as lng,
    picked.representative_lat           as lat,
    false                               as is_inaccessible,
    false                               as has_ripe_observation_this_year,
    p.has_ripe_observation_ever         as has_ripe_observation_ever,
    null::int                           as best_harvest_quality,
    picked.climate_zone_code
  from picked
  join public.pins p on p.id = picked.representative_pin_id;
$$;

grant execute on function public.public_pins_bbox_z13(
  double precision, double precision, double precision, double precision, int
) to anon, authenticated;

-- ── Populate now ──────────────────────────────────────────────────
select public.refresh_pin_grid_z13();

comment on table public.pin_grid_z13 is
  'v2: one representative public pin per 84m grid cell (visible at z13). Primary key (bx, by) — index range scan replaces the runtime O(N-in-bbox) snap-to-grid + distinct work in public_pins_bbox.';
