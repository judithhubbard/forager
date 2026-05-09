-- Layer 1 empirical fruiting window for Morchella esculenta from
-- The Great Morel community sighting tracker (thegreatmorel.com).
--
-- Source: per-year GeoJSON exports (layers 2..72 across years 2017-2026).
-- Crowd-sourced sightings, markers dropped at zip-centroid (not GPS).
-- All Morchella lumped at the source -> attached to Morchella esculenta
-- (the catalog's only Morchella entry).
--
-- Aggregation: per USDA zone, compute median/p10/p90 DOY and require
-- n_sightings>=20, n_distinct_zips>=5, n_distinct_years>=2 to qualify.
-- No leading-edge offset: hunters report when they FIND mushrooms,
-- which IS the harvest signal.
--
-- start_doy = p10, peak_doy = median, end_doy = p90.
--
-- Generator: scripts/morel-sightings-ingest.cjs
-- Process documented in data/exploration/great-morel-summary.md

begin;

-- New confidence value for community-reported sighting medians.
alter type public.window_confidence add value if not exists 'empirical_community';

commit;

-- Postgres requires a separate transaction before reading a freshly-added enum value.
begin;

-- (no peak_doy fill-ins — no regional_guide rows existed for this species)

-- ---- 1. New empirical_community rows for zones with no regional_guide coverage ----

insert into public.species_fruiting_windows
  (species_id, climate_zone_id, stage, start_doy, end_doy, peak_doy, confidence, notes)
select s.id, z.id, 'ripe'::public.stage, t.start_doy, t.end_doy, t.peak_doy,
       'empirical_community'::public.window_confidence, t.note
from (values
    ('3b', 125, 145, 137, 'The Great Morel: n_sightings=41, zips=38, years=10, range 125-145'),
    ('4a', 123, 151, 134, 'The Great Morel: n_sightings=92, zips=75, years=10, range 123-151'),
    ('4b', 119, 145, 131, 'The Great Morel: n_sightings=402, zips=331, years=10, range 119-145'),
    ('5a', 111, 141, 126, 'The Great Morel: n_sightings=870, zips=708, years=10, range 111-141'),
    ('5b', 106, 137, 122, 'The Great Morel: n_sightings=1172, zips=970, years=10, range 106-137'),
    ('6a', 98, 131, 116, 'The Great Morel: n_sightings=2508, zips=2051, years=10, range 98-131'),
    ('6b', 92, 127, 108, 'The Great Morel: n_sightings=2356, zips=1965, years=10, range 92-127'),
    ('7a', 83, 122, 102, 'The Great Morel: n_sightings=1556, zips=1303, years=10, range 83-122'),
    ('7b', 78, 114, 97, 'The Great Morel: n_sightings=1026, zips=878, years=10, range 78-114'),
    ('8a', 69, 105, 86, 'The Great Morel: n_sightings=573, zips=490, years=10, range 69-105'),
    ('8b', 68, 118, 92, 'The Great Morel: n_sightings=289, zips=259, years=10, range 68-118'),
    ('9a', 81, 122, 100, 'The Great Morel: n_sightings=94, zips=78, years=10, range 81-122'),
    ('9b', 58, 112, 88, 'The Great Morel: n_sightings=28, zips=28, years=10, range 58-112'),
    ('10a', 41, 134, 89, 'The Great Morel: n_sightings=30, zips=27, years=9, range 41-134'),
    ('10b', 37, 123, 72, 'The Great Morel: n_sightings=20, zips=19, years=7, range 37-123')
) as t(zone, start_doy, end_doy, peak_doy, note)
join public.climate_zones z on z.code = t.zone
cross join public.species s
where s.scientific_name = 'Morchella esculenta'
  and not exists (
    select 1 from public.species_fruiting_windows w
    where w.species_id = s.id and w.climate_zone_id = z.id and w.stage = 'ripe'
  );

commit;
