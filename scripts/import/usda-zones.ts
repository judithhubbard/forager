// Loads USDA Plant Hardiness Zone polygons into PostGIS via the
// OPHZ dataset (kgjenkins/ophz) — public-domain vector
// reconstruction of the USDA 2012 map. Conterminous US only; the
// repo ships per-state GeoJSON, total ~78MB across 49 files.
//
// Idempotent: TRUNCATEs usda_hardiness_zones and reinserts. Run
// once after migration 22, then again whenever the upstream
// dataset version bumps.
//
// Run:
//   npm run import:usda-zones
//
// Requires:
//   SUPABASE_DB_URL env var (same as other importers)
// PostGIS function ST_GeomFromGeoJSON is used for the geometry
// conversion at insert time, so the script never needs to compute
// geometry itself — just pipes the GeoJSON Feature objects in.

import postgres from 'postgres';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: resolve(process.cwd(), '.env.local') });
loadEnv({ path: resolve(process.cwd(), '.env') });

const STATES = [
  'AL', 'AR', 'AZ', 'CA', 'CO', 'CT', 'DC', 'DE', 'FL', 'GA',
  'IA', 'ID', 'IL', 'IN', 'KS', 'KY', 'LA', 'MA', 'MD', 'ME',
  'MI', 'MN', 'MO', 'MS', 'MT', 'NC', 'ND', 'NE', 'NH', 'NJ',
  'NM', 'NV', 'NY', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD',
  'TN', 'TX', 'UT', 'VA', 'VT', 'WA', 'WI', 'WV', 'WY'
];

const URL_BASE = 'https://raw.githubusercontent.com/kgjenkins/ophz/master/geojson/ophz_';

interface Feature {
  type: 'Feature';
  properties: { ZONE?: string; STUSPS?: string };
  geometry: { type: string; coordinates: unknown };
}
interface FeatureCollection {
  type: 'FeatureCollection';
  features: Feature[];
}

async function fetchState(state: string): Promise<FeatureCollection> {
  const res = await fetch(`${URL_BASE}${state}.geojson`);
  if (!res.ok) throw new Error(`fetch ${state}: HTTP ${res.status}`);
  return (await res.json()) as FeatureCollection;
}

async function main(): Promise<void> {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) throw new Error('SUPABASE_DB_URL missing.');
  const sql = postgres(dbUrl, { ssl: 'require', onnotice: () => undefined });
  try {
    console.log('Truncating usda_hardiness_zones …');
    await sql`truncate public.usda_hardiness_zones`;

    let total = 0;
    for (const state of STATES) {
      process.stdout.write(`  ${state} … `);
      const fc = await fetchState(state);
      const features = fc.features ?? [];
      // Batch up the inserts. Each row uses ST_GeomFromGeoJSON to
      // turn the geometry string into PostGIS, then ST_Multi to
      // normalize Polygon/MultiPolygon into a single column type.
      const BATCH = 50;
      for (let i = 0; i < features.length; i += BATCH) {
        const slice = features.slice(i, i + BATCH);
        const zones  = slice.map((f) => f.properties.ZONE ?? null);
        const states = slice.map((f) => f.properties.STUSPS ?? state);
        const geoms  = slice.map((f) => JSON.stringify(f.geometry));
        await sql`
          insert into public.usda_hardiness_zones (zone_code, state, geom)
          select z, st, ST_Multi(ST_GeomFromGeoJSON(g))::geometry(MultiPolygon, 4326)
            from unnest(
              ${zones}::text[],
              ${states}::text[],
              ${geoms}::text[]
            ) as t(z, st, g)
           where z is not null
        `;
      }
      total += features.length;
      console.log(`${features.length} polygons`);
    }
    console.log(`\nLoaded ${total} polygons across ${STATES.length} states.`);

    // Distinct zones loaded — sanity check.
    const zones = await sql`
      select zone_code, count(*)::int as n
        from public.usda_hardiness_zones
       group by zone_code order by zone_code`;
    console.log('Zone breakdown:');
    for (const z of zones) console.log(`  ${z.zone_code}: ${z.n}`);

    // Quick smoke test: zone_for_point on known cities.
    console.log('\nSmoke test:');
    const tests: Array<{ name: string; lng: number; lat: number; expected: string }> = [
      { name: 'Ithaca, NY',     lng: -76.50, lat: 42.44, expected: '5b/6a' },
      { name: 'NYC',            lng: -74.00, lat: 40.71, expected: '7a/7b' },
      { name: 'Phoenix, AZ',    lng: -112.07, lat: 33.45, expected: '9b/10a' },
      { name: 'Seattle, WA',    lng: -122.33, lat: 47.61, expected: '8b/9a' },
      { name: 'Minneapolis, MN', lng: -93.27, lat: 44.98, expected: '4b/5a' }
    ];
    for (const t of tests) {
      const r = await sql`select public.zone_for_point(${t.lng}, ${t.lat}) as zone`;
      console.log(`  ${t.name}: ${r[0].zone} (expected ${t.expected})`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('USDA zone import failed:', err);
  process.exit(1);
});
