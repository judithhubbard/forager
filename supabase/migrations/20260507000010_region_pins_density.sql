-- Two coordinated changes:
--
-- (1) Pad the bbox check in public_pins_density by one cell on each
--     side so cells whose body straddles the bbox edge are included.
--     The previous check only matched cells with their CENTER in
--     the bbox — at the viewport edge that produced a visible 'line'
--     where rectangles abruptly stopped rendering, especially right
--     after a zoom where the new fetch's bbox might be slightly off
--     from where the old cells were.
--
-- (2) Authed-user version: region_pins_density combines the
--     pre-computed pin_density_grid (covers public-visibility pins
--     efficiently, even at continental zoom) with live aggregation
--     of the user's region-private pins. Live = automatic updates
--     on pin add/remove without needing triggers, because typical
--     regions are small (<1k pins) so the aggregation is cheap.
--     A pin that's both region-member and visibility='public'
--     would otherwise double-count, so the live half explicitly
--     excludes visibility='public'.

drop function if exists public.public_pins_density(
  double precision, double precision, double precision, double precision, int
);

create or replace function public.public_pins_density(
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision,
  p_zoom int default 8
)
returns table (
  count_pins int,
  centroid_lng double precision,
  centroid_lat double precision,
  cell_eps double precision
)
language sql
stable
security invoker
as $$
  with band as (
    select public.band_for_zoom(p_zoom) as b,
           public.eps_for_band(public.band_for_zoom(p_zoom)) as e
  )
  select
    g.count_pins,
    ((g.bx::double precision + 0.5) * band.e) as centroid_lng,
    ((g.by::double precision + 0.5) * band.e) as centroid_lat,
    band.e                                    as cell_eps
  from public.pin_density_grid g
  cross join band
  where g.zoom_band = band.b
    -- Pad by one cell so edge cells whose body extends into the
    -- bbox (but center sits just outside) are included.
    and ((g.bx::double precision + 0.5) * band.e) between p_min_lng - band.e and p_max_lng + band.e
    and ((g.by::double precision + 0.5) * band.e) between p_min_lat - band.e and p_max_lat + band.e;
$$;

grant execute on function public.public_pins_density(
  double precision, double precision, double precision, double precision, int
) to anon, authenticated;

create or replace function public.region_pins_density(
  p_region_id uuid,
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision,
  p_zoom int default 8
)
returns table (
  count_pins int,
  centroid_lng double precision,
  centroid_lat double precision,
  cell_eps double precision
)
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
  )
  select
    sum(c.count_pins)::int                       as count_pins,
    ((c.bx::double precision + 0.5) * band.e)    as centroid_lng,
    ((c.by::double precision + 0.5) * band.e)    as centroid_lat,
    band.e                                       as cell_eps
  from combined c
  cross join band
  group by c.bx, c.by, band.e;
$$;

grant execute on function public.region_pins_density(
  uuid, double precision, double precision, double precision, double precision, int
) to authenticated;
