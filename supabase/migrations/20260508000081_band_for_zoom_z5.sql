-- Heatmap band schedule: push z5 from band 0 (0.5° / ~55km cells)
-- down to band 1 (0.1° / ~11km cells). At zoom 5 the dataset
-- covers most of CONUS / Canada in view; band 0 was rendering as
-- coarse country-sized blocks that obscured city-level density.
-- Band 1 is the same one z6 uses, so the data already exists in
-- pin_density_grid — no refresh needed.

create or replace function public.band_for_zoom(p_zoom int)
returns int
language sql
immutable
as $$
  select case
    when p_zoom < 5 then 0
    when p_zoom < 8 then 1
    when p_zoom < 10 then 2
    when p_zoom < 12 then 3
    else 4
  end;
$$;
