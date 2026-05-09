-- Backfill pin climate_zone_id for ~1.4M public pins (mostly Canadian
-- cities — Calgary, Edmonton, Winnipeg, Ottawa, Hamilton, Toronto)
-- whose pin imports never had their zones populated. The original
-- pin_in_window-on-the-fly fallback (mig #51) made queries work,
-- but anywhere code reads pin.climate_zone_id directly (e.g.,
-- joining to species_fruiting_windows for the calibration data),
-- those pins were invisible to the per-zone harvest windows.
--
-- The naive per-row update timed out at the statement_timeout limit
-- because the multipolygons (NRCan zone 3a covers most of northern
-- Canada) make ST_Contains expensive — even with a GIST index, the
-- per-pin point-in-polygon check on a complex geometry is slow.
--
-- Solution: ST_Subdivide the polygons into ~256-vertex pieces first
-- (also fixes invalid topologies via ST_MakeValid), then bulk
-- spatial-join. Pieces are small so each ST_Contains is fast.
-- Whole backfill ran in ~4 minutes.
--
-- Idempotent: re-runs only update rows where climate_zone_id is
-- still NULL. Triggers bypassed inside this migration to avoid the
-- per-row pin_density_grid trigger storm; grid is rebuilt at the end.

set local statement_timeout = 0;
set local session_replication_role = replica;

create temp table tmp_subdivided_zones as
select cz.id as climate_zone_id,
       ST_Subdivide(ST_MakeValid(uhz.geom), 256) as geom
  from public.usda_hardiness_zones uhz
  join public.climate_zones cz on cz.code = uhz.zone_code;

create index on tmp_subdivided_zones using gist(geom);
analyze tmp_subdivided_zones;

update public.pins p
   set climate_zone_id = sz.climate_zone_id
  from tmp_subdivided_zones sz
 where p.climate_zone_id is null
   and ST_Contains(sz.geom, p.location::geometry);

drop table tmp_subdivided_zones;

-- Rebuild pin_density_grid from scratch since per-row triggers were
-- bypassed during the bulk update.
truncate public.pin_density_grid;
insert into public.pin_density_grid (zoom_band, bx, by, count_pins)
select b,
       floor(ST_X(p.location::geometry) / public.eps_for_band(b))::int,
       floor(ST_Y(p.location::geometry) / public.eps_for_band(b))::int,
       count(*)::int
  from generate_series(0, 4) b
  cross join public.pins p
 where p.visibility = 'public'
 group by b, 2, 3;
