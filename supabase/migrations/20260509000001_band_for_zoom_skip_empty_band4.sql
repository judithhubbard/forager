-- z12 returned an empty heatmap because band_for_zoom(12) maps to
-- band 4 (eps 0.001° / ~111m), but pin_density_grid never populated
-- band 4 — too many cells to materialize, and 100m resolution would
-- be ridiculous for a heatmap rendering anyway.
--
-- Drop band 4 from the schedule. At z12 (still heatmap mode, since
-- CLUSTER_BELOW_ZOOM = 13) fall back to band 3 (eps 0.005° / ~550m),
-- which is already populated (45k cells) and renders fine. Above z13
-- the client switches to individual-pin mode anyway, so band 4 was
-- unreachable in practice even if it were populated.

create or replace function public.band_for_zoom(p_zoom int)
returns int
language sql
immutable
as $$
  select case
    when p_zoom < 5 then 0
    when p_zoom < 8 then 1
    when p_zoom < 10 then 2
    else 3
  end;
$$;
