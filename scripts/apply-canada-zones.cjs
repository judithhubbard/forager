// Load NRCan Canadian Plant Hardiness Zone polygons into
// usda_hardiness_zones. Idempotent: removes any existing
// 'NRCan-*' rows before re-inserting.
//
// Source data: data/raw/canada-zones/canada-zones-simplified.geojson
// (downloaded + reprojected from
// https://ftp.maps.canada.ca/pub/nrcan_rncan/Geographical-maps_Carte-geographique/
// Plant-Hardiness-Zones_Zones-rusticite/Shapefiles/PlantHardinessZones_SHP_EN.zip
// then `mapshaper -proj wgs84 -simplify 3% keep-shapes`).
//
// Run after migration 20260508000067 has been applied (climate_zones
// rows for 0a-2b + the `source` column on usda_hardiness_zones).

const fs = require('node:fs');
const path = require('node:path');
const postgres = require('postgres');
const { config } = require('dotenv');
config({ path: path.resolve(__dirname, '..', '.env.local') });

const SOURCE_TAG = 'NRCan-2024';

(async () => {
  const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined });

  const filePath = path.resolve(
    __dirname, '..', 'data/raw/canada-zones/canada-zones-simplified.geojson'
  );
  const geojson = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  console.log(`loaded ${geojson.features.length} features from ${path.basename(filePath)}`);

  // Idempotent: drop any prior NRCan rows so re-runs replace cleanly.
  const removed = await sql`
    delete from public.usda_hardiness_zones
     where source = ${SOURCE_TAG}
    returning id
  `;
  console.log(`removed ${removed.length} prior NRCan rows`);

  let inserted = 0;
  for (const f of geojson.features) {
    const zone = f.properties.ph_zone;
    if (!zone) continue;
    const g = f.geometry;
    // The table column is MultiPolygon. Each NRCan feature is already
    // MultiPolygon; pass through ST_GeomFromGeoJSON which handles it.
    await sql`
      insert into public.usda_hardiness_zones (zone_code, state, geom, source)
      values (
        ${zone},
        'Canada',
        ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(g)}), 4326))::geometry(MultiPolygon, 4326),
        ${SOURCE_TAG}
      )
    `;
    inserted++;
  }
  console.log(`inserted ${inserted} NRCan rows`);

  // Spot-check: verify Toronto, Vancouver, Montreal, Calgary land in the
  // expected zones. Numbers per NRCan's own published map.
  const expectations = [
    { name: 'Toronto',   lat: 43.65, lng: -79.38, expect: ['6b', '7a'] },
    { name: 'Vancouver', lat: 49.28, lng: -123.12, expect: ['8a', '8b'] },
    { name: 'Montreal',  lat: 45.50, lng: -73.57, expect: ['5a', '5b', '6a'] },
    { name: 'Calgary',   lat: 51.05, lng: -114.07, expect: ['3a', '3b', '4a'] },
    { name: 'Winnipeg',  lat: 49.90, lng: -97.14, expect: ['3a', '3b', '4a'] }
  ];
  console.log('\nspot checks:');
  for (const x of expectations) {
    const r = await sql`
      select zone_code from public.usda_hardiness_zones
       where source = ${SOURCE_TAG}
         and ST_Intersects(geom, ST_SetSRID(ST_MakePoint(${x.lng}, ${x.lat}), 4326))
       limit 1
    `;
    const zone = r[0]?.zone_code ?? '(none)';
    const ok = x.expect.includes(zone) ? '✓' : '✗';
    console.log(`  ${ok} ${x.name} -> ${zone}  (expected ${x.expect.join('|')})`);
  }

  await sql.end();
})();
