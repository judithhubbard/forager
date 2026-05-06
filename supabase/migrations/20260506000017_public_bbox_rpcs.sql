-- Phase 2A/B: bbox + cluster RPCs for the anonymous (and authenticated)
-- public-layer fetch path. Two functions:
--
--   public_pins_bbox(min_lng, min_lat, max_lng, max_lat, max_rows)
--     → individual public pins inside the bbox, capped at max_rows.
--       Used at zoom >= 11 where individual markers fit on screen.
--
--   public_pins_clusters(min_lng, min_lat, max_lng, max_lat, eps_m)
--     → ST_ClusterDBSCAN-aggregated clusters: centroid + count.
--       Used at zoom < 11 where rendering thousands of points
--       freezes the map.
--
-- Both are SECURITY INVOKER so RLS still applies — anon callers
-- only see public-visibility pins; authed users see public + their
-- region (per pins_select_member).

create or replace function public.public_pins_bbox(
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision,
  p_max_rows int default 500
)
returns setof public.v_pin_effective
language sql
stable
security invoker
as $$
  select v.*
    from public.v_pin_effective v
   where v.visibility = 'public'
     and v.lng between p_min_lng and p_max_lng
     and v.lat between p_min_lat and p_max_lat
   order by v.created_at desc
   limit greatest(1, least(p_max_rows, 1000));
$$;

grant execute on function public.public_pins_bbox(
  double precision, double precision, double precision, double precision, int
) to anon, authenticated;

-- Cluster RPC. Uses ST_ClusterDBSCAN over the public-pin location
-- set. eps is in degrees because PostGIS' DBSCAN works in the input
-- SRID (4326). Convert from a "cluster radius in meters at the bbox
-- centroid" hint by calling cluster_eps_for_bbox below.
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
    select v.*
      from public.v_pin_effective v
     where v.visibility = 'public'
       and v.lng between p_min_lng and p_max_lng
       and v.lat between p_min_lat and p_max_lat
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
    -- Pick the most-common species_id in the cluster as a stand-in
    -- for "what is this cluster mostly?" Useful for color/shape.
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

grant execute on function public.public_pins_clusters(
  double precision, double precision, double precision, double precision,
  double precision, int
) to anon, authenticated;
