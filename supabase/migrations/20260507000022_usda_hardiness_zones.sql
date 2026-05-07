-- USDA Plant Hardiness Zone polygons for point-in-zone lookup.
-- Backed by the OPHZ dataset (kgjenkins/ophz, github.com), which is
-- a vector reconstruction of the USDA 2012 Plant Hardiness Zone Map
-- and is in the public domain (per LICENSE.md). Used for:
--   - resolving each region to its primary climate zone (region centroid → zone)
--   - rendering an optional zone overlay on the map
--   - in the future, per-pin zone lookup for phenology windows
--
-- Conterminous US only (49 state files; AK + HI separate, may add later).
-- Polygon count is in the low thousands at ~800m resolution, well
-- within Postgres' comfort zone.
--
-- The actual polygon rows are loaded by scripts/import/usda-zones.ts;
-- this migration just creates the schema + indexes + the lookup
-- function. Re-running the importer is idempotent (truncate + insert).

create table if not exists public.usda_hardiness_zones (
  id   bigserial primary key,
  zone_code text not null,                              -- '5b', '6a', etc.
  state     text,                                        -- 'NY', 'PA' …
  geom geometry(MultiPolygon, 4326) not null
);

create index if not exists usda_zones_geom_idx
  on public.usda_hardiness_zones using gist (geom);

create index if not exists usda_zones_zone_idx
  on public.usda_hardiness_zones (zone_code);

grant select on public.usda_hardiness_zones to anon, authenticated;

-- Point-in-polygon zone lookup. STABLE so the planner can hoist it.
-- Returns the zone code for the polygon containing the point, or
-- null if outside the dataset (Alaska, Hawaii, Canada, Mexico, etc.).
-- Callers should fall back to a latitude-band heuristic when null.
create or replace function public.zone_for_point(
  p_lng double precision,
  p_lat double precision
) returns text
language sql
stable
parallel safe
as $$
  select zone_code
    from public.usda_hardiness_zones
   where geom && ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)
     and ST_Contains(geom, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326))
   limit 1;
$$;

grant execute on function public.zone_for_point(double precision, double precision) to anon, authenticated;
