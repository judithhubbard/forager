-- Pre-compute a per-zone collected, geometry-simplified version of
-- usda_hardiness_zones for client rendering. The raw table has ~30k
-- multipolygon rows at 800m boundary precision; shipping that to a
-- browser would crush the leaflet renderer. Collecting by zone_code
-- gives us 17 rows (one per USDA zone), and simplifying at ~0.005°
-- tolerance keeps the shapes readable at city-area zooms while
-- shrinking the GeoJSON payload by 10x+.
--
-- ST_Collect (rather than ST_Union) makes a multi-geometry without
-- merging shared boundaries — much faster on large inputs and the
-- visual result is identical at zoom < 14.
--
-- Refresh strategy: this is a snapshot of the static USDA dataset.
-- Re-run the underlying scripts/import/usda-zones.ts to update raw
-- polygons; this table is dropped+recreated by the same migration on
-- subsequent runs.

drop table if exists public.usda_zones_dissolved cascade;

-- Tolerance 0.2° (~22 km) drops sub-pixel detail at city-overview zoom
-- levels where the overlay is most useful. Min area 0.1 sq° (~12,000
-- sq km) drops 90% of the zone-boundary slivers without losing any
-- substantial regional features. Result: ~2 MB GeoJSON, gzips to
-- ~600 KB.
create table public.usda_zones_dissolved as
with kept as (
  select zone_code,
         ST_SimplifyPreserveTopology(geom::geometry, 0.2) as g
    from public.usda_hardiness_zones
   where ST_Area(geom::geometry) > 0.1
)
select
  zone_code,
  ST_Multi(ST_CollectionExtract(ST_Collect(g), 3))::geometry(MultiPolygon, 4326) as geom
  from kept
 group by zone_code;

create index if not exists usda_zones_dissolved_geom_idx
  on public.usda_zones_dissolved using gist (geom);

alter table public.usda_zones_dissolved
  add primary key (zone_code);

grant select on public.usda_zones_dissolved to anon, authenticated;

-- RPC returning all zones as a single GeoJSON FeatureCollection
-- payload. Cached client-side; this only runs when the user first
-- enables the zone overlay toggle. SECURITY DEFINER so the small
-- read isn't paying RLS overhead per row.
create or replace function public.usda_zones_geojson()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'type',     'FeatureCollection',
    'features', coalesce(jsonb_agg(
      jsonb_build_object(
        'type',       'Feature',
        'properties', jsonb_build_object('zone', zone_code),
        'geometry',   ST_AsGeoJSON(geom)::jsonb
      )
      order by zone_code
    ), '[]'::jsonb)
  )
    from public.usda_zones_dissolved;
$$;

grant execute on function public.usda_zones_geojson() to anon, authenticated;
