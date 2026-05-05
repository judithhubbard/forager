// Import the Cornell Campus Tree Inventory.
//
// Source: https://cugir.library.cornell.edu/catalog/cugir-009100
// CUGIR provides multiple distributions; we expect a GeoJSON feature
// collection.
//
// Run with:
//   npm run import:cornell -- --file ./path/to/cornell-cti.geojson
//
// To download: visit the CUGIR catalog page above, click the GeoJSON
// download. Save to data/raw/cornell-cti.geojson (gitignored).

import postgres from 'postgres';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import {
  registerImportSource,
  startImportRun,
  finishImportRun,
  loadSpecies,
  matchSpecies,
  upsertImportedPin,
  type ImportRecord,
  type ImportRunSummary
} from './lib/upsert';

loadEnv({ path: resolve(process.cwd(), '.env.local') });
loadEnv({ path: resolve(process.cwd(), '.env') });

const SOURCE_ID = 'cornell-cti';
const SOURCE_NAME = 'Cornell Campus Tree Inventory';
const SOURCE_URL = 'https://cugir.library.cornell.edu/catalog/cugir-009100';

interface GeoJsonFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: Record<string, unknown>;
}

interface GeoJsonCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function pickStr(props: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = props[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

/** Map a Cornell feature to our generic ImportRecord. Field names are
 *  best-effort; CUGIR data may use different casings. */
function mapFeature(f: GeoJsonFeature): ImportRecord | null {
  const [lng, lat] = f.geometry.coordinates;
  if (typeof lng !== 'number' || typeof lat !== 'number') return null;

  const props = f.properties ?? {};
  const externalId =
    pickStr(props, ['tree_id', 'TREE_ID', 'TreeID', 'OBJECTID', 'objectid']) ??
    `${lng.toFixed(6)},${lat.toFixed(6)}`;

  const scientificName = pickStr(props, [
    'sci_name',
    'SCI_NAME',
    'scientific_name',
    'ScientificName',
    'BOTANICAL'
  ]);
  const commonName = pickStr(props, [
    'common_name',
    'COMMON_NAME',
    'CommonName',
    'COMMON',
    'name'
  ]);

  return {
    externalId,
    scientificName,
    commonName,
    lng,
    lat,
    raw: props
  };
}

async function main() {
  const filePath = getArg('file');
  if (!filePath) {
    console.error(
      'Usage: npm run import:cornell -- --file ./data/raw/cornell-cti.geojson\n' +
        '\nDownload the dataset from:\n  ' +
        SOURCE_URL +
        '\nAnd save the GeoJSON distribution to a local path.'
    );
    process.exit(1);
  }

  const dbUrl = process.env.SUPABASE_DB_URL;
  const userId = process.env.FORAGER_DEV_USER_ID;
  if (!dbUrl) throw new Error('SUPABASE_DB_URL missing.');
  if (!userId) throw new Error('FORAGER_DEV_USER_ID missing (admin user for attribution).');

  const text = await readFile(resolve(filePath), 'utf8');
  const collection = JSON.parse(text) as GeoJsonCollection;
  if (collection.type !== 'FeatureCollection') {
    throw new Error('Expected a GeoJSON FeatureCollection.');
  }
  console.log(`Loaded ${collection.features.length} features from ${filePath}`);

  const sql = postgres(dbUrl, { ssl: 'require', onnotice: () => undefined });

  try {
    const { regionId } = await registerImportSource(sql, {
      sourceId: SOURCE_ID,
      name: SOURCE_NAME,
      url: SOURCE_URL,
      description: 'Cornell University Geospatial Information Repository — campus tree inventory.',
      regionName: 'Ithaca shared'
    });

    // Take an advisory lock so two admins cannot run this simultaneously.
    await sql`select pg_advisory_lock(hashtext(${`${regionId}:${SOURCE_ID}`}))`;

    const runId = await startImportRun(sql, SOURCE_ID, userId);
    const summary: ImportRunSummary = {
      pinsCreated: 0,
      pinsUpdated: 0,
      pinsSkippedUnmatched: 0,
      errors: []
    };

    const species = await loadSpecies(sql);

    for (const feature of collection.features) {
      const rec = mapFeature(feature);
      if (!rec) continue;

      const sp = matchSpecies(species, rec);
      if (!sp) {
        summary.pinsSkippedUnmatched++;
        continue;
      }

      try {
        const result = await upsertImportedPin(sql, {
          regionId,
          sourceId: SOURCE_ID,
          externalId: rec.externalId,
          speciesId: sp.id,
          lng: rec.lng,
          lat: rec.lat,
          raw: rec.raw,
          userId
        });
        if (result.created) summary.pinsCreated++;
        else summary.pinsUpdated++;
      } catch (err) {
        summary.errors.push({
          externalId: rec.externalId,
          message: err instanceof Error ? err.message : String(err)
        });
      }
    }

    await finishImportRun(sql, runId, summary);
    await sql`select pg_advisory_unlock(hashtext(${`${regionId}:${SOURCE_ID}`}))`;

    console.log('\nImport complete:');
    console.log(`  created:   ${summary.pinsCreated}`);
    console.log(`  updated:   ${summary.pinsUpdated}`);
    console.log(`  skipped:   ${summary.pinsSkippedUnmatched} (not in forageable list)`);
    console.log(`  errors:    ${summary.errors.length}`);
    if (summary.errors.length > 0) {
      console.log(JSON.stringify(summary.errors.slice(0, 5), null, 2));
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('Cornell import failed:', err);
  process.exit(1);
});
