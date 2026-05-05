// Import the City of Ithaca Tree Inventory.
//
// Source: https://www.cityofithacany.gov/253/Tree-Inventory-GIS
// The city publishes its inventory through an ArcGIS portal. The
// simplest path: export to GeoJSON from the portal, save locally,
// and run this script.
//
// Run with:
//   npm run import:ithaca -- --file ./path/to/ithaca-ti.geojson
//
// Field mapping is best-effort (ArcGIS exports often use upper-case
// abbreviated field names). Verify the species_skipped count after
// the first run; tweak field names below if needed.

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
  bulkUpsertImportedPins,
  type ImportRecord,
  type ImportRow,
  type ImportRunSummary
} from './lib/upsert';

loadEnv({ path: resolve(process.cwd(), '.env.local') });
loadEnv({ path: resolve(process.cwd(), '.env') });

const SOURCE_ID = 'ithaca-ti';
const SOURCE_NAME = 'City of Ithaca Tree Inventory';
const SOURCE_URL = 'https://www.cityofithacany.gov/253/Tree-Inventory-GIS';

interface GeoJsonFeature {
  type: 'Feature';
  geometry:
    | { type: 'Point'; coordinates: [number, number] }
    | { type: 'MultiPoint'; coordinates: [number, number][] };
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

function firstPoint(g: GeoJsonFeature['geometry']): [number, number] | null {
  if (g.type === 'Point') return g.coordinates;
  if (g.type === 'MultiPoint' && g.coordinates.length > 0) return g.coordinates[0];
  return null;
}

function mapFeature(f: GeoJsonFeature): ImportRecord | null {
  const point = firstPoint(f.geometry);
  if (!point) return null;
  const [lng, lat] = point;
  if (typeof lng !== 'number' || typeof lat !== 'number') return null;

  const props = f.properties ?? {};
  // Ithaca City Managed Trees fields (verified from the live GeoJSON):
  //   OBJECTID, SPP_bot (sci name, UPPERCASE), SPP_com (common, "GENUS, NAME"),
  //   SPName (friendly common, e.g. "Silver Maple"), Cultivar, Area, DBH, etc.
  const objId = props['OBJECTID'];
  const externalId =
    typeof objId === 'number' || typeof objId === 'string'
      ? String(objId)
      : `${lng.toFixed(6)},${lat.toFixed(6)}`;

  // SPP_bot is uppercase ("ACER SACCHARINUM") — matchSpecies's normalizer
  // lowercases for comparison, so this still matches our seed.
  const scientificName = pickStr(props, ['SPP_bot']);
  // Prefer the friendly SPName ("Silver Maple") over the inverted SPP_com
  // ("MAPLE, SILVER"). SPP_com is the alias-able fallback.
  const commonName = pickStr(props, ['SPName', 'SPP_com']);

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
      'Usage: npm run import:ithaca -- --file ./data/raw/ithaca-ti.geojson\n' +
        '\nDownload from:\n  ' +
        SOURCE_URL
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
      description: 'City of Ithaca street and park tree inventory.',
      regionName: 'Ithaca shared'
    });

    await sql`select pg_advisory_lock(hashtext(${`${regionId}:${SOURCE_ID}`}))`;

    const runId = await startImportRun(sql, SOURCE_ID, userId);
    const summary: ImportRunSummary = {
      pinsCreated: 0,
      pinsUpdated: 0,
      pinsSkippedUnmatched: 0,
      errors: []
    };

    const species = await loadSpecies(sql);
    const matched: ImportRow[] = [];

    for (const feature of collection.features) {
      const rec = mapFeature(feature);
      if (!rec) continue;
      const sp = matchSpecies(species, rec);
      if (!sp) {
        summary.pinsSkippedUnmatched++;
        continue;
      }
      matched.push({
        externalId: rec.externalId,
        speciesId: sp.id,
        lng: rec.lng,
        lat: rec.lat,
        raw: rec.raw
      });
    }

    const BATCH = 500;
    for (let i = 0; i < matched.length; i += BATCH) {
      const slice = matched.slice(i, i + BATCH);
      try {
        const r = await bulkUpsertImportedPins(sql, {
          regionId,
          sourceId: SOURCE_ID,
          userId,
          rows: slice
        });
        summary.pinsCreated += r.created;
        summary.pinsUpdated += r.updated;
        process.stdout.write(`  batch ${Math.floor(i / BATCH) + 1}: +${r.created} new, ${r.updated} updated\n`);
      } catch (err) {
        summary.errors.push({
          externalId: `batch-${i}`,
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
  console.error('Ithaca import failed:', err);
  process.exit(1);
});
