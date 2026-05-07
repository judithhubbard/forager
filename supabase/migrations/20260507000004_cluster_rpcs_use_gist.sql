-- Cluster RPCs (region_pins_clusters + public_pins_clusters) were
-- doing `ST_X(p.location::geometry) between ...` for the bbox
-- filter, which can't use the GIST spatial index — every row
-- needed the geometry cast + ST_X/ST_Y per row, then DBSCAN over
-- the full result. Once the public layer crossed ~30k pins
-- (after the SF/Boston/Toronto imports landed), a continental
-- bbox query took tens of seconds.
--
-- Replace the WHERE with `location::geometry && ST_MakeEnvelope(...)`
-- which IS index-supported. ST_X/ST_Y stay in the SELECT for the
-- centroid math but only run on the bbox-clipped subset.

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
      p.id,
      p.species_id,
      ST_X(p.location::geometry) as lng,
      ST_Y(p.location::geometry) as lat
      from public.pins p
     where (p.region_id = p_region_id or p.visibility = 'public')
       and p.location::geometry && ST_MakeEnvelope(
         p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326
       )
  ),
  clustered as (
    select
      e.id,
      e.species_id,
      e.lng,
      e.lat,
      ST_ClusterDBSCAN(
        ST_SetSRID(ST_MakePoint(e.lng, e.lat), 4326),
        eps := p_eps_deg,
        minpoints := p_minpoints
      ) over () as cid
    from eligible e
  )
  select
    cid                               as cluster_id,
    count(*)::int                     as count_pins,
    avg(lng)::double precision        as centroid_lng,
    avg(lat)::double precision        as centroid_lat,
    (
      select species_id
        from clustered c2
       where c2.cid = clustered.cid
         and c2.species_id is not null
       group by species_id
       order by count(*) desc
       limit 1
    ) as representative_species_id
  from clustered
  group by cluster_id;
$$;

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
      p.id,
      p.species_id,
      ST_X(p.location::geometry) as lng,
      ST_Y(p.location::geometry) as lat
      from public.pins p
     where p.visibility = 'public'
       and p.location::geometry && ST_MakeEnvelope(
         p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326
       )
  ),
  clustered as (
    select
      e.id,
      e.species_id,
      e.lng,
      e.lat,
      ST_ClusterDBSCAN(
        ST_SetSRID(ST_MakePoint(e.lng, e.lat), 4326),
        eps := p_eps_deg,
        minpoints := p_minpoints
      ) over () as cid
    from eligible e
  )
  select
    cid                               as cluster_id,
    count(*)::int                     as count_pins,
    avg(lng)::double precision        as centroid_lng,
    avg(lat)::double precision        as centroid_lat,
    (
      select species_id
        from clustered c2
       where c2.cid = clustered.cid
         and c2.species_id is not null
       group by species_id
       order by count(*) desc
       limit 1
    ) as representative_species_id
  from clustered
  group by cluster_id;
$$;
