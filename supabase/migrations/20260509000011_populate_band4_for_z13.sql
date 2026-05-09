-- Populate band 4 (eps 0.001° = ~73m at lat 43) in pin_density_grid
-- and update band_for_zoom so z13 uses the finer grid. Previously z13
-- mapped to band 3 (~550m cells) which rendered as ~115 screen pixels
-- per cell — visibly blocky.
--
-- Now: z13 → band 4 (~13 px per cell at lat 43, comparable to z14
-- individual-pin cell size). Heatmap stays sub-second because the
-- per-cell aggregation is precomputed.
--
-- One-time aggregation across all ~2.7M public pins. Idempotent via
-- ON CONFLICT.

insert into public.pin_density_grid (zoom_band, bx, by, count_pins)
select 4,
       floor(ST_X(p.location::geometry) / public.eps_for_band(4))::int as bx,
       floor(ST_Y(p.location::geometry) / public.eps_for_band(4))::int as by,
       count(*)::int
  from public.pins p
 where p.visibility = 'public'
 group by bx, by
on conflict (zoom_band, bx, by) do update
  set count_pins = excluded.count_pins;

create or replace function public.band_for_zoom(p_zoom int)
returns int
language sql
immutable
as $$
  select case
    when p_zoom < 5  then 0
    when p_zoom < 8  then 1
    when p_zoom < 10 then 2
    when p_zoom < 13 then 3
    else 4
  end;
$$;
