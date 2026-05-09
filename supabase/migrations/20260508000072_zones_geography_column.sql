-- Speed up Canadian-pin zone backfill by precomputing a geography
-- column on usda_hardiness_zones. Per-row casts of `uhz.geom::geography`
-- in the bulk update were the actual hot spot — each cast walks the
-- full polygon (10-30k vertices for the bigger NRCan zones), and the
-- planner ran the cast once per matching pin. With a stored geography
-- column + GIST index, the cast happens once per polygon at fill time
-- and the per-row spatial join uses the index directly.
--
-- Also drops the Arctic NRCan polygons (0a-2b). They cover Yukon /
-- Nunavut where essentially zero pins exist; including them in the
-- backfill costs work without producing assignments. If a future
-- import puts pins up there, this can be re-run.

alter table public.usda_hardiness_zones
  add column if not exists geog geography(MultiPolygon, 4326);

-- Cast each row's geom into the new geog column. 37 rows, ~30 sec
-- total in practice — well under the 2-min statement timeout.
update public.usda_hardiness_zones
   set geog = geom::geography
 where geog is null;

create index if not exists usda_zones_geog_idx
  on public.usda_hardiness_zones using gist (geog);

-- Drop Arctic NRCan polygons. ~0 pins live in their bbox and the
-- spatial check on them is expensive (8-25k vertex polygons).
delete from public.usda_hardiness_zones
 where source = 'NRCan-2024'
   and zone_code in ('0a', '0b', '1a', '1b', '2a', '2b');
