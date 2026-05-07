-- Region-scoped versions of the public_pins_bbox + public_pins_clusters
-- RPCs from migration 17/25. Same shape, but filtered by region_id
-- instead of visibility='public'. Lets the main map page switch from
-- listByRegion(regionId) — which paginates the entire region's pins
-- regardless of viewport — to viewport-driven fetches that scale with
-- what the user is actually looking at, not with the size of the
-- region.
--
-- Both functions are SECURITY INVOKER so RLS still gates them: the
-- pins_select_member policy means a non-member calling these for a
-- region they don't belong to gets zero rows back.

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
   where v.region_id = p_region_id
     and v.lng between p_min_lng and p_max_lng
     and v.lat between p_min_lat and p_max_lat
   order by v.created_at desc
   limit greatest(1, least(p_max_rows, 2000));
$$;

grant execute on function public.region_pins_bbox(
  uuid, double precision, double precision, double precision, double precision, int
) to authenticated;

-- Slim cluster RPC: queries `pins` directly instead of v_pin_effective,
-- mirroring what migration 25 did for the public version. The heavy
-- per-row subqueries in v_pin_effective (pin_in_window twice,
-- has_ripe_observation twice, hazard EXISTS, best_harvest_quality,
-- effective_status) are wasted work for cluster aggregation — clusters
-- only need id + species_id + lng + lat + region membership.
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
     where p.region_id = p_region_id
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

grant execute on function public.region_pins_clusters(
  uuid, double precision, double precision, double precision, double precision,
  double precision, int
) to authenticated;
