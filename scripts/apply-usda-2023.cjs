// Replace OPHZ 2012 polygons in usda_hardiness_zones with the 2023
// USDA / PRISM update. Recomputes pins.climate_zone_id for every
// pin so existing data shifts to the new zone (most of the eastern
// US went warmer by ~½ zone — Ithaca 5b → 6a).
//
// Source: https://prism.oregonstate.edu/phzm/data/2023/phzm_us_zones_shp_2023.zip
// Conversion: data/raw/usda-2023/usda-zones-2023-db.geojson
//   (mapshaper, 8% simplification, keep-shapes — preserves all 19
//    half-zone polygons, 12MB GeoJSON, fine for a one-shot load).
//
// Attribution requirement: PRISM/OSU expects USDA-ARS + OSU credit
// when the data is shown. Already added to /sources page.

const postgres = require('postgres');
const fs = require('node:fs');
const path = require('node:path');
const { config } = require('dotenv');

config({ path: path.resolve(__dirname, '..', '.env.local') });

const GEOJSON_PATH = path.resolve(__dirname, '..', 'data/raw/usda-2023/usda-zones-2023-db.geojson');

(async () => {
  const sql = postgres(process.env.SUPABASE_DB_URL, {
    ssl: 'require',
    onnotice: () => undefined,
    max: 1
  });
  try {
    const geojson = JSON.parse(fs.readFileSync(GEOJSON_PATH, 'utf8'));
    if (geojson.type !== 'FeatureCollection') {
      throw new Error('expected FeatureCollection');
    }
    console.log(`Loaded ${geojson.features.length} polygons from 2023 dataset.`);

    const before = await sql`select count(*)::int as n from public.usda_hardiness_zones`;
    console.log(`Current usda_hardiness_zones: ${before[0].n} rows (OPHZ 2012)`);

    // Replace polygons. Not in a transaction so the trigger-disable
    // dance below sees the new rows, but we keep the truncate+insert
    // close together so any read during the swap sees a consistent
    // state (worst case: a brief "no zones" gap).
    await sql`truncate table public.usda_hardiness_zones`;

    let inserted = 0;
    for (const f of geojson.features) {
      const zone = f.properties?.zone;
      if (!zone) continue;
      const geom = JSON.stringify(f.geometry);
      // ST_Multi forces MultiPolygon even when a single Polygon comes
      // through; the column type is geometry(MultiPolygon, 4326).
      await sql`
        insert into public.usda_hardiness_zones (zone_code, state, geom)
        values (
          ${zone}::text,
          null,
          ST_Multi(ST_GeomFromGeoJSON(${geom}::text))
        )
      `;
      inserted++;
    }
    console.log(`Inserted ${inserted} polygons.`);

    // Recompute pins.climate_zone_id for all rows. The maintenance
    // trigger fires on insert/update OF location — but we want every
    // pin to re-resolve regardless of whether its location changed,
    // so call zone_for_point() directly in a single UPDATE.
    console.log('Recomputing climate_zone_id for all pins…');
    await sql`alter table public.pins disable trigger tg_pin_density_track_upd`;
    const updated = await sql`
      with new_zone as (
        select p.id,
               (select cz.id
                  from public.climate_zones cz
                 where cz.code = public.zone_for_point(
                         ST_X(p.location::geometry),
                         ST_Y(p.location::geometry)
                       )
                 limit 1) as new_climate_zone_id
          from public.pins p
      )
      update public.pins p
         set climate_zone_id = new_zone.new_climate_zone_id
        from new_zone
       where p.id = new_zone.id
         and p.climate_zone_id is distinct from new_zone.new_climate_zone_id
       returning p.id
    `;
    await sql`alter table public.pins enable trigger tg_pin_density_track_upd`;
    console.log(`Re-zoned ${updated.length.toLocaleString()} pins.`);

    // Quick spot check: Ithaca should now be zone 6a (was 5b).
    const ithaca = await sql`
      select public.zone_for_point(-76.5, 42.45) as zone
    `;
    console.log(`Spot check: Ithaca centroid (-76.5, 42.45) is now zone ${ithaca[0].zone}`);

    // Mark migration as applied (the SQL migration file just contains
    // a comment — the work happens in this script).
    await sql`
      insert into supabase_migrations.schema_migrations (version)
      values ('20260508000048') on conflict (version) do nothing
    `;
    console.log('Done.');
  } finally {
    await sql.end();
  }
})().catch((e) => { console.error(e); process.exit(1); });
