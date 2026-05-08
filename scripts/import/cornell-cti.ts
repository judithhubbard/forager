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
  bulkUpsertImportedPins,
  type ImportRecord,
  type ImportRow,
  type ImportRunSummary
} from './lib/upsert';

loadEnv({ path: resolve(process.cwd(), '.env.local') });
loadEnv({ path: resolve(process.cwd(), '.env') });

const SOURCE_ID = 'cornell-cti';
const SOURCE_NAME = 'Cornell Campus Tree Inventory';
const SOURCE_URL = 'https://cugir.library.cornell.edu/catalog/cugir-009100';

interface GeoJsonFeature {
  type: 'Feature';
  // Cornell WFS returns MultiPoint with a single point per feature.
  // We accept either shape.
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

/** Map a Cornell feature to our generic ImportRecord. Field names are
 *  best-effort; CUGIR data may use different casings. */
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
  // Cornell CTI fields (verified against the WFS GeoJSON):
  //   treeid (int), botanic (sci name), common (common name), genus,
  //   spcode, plus DBH series. Lots of nulls for older trees.
  const treeIdRaw = props['treeid'];
  const externalId =
    typeof treeIdRaw === 'number' || typeof treeIdRaw === 'string'
      ? String(treeIdRaw)
      : `${lng.toFixed(6)},${lat.toFixed(6)}`;

  let scientificName = pickStr(props, ['botanic']);
  // Fall back to genus when botanic is missing — matchSpecies has a
  // genus-only fallback that handles "Quercus" → first matching Quercus.
  if (!scientificName) scientificName = pickStr(props, ['genus']);

  const commonName = pickStr(props, ['common']);

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
      regionName: 'Ithaca, NY'
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

    // Disable the visibility-gate + density-grid triggers for the
    // bulk insert; same pattern as the framework's runImport. The
    // gate trigger (migration 16) blocks visibility='public' writes
    // unless auth.uid() matches a global admin — this script connects
    // as the DB owner via SUPABASE_DB_URL so auth.uid() is null.
    await sql`alter table public.pins disable trigger tg_gate_public_pins`;
    await sql`alter table public.pins disable trigger tg_pin_density_track_ins`;
    await sql`alter table public.pins disable trigger tg_pin_density_track_upd`;
    await sql`alter table public.pins disable trigger tg_pin_density_track_del`;
    // Process in batches; each batch is one round-trip.
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
    // Re-enable the triggers that were disabled for the bulk insert.
    await sql`alter table public.pins enable trigger tg_gate_public_pins`;
    await sql`alter table public.pins enable trigger tg_pin_density_track_ins`;
    await sql`alter table public.pins enable trigger tg_pin_density_track_upd`;
    await sql`alter table public.pins enable trigger tg_pin_density_track_del`;

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
