-- Canadian Plant Hardiness Zones (NRCan 4th edition, 1991-2020).
-- Source: https://open.canada.ca/data/en/dataset/adda404d-93e4-48e9-b6bf-5d1d3952ff22
-- Government of Canada — Open Government Licence (free reuse).
--
-- NRCan zone codes overlap numerically with USDA codes (3a-9a) but the
-- underlying formula differs: NRCan factors in winter min, frost-free
-- period, summer rainfall, summer warmth, snow cover, max wind. The
-- numerical equivalence to USDA is approximate (within 0-1 zone for
-- most of populated Canada). For our harvest-window estimator, that's
-- close enough — we'll re-use the same climate_zones rows so a Toronto
-- pin in NRCan 6b uses the frost-offset windows derived from the
-- USDA 6a anchor. NRCan also defines colder zones (0a-2b) that USDA
-- doesn't reach; pre-seed those climate_zones rows so the lookup
-- doesn't return null.
--
-- The polygons themselves are loaded by scripts/apply-canada-zones.cjs
-- (geojson → ST_GeomFromGeoJSON → MultiPolygon insert) — too large to
-- inline as DDL.

insert into public.climate_zones (code, name)
values
  ('0a', 'NRCan Plant Hardiness Zone 0a'),
  ('0b', 'NRCan Plant Hardiness Zone 0b'),
  ('1a', 'NRCan Plant Hardiness Zone 1a'),
  ('1b', 'NRCan Plant Hardiness Zone 1b'),
  ('2a', 'NRCan Plant Hardiness Zone 2a'),
  ('2b', 'NRCan Plant Hardiness Zone 2b')
on conflict (code) do nothing;

-- Tag rows with their source so a future migration can swap NRCan
-- editions without touching USDA rows. Defaults to 'USDA-2023' for
-- existing rows; the apply script sets 'NRCan-2024' for Canadian.
alter table public.usda_hardiness_zones
  add column if not exists source text;

update public.usda_hardiness_zones
   set source = 'USDA-2023'
 where source is null;

create index if not exists usda_zones_source_idx
  on public.usda_hardiness_zones (source);
