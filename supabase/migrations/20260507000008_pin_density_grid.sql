-- Pre-computed public-pin density grid for the heatmap toggle.
-- Aggregates all public-visibility pins into a small set of zoom-
-- banded grid cells (~5 bands, eps from 0.5° to 0.001°), so the
-- heatmap fetch path stops being viewport-bound to per-pin scans
-- of 35k+ rows. The grid is recomputed on demand via
-- refresh_pin_density() — call it after import runs.
--
-- Decision: public-pin-only for now. Personal regions are typically
-- small (~1k pins) so the live region_pins_bbox path is fast enough;
-- pre-computing a per-region grid is a future extension.

create table if not exists public.pin_density_grid (
  zoom_band int not null,
  bx int not null,
  by int not null,
  count_pins int not null,
  primary key (zoom_band, bx, by)
);

alter table public.pin_density_grid enable row level security;
drop policy if exists pin_density_grid_read_all on public.pin_density_grid;
create policy pin_density_grid_read_all
  on public.pin_density_grid for select
  to anon, authenticated
  using (true);

-- Cell size (in degrees) per zoom band. Coarse at low zoom so a
-- continental view shows few large patches; fine at high zoom so
-- street-level density still has meaningful resolution.
create or replace function public.eps_for_band(p_band int)
returns double precision
language sql
immutable
as $$
  select case p_band
    when 0 then 0.5::double precision     -- zoom 0–5, ~55 km cells
    when 1 then 0.1::double precision     -- zoom 6–7, ~11 km cells
    when 2 then 0.02::double precision    -- zoom 8–9, ~2.2 km cells
    when 3 then 0.005::double precision   -- zoom 10–11, ~550 m cells
    when 4 then 0.001::double precision   -- zoom 12+, ~110 m cells
    else 0.5::double precision
  end;
$$;

-- Map a real map zoom to the band that owns it.
create or replace function public.band_for_zoom(p_zoom int)
returns int
language sql
immutable
as $$
  select case
    when p_zoom < 6 then 0
    when p_zoom < 8 then 1
    when p_zoom < 10 then 2
    when p_zoom < 12 then 3
    else 4
  end;
$$;

-- Truncate + recompute the whole grid from public pins. Fast even
-- at ~35k pins because the GROUP BY collapses to a small set of
-- live cells per band. Call this from the import framework after
-- a successful run, or any time the public-pin set changes.
create or replace function public.refresh_pin_density()
returns void
language plpgsql
as $$
begin
  truncate public.pin_density_grid;
  insert into public.pin_density_grid (zoom_band, bx, by, count_pins)
  select
    b,
    floor(ST_X(p.location::geometry) / public.eps_for_band(b))::int as bx,
    floor(ST_Y(p.location::geometry) / public.eps_for_band(b))::int as by,
    count(*)::int
  from generate_series(0, 4) b
  cross join public.pins p
  where p.visibility = 'public'
  group by
    b,
    floor(ST_X(p.location::geometry) / public.eps_for_band(b))::int,
    floor(ST_Y(p.location::geometry) / public.eps_for_band(b))::int;
end;
$$;

-- Heatmap-fetch RPC. Caller gives the viewport bbox + the current
-- map zoom; we pick the right band and return cells that fall in
-- the bbox, with the cell-center coordinates so the client can
-- render directly without re-deriving them.
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
  centroid_lat double precision
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
    ((g.by::double precision + 0.5) * band.e) as centroid_lat
  from public.pin_density_grid g
  cross join band
  where g.zoom_band = band.b
    and ((g.bx::double precision + 0.5) * band.e) between p_min_lng and p_max_lng
    and ((g.by::double precision + 0.5) * band.e) between p_min_lat and p_max_lat;
$$;

grant execute on function public.public_pins_density(
  double precision, double precision, double precision, double precision, int
) to anon, authenticated;

-- Initial populate so the grid is non-empty immediately after the
-- migration applies. Future imports should re-run refresh_pin_density.
select public.refresh_pin_density();
