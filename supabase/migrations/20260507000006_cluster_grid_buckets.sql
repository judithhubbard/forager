-- Cluster RPCs replaced ST_ClusterDBSCAN with simple grid-bucket
-- clustering. DBSCAN was timing out (SQLSTATE 57014, statement
-- timeout) at the current public-layer scale (~35k pins) even
-- with the dedup-locations fix from migration 33; the algorithm
-- is O(n²) worst-case and the bbox-clipped subset still has
-- thousands of unique points at city zoom.
--
-- Grid-bucketing: assign each pin to a (bx, by) cell of size
-- p_eps_deg and GROUP BY that cell. O(n), no spatial functions
-- in the hot path, runs in milliseconds. Visually equivalent for
-- the 'where is pin density' question; the only cost is that
-- two pins straddling a grid boundary land in different clusters
-- instead of merging — fine for a low-zoom density map.
--
-- p_minpoints is now ignored (kept in signature for client
-- backwards-compat — clients pass it as 1 anyway).

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
      ST_X(p.location::geometry) as lng,
      ST_Y(p.location::geometry) as lat,
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
    avg(lng)::double precision                 as centroid_lng,
    avg(lat)::double precision                 as centroid_lat,
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
      ST_X(p.location::geometry) as lng,
      ST_Y(p.location::geometry) as lat,
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
    avg(lng)::double precision                 as centroid_lng,
    avg(lat)::double precision                 as centroid_lat,
    (array_agg(species_id) filter (where species_id is not null))[1]
                                                as representative_species_id
  from eligible
  group by bx, by;
$$;
