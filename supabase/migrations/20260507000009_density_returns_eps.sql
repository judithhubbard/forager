-- public_pins_density now also returns the cell eps (the band's
-- grid size in degrees), so the client doesn't have to mirror the
-- band schedule. Without this, a fetch in flight while the user
-- zooms across a band boundary could render with stale sizing and
-- look like half the heatmap had disappeared.
--
-- Changes the function's return shape, so we drop and recreate
-- (CREATE OR REPLACE can't add a column to the return table).

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
    band.e as cell_eps
  from public.pin_density_grid g
  cross join band
  where g.zoom_band = band.b
    and ((g.bx::double precision + 0.5) * band.e) between p_min_lng and p_max_lng
    and ((g.by::double precision + 0.5) * band.e) between p_min_lat and p_max_lat;
$$;

grant execute on function public.public_pins_density(
  double precision, double precision, double precision, double precision, int
) to anon, authenticated;
