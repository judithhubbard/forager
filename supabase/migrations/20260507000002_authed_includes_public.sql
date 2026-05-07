-- region_pins_bbox + region_pins_clusters were filtering strictly by
-- region_id, which meant an authed user panning outside their own
-- region (e.g. an Ithaca user looking at SF / Boston / Toronto)
-- would see no pins at all — even though those cities have public-
-- visibility tree imports they have every right to see.
--
-- The fix: the bbox returns pins where (region_id = mine) OR
-- (visibility = 'public'). RLS already permits both reads; this
-- just stops the RPC from artificially narrowing what RLS allows.
-- Drop+recreate is needed because the previous version's signature
-- doesn't allow CREATE OR REPLACE to redefine its body cleanly
-- given the same return shape.

create or replace function public.region_pins_bbox(
  p_region_id uuid,
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision,
  p_max_rows int default 1000
)
returns setof public.v_pin_effective
language sql
stable
security invoker
as $$
  select v.*
    from public.v_pin_effective v
   where (v.region_id = p_region_id or v.visibility = 'public')
     and v.lng between p_min_lng and p_max_lng
     and v.lat between p_min_lat and p_max_lat
   order by v.created_at desc
   limit greatest(1, least(p_max_rows, 2000));
$$;

-- Same generalization for the cluster RPC. Stays slim by going
-- straight to pins (mirroring migration 25's pattern).
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
       and ST_X(p.location::geometry) between p_min_lng and p_max_lng
       and ST_Y(p.location::geometry) between p_min_lat and p_max_lat
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
