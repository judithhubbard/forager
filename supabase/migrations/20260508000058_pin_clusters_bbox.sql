-- Cluster-aware bbox aggregation. Same per-zoom grid as the
-- decimation in public_pins_bbox / region_pins_bbox, but returns
-- one row per non-empty cell with:
--   - cell centroid (mean lat/lng of the pins in the cell)
--   - count
--   - a representative pin (the hash-winner) so single-pin cells
--     can render the normal marker
--   - top species id in the cell (most common species)
--
-- Client-side rule:
--   count = 1 → render as individual pin marker (as today)
--   count > 1 → render as a circle-with-count cluster marker
-- Replaces the per-pin path at low/medium zoom; at zoom 17+ the
-- cells are small enough that almost every cell has count = 1
-- and the visual is the same as before.

create or replace function public.pin_clusters_bbox(
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision,
  p_zoom int default 16
)
returns table (
  cluster_id text,
  centroid_lng double precision,
  centroid_lat double precision,
  count int,
  representative_pin_id uuid,
  representative_species_id uuid,
  representative_status text,
  representative_visibility text,
  is_cluster boolean
)
language sql
stable
security definer
set search_path = public
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
  binned as (
    select p.id, p.species_id, p.status::text as status, p.visibility,
           ST_X(p.location::geometry) as lng,
           ST_Y(p.location::geometry) as lat,
           hashtextextended(p.id::text, 0) as h,
           case when cs.deg = 0
                then ST_AsText(p.location::geometry)
                else ST_AsText(ST_SnapToGrid(p.location::geometry, cs.deg, cs.deg))
           end as cell
      from public.pins p
      cross join cell_size cs
     where p.visibility = 'public'
       and p.location && ST_MakeEnvelope(
             p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326
           )
  ),
  representatives as (
    select distinct on (cell)
      cell, id as representative_pin_id, species_id as representative_species_id,
      status as representative_status, visibility as representative_visibility
      from binned
     order by cell, h
  ),
  aggregated as (
    select cell,
           avg(lng) as centroid_lng,
           avg(lat) as centroid_lat,
           count(*)::int as count
      from binned
     group by cell
  )
  select a.cell,
         a.centroid_lng,
         a.centroid_lat,
         a.count,
         r.representative_pin_id,
         r.representative_species_id,
         r.representative_status,
         r.representative_visibility,
         (a.count > 1) as is_cluster
    from aggregated a
    join representatives r using (cell)
   order by hashtextextended(r.representative_pin_id::text, 0)
   limit 15000;
$$;

grant execute on function public.pin_clusters_bbox(
  double precision, double precision, double precision, double precision, int
) to anon, authenticated;
