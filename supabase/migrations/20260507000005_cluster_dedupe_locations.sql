-- ST_ClusterDBSCAN throws 'XX000 / Error during clustering' when
-- the input set contains exact-duplicate coordinates (a known
-- PostGIS issue, fixed in 3.4+ but Supabase may still run an
-- older version). Municipal tree inventories regularly stack
-- multiple trees at the same lat/lng node, so the anon cluster
-- RPC started 500-ing once SF/Boston/Toronto imports landed.
--
-- The fix is to GROUP BY (lng, lat) before clustering: feed
-- unique points to DBSCAN, sum the per-location pin counts back
-- in afterward. count_pins still equals the actual pin total
-- per cluster; representative_species_id picks whichever species
-- has the most pins under it.

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
  with locs as (
    select
      ST_X(p.location::geometry) as lng,
      ST_Y(p.location::geometry) as lat,
      count(*)::int as n,
      (array_agg(p.species_id) filter (where p.species_id is not null))[1] as rep
    from public.pins p
    where p.visibility = 'public'
      and p.location::geometry && ST_MakeEnvelope(
        p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326
      )
    group by ST_X(p.location::geometry), ST_Y(p.location::geometry)
  ),
  clustered as (
    select
      lng,
      lat,
      n,
      rep,
      ST_ClusterDBSCAN(
        ST_SetSRID(ST_MakePoint(lng, lat), 4326),
        eps := p_eps_deg,
        minpoints := p_minpoints
      ) over () as cid
    from locs
  )
  select
    cid                               as cluster_id,
    sum(n)::int                       as count_pins,
    avg(lng)::double precision        as centroid_lng,
    avg(lat)::double precision        as centroid_lat,
    (
      select rep
        from clustered c2
       where c2.cid = clustered.cid
         and c2.rep is not null
       group by rep
       order by sum(n) desc
       limit 1
    ) as representative_species_id
  from clustered
  group by cluster_id;
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
  with locs as (
    select
      ST_X(p.location::geometry) as lng,
      ST_Y(p.location::geometry) as lat,
      count(*)::int as n,
      (array_agg(p.species_id) filter (where p.species_id is not null))[1] as rep
    from public.pins p
    where (p.region_id = p_region_id or p.visibility = 'public')
      and p.location::geometry && ST_MakeEnvelope(
        p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326
      )
    group by ST_X(p.location::geometry), ST_Y(p.location::geometry)
  ),
  clustered as (
    select
      lng,
      lat,
      n,
      rep,
      ST_ClusterDBSCAN(
        ST_SetSRID(ST_MakePoint(lng, lat), 4326),
        eps := p_eps_deg,
        minpoints := p_minpoints
      ) over () as cid
    from locs
  )
  select
    cid                               as cluster_id,
    sum(n)::int                       as count_pins,
    avg(lng)::double precision        as centroid_lng,
    avg(lat)::double precision        as centroid_lat,
    (
      select rep
        from clustered c2
       where c2.cid = clustered.cid
         and c2.rep is not null
       group by rep
       order by sum(n) desc
       limit 1
    ) as representative_species_id
  from clustered
  group by cluster_id;
$$;
