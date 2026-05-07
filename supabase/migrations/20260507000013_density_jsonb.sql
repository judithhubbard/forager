-- PostgREST caps RPC responses at db-max-rows (1000 by default)
-- and our density grid easily produces 2000+ buckets per viewport
-- in dense cities. The cap was silently truncating the response,
-- ordered by primary key (zoom_band, bx, by), so eastern buckets
-- got dropped — exactly the 'straight-line cutoff at -79.425'
-- the user reported in Toronto.
--
-- Workaround: return the buckets as a single jsonb array. One
-- row, no pagination, no cap. Client parses the array directly.
-- Same logic + bbox padding as the table-returning versions.

create or replace function public.public_pins_density_json(
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision,
  p_zoom int default 8
)
returns jsonb
language sql
stable
security invoker
as $$
  with band as (
    select public.band_for_zoom(p_zoom) as b,
           public.eps_for_band(public.band_for_zoom(p_zoom)) as e
  ),
  rows as (
    select
      g.count_pins,
      ((g.bx::double precision + 0.5) * band.e) as centroid_lng,
      ((g.by::double precision + 0.5) * band.e) as centroid_lat,
      band.e as cell_eps
    from public.pin_density_grid g
    cross join band
    where g.zoom_band = band.b
      and ((g.bx::double precision + 0.5) * band.e) between p_min_lng - band.e and p_max_lng + band.e
      and ((g.by::double precision + 0.5) * band.e) between p_min_lat - band.e and p_max_lat + band.e
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'count_pins',   r.count_pins,
    'centroid_lng', r.centroid_lng,
    'centroid_lat', r.centroid_lat,
    'cell_eps',     r.cell_eps
  )), '[]'::jsonb)
  from rows r;
$$;

grant execute on function public.public_pins_density_json(
  double precision, double precision, double precision, double precision, int
) to anon, authenticated;

create or replace function public.region_pins_density_json(
  p_region_id uuid,
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision,
  p_zoom int default 8
)
returns jsonb
language sql
stable
security invoker
as $$
  with band as (
    select public.band_for_zoom(p_zoom) as b,
           public.eps_for_band(public.band_for_zoom(p_zoom)) as e
  ),
  public_buckets as (
    select g.bx, g.by, g.count_pins
      from public.pin_density_grid g
      cross join band
     where g.zoom_band = band.b
       and ((g.bx::double precision + 0.5) * band.e) between p_min_lng - band.e and p_max_lng + band.e
       and ((g.by::double precision + 0.5) * band.e) between p_min_lat - band.e and p_max_lat + band.e
  ),
  region_buckets as (
    select bx, by, count(*)::int as count_pins
      from (
        select
          floor(ST_X(p.location::geometry) / band.e)::int as bx,
          floor(ST_Y(p.location::geometry) / band.e)::int as by
          from public.pins p
          cross join band
         where p.region_id = p_region_id
           and p.visibility <> 'public'
           and p.location::geometry && ST_MakeEnvelope(
             p_min_lng - band.e, p_min_lat - band.e,
             p_max_lng + band.e, p_max_lat + band.e,
             4326
           )
      ) sub
      group by bx, by
  ),
  combined as (
    select bx, by, count_pins from public_buckets
    union all
    select bx, by, count_pins from region_buckets
  ),
  agg as (
    select
      sum(c.count_pins)::int                       as count_pins,
      ((c.bx::double precision + 0.5) * band.e)    as centroid_lng,
      ((c.by::double precision + 0.5) * band.e)    as centroid_lat,
      band.e                                       as cell_eps
    from combined c
    cross join band
    group by c.bx, c.by, band.e
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'count_pins',   a.count_pins,
    'centroid_lng', a.centroid_lng,
    'centroid_lat', a.centroid_lat,
    'cell_eps',     a.cell_eps
  )), '[]'::jsonb)
  from agg a;
$$;

grant execute on function public.region_pins_density_json(
  uuid, double precision, double precision, double precision, double precision, int
) to authenticated;
