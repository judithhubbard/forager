-- USDA Plant Hardiness Zones updated to the 2023 / PRISM release.
--
-- The polygon replacement + per-pin re-zoning happens in the
-- companion node script `scripts/apply-usda-2023.cjs`. This SQL
-- file exists only to record the migration in the schema-migrations
-- table — the GeoJSON source (~12MB) is too large to inline here,
-- and re-running the node script is idempotent.
--
-- Effects of this migration:
--   * usda_hardiness_zones polygons swap from OPHZ-2012 to PRISM-2023.
--   * pins.climate_zone_id is recomputed for every pin. Most of the
--     eastern US shifted warmer by ~½ zone (Ithaca 5b → 6a).
--   * The static /usda-zones.geojson overlay is regenerated from the
--     2023 source separately (build-time or commit-time).
--
-- Attribution: PRISM Climate Group at Oregon State University,
--              USDA-ARS. Public-domain raster derivation; redist
--              with credit. Already added to /sources page.

select 1;  -- no-op; see scripts/apply-usda-2023.cjs
