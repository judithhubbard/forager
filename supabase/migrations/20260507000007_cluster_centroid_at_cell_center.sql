-- Cluster RPCs return centroids at the CENTER of their grid cell,
-- not at the average of the pins inside. The previous version's
-- avg(lng), avg(lat) put centroids wherever pins actually fell,
-- so two adjacent cells whose pins both sat near the shared
-- edge produced centroids much closer than the cell width — and
-- the heatmap circles (sized to cellMeters/2 to fit the cell)
-- overlapped heavily.
--
-- With cell-center centroids, adjacent clusters are exactly
-- p_eps_deg apart in lng/lat. Circles can fit cleanly without
-- ever overlapping a neighbor regardless of pin distribution.

create or replace function public.public_pins_clusters(
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision,
  p_eps_deg double precision default 0.05,
  p_minpoints int default 1
)
returns table (
  cluster_id int,
  count_pins int,
  centroid_lng double precision,
  centroid_lat double precision,
  representative_species_id uuid
)
language sql
stable
security invoker
as $$
  with eligible as (
    select
      floor(ST_X(p.location::geometry) / p_eps_deg)::int as bx,
      floor(ST_Y(p.location::geometry) / p_eps_deg)::int as by,
      p.species_id
    from public.pins p
    where p.visibility = 'public'
      and p.location::geometry && ST_MakeEnvelope(
        p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326
      )
  )
  select
    (row_number() over (order by bx, by))::int as cluster_id,
    count(*)::int                              as count_pins,
    ((bx::double precision + 0.5) * p_eps_deg) as centroid_lng,
    ((by::double precision + 0.5) * p_eps_deg) as centroid_lat,
    (array_agg(species_id) filter (where species_id is not null))[1]
                                                as representative_species_id
  from eligible
  group by bx, by;
$$;

create or replace function public.region_pins_clusters(
  p_region_id uuid,
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision,
  p_eps_deg double precision default 0.05,
  p_minpoints int default 1
)
returns table (
  cluster_id int,
  count_pins int,
  centroid_lng double precision,
  centroid_lat double precision,
  representative_species_id uuid
)
language sql
stable
security invoker
as $$
  with eligible as (
    select
      floor(ST_X(p.location::geometry) / p_eps_deg)::int as bx,
      floor(ST_Y(p.location::geometry) / p_eps_deg)::int as by,
      p.species_id
    from public.pins p
    where (p.region_id = p_region_id or p.visibility = 'public')
      and p.location::geometry && ST_MakeEnvelope(
        p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326
      )
  )
  select
    (row_number() over (order by bx, by))::int as cluster_id,
    count(*)::int                              as count_pins,
    ((bx::double precision + 0.5) * p_eps_deg) as centroid_lng,
    ((by::double precision + 0.5) * p_eps_deg) as centroid_lat,
    (array_agg(species_id) filter (where species_id is not null))[1]
                                                as representative_species_id
  from eligible
  group by bx, by;
$$;
