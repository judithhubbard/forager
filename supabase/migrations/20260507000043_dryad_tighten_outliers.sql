-- Tighter outlier cleanup for Dryad city-tree imports.
--
-- Migration 36 dropped Dryad pins beyond 200km from each source's
-- pin-cluster centroid. That threshold was way too generous: pins
-- a hundred km from a city's actual location stayed in the data
-- (e.g. Rochester pins landing in the Cayuga Lake area, ~110km away),
-- and the centroid-of-pins approach is fooled by bimodal distributions
-- where bad rows pull the centroid away from the real city.
--
-- This migration uses hardcoded official city centroids (from Wikipedia
-- / OSM) and a 30km threshold. Real metros are typically <30km across;
-- a 30km radius around city center comfortably encompasses suburbs
-- without admitting cross-state landings.
--
-- Audit (data/exploration AUDIT-REPORT.md and scripts/audit-dryad-distances.cjs):
--   - 10,753 dryad pins are >25km from their pin-cluster centroid
--   - 2,835 are >50km
--   - Worst per-city outliers were Rochester (194km), Houston (195km),
--     Ontario (178km), Providence (138km).
--
-- Per-city threshold could be tighter for small cities and looser
-- for big sprawling metros (LA, Houston) but a uniform 30km is a
-- defensible single-pass cleanup. Re-run with a tighter threshold
-- via a follow-up migration if specific cities still show outliers.

create temp table dryad_centroids (source_id text primary key, lat double precision, lng double precision);
insert into dryad_centroids values
  ('dryad-trees-albuquerque',       35.0844, -106.6510),
  ('dryad-trees-anaheim',           33.8366, -117.9143),
  ('dryad-trees-arlington',         32.7357,  -97.1081),
  ('dryad-trees-atlanta',           33.7490,  -84.3880),
  ('dryad-trees-aurora-co',         39.7294, -104.8319),
  ('dryad-trees-austin',            30.2672,  -97.7431),
  ('dryad-trees-baltimore',         39.2904,  -76.6122),
  ('dryad-trees-buffalo',           42.8864,  -78.8784),
  ('dryad-trees-cape-coral',        26.5629,  -81.9495),
  ('dryad-trees-colorado-springs',  38.8339, -104.8214),
  ('dryad-trees-columbus',          39.9612,  -82.9988),
  ('dryad-trees-denver',            39.7392, -104.9903),
  ('dryad-trees-des-moines',        41.5868,  -93.6250),
  ('dryad-trees-detroit',           42.3314,  -83.0458),
  ('dryad-trees-durham',            35.9940,  -78.8986),
  ('dryad-trees-garden-grove',      33.7739, -117.9415),
  ('dryad-trees-greensboro',        36.0726,  -79.7920),
  ('dryad-trees-honolulu',          21.3069, -157.8583),
  ('dryad-trees-houston',           29.7604,  -95.3698),
  ('dryad-trees-huntington-beach',  33.6595, -117.9988),
  ('dryad-trees-knoxville',         35.9606,  -83.9207),
  ('dryad-trees-las-vegas',         36.1699, -115.1398),
  ('dryad-trees-los-angeles',       34.0522, -118.2437),
  ('dryad-trees-louisville',        38.2527,  -85.7585),
  ('dryad-trees-madison',           43.0731,  -89.4012),
  ('dryad-trees-milwaukee',         43.0389,  -87.9065),
  ('dryad-trees-minneapolis',       44.9778,  -93.2650),
  ('dryad-trees-nashville',         36.1627,  -86.7816),
  ('dryad-trees-oakland',           37.8044, -122.2712),
  ('dryad-trees-oklahoma-city',     35.4676,  -97.5164),
  ('dryad-trees-ontario',           34.0633, -117.6509),  -- Ontario, CA
  ('dryad-trees-overland-park',     38.9822,  -94.6708),
  ('dryad-trees-pittsburgh',        40.4406,  -79.9959),
  ('dryad-trees-portland',          45.5152, -122.6784),
  ('dryad-trees-providence',        41.8240,  -71.4128),
  ('dryad-trees-rancho-cucamonga',  34.1064, -117.5931),
  ('dryad-trees-rochester',         43.1566,  -77.6088),
  ('dryad-trees-sacramento',        38.5816, -121.4944),
  ('dryad-trees-san-diego',         32.7157, -117.1611),
  ('dryad-trees-san-jose',          37.3382, -121.8863),
  ('dryad-trees-santa-rosa',        38.4404, -122.7141),
  ('dryad-trees-seattle',           47.6062, -122.3321),
  ('dryad-trees-sioux-falls',       43.5446,  -96.7311),
  ('dryad-trees-st-louis',          38.6270,  -90.1994),
  ('dryad-trees-stockton',          37.9577, -121.2908),
  ('dryad-trees-tampa',             27.9506,  -82.4572),
  ('dryad-trees-washington-dc',     38.8951,  -77.0364);

-- Disable the visibility-gate trigger and density-grid triggers for
-- the bulk delete (same pattern as migrations 36 and 40).
alter table public.pins disable trigger tg_gate_public_pins;
alter table public.pins disable trigger tg_pin_density_track_ins;
alter table public.pins disable trigger tg_pin_density_track_upd;
alter table public.pins disable trigger tg_pin_density_track_del;

-- Per-source 30km outlier delete. Pins from sources we don't have
-- a hardcoded centroid for are left untouched (none currently — all
-- 47 dryad sources have entries above).
with dropped as (
  delete from public.pins p
        using dryad_centroids c
        where p.import_source = c.source_id
          and ST_Distance(
                p.location,
                ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography
              ) > 30000
        returning 1
)
select count(*) as deleted from dropped;

alter table public.pins enable trigger tg_gate_public_pins;
alter table public.pins enable trigger tg_pin_density_track_ins;
alter table public.pins enable trigger tg_pin_density_track_upd;
alter table public.pins enable trigger tg_pin_density_track_del;

-- Refresh the heatmap grid so density reflects the cleanup.
select public.refresh_pin_density();
