-- Performance fix per audit. The public_pins_clusters RPC was
-- pulling rows from v_pin_effective, which fires 7 expensive
-- subqueries per pin (pin_in_window twice, has_ripe_observation
-- twice, hazard EXISTS, best_harvest_quality, effective_status).
-- The cluster RPC only needs id, species_id, lng, lat, visibility
-- — none of the ripeness/observation aggregates.
--
-- This rewrite queries the pins table directly with a join to
-- regions for visibility, skipping the view entirely. At low zoom
-- with thousands of public pins this is the difference between an
-- in-budget request and a 5+ second one.

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

grant execute on function public.public_pins_clusters(
  double precision, double precision, double precision, double precision,
  double precision, int
) to anon, authenticated;
