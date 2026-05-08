// Cornell Botanic Gardens scraper + importer.
//
// Source: https://cornell.gardenexplorer.org/ (IrisBG / Garden Explorer).
// No documented public API, but the underlying ASP.NET PageMethods can
// be hit directly:
//   POST /map.aspx/GetFeatures      → 8.8k features in one call
//   POST /map.aspx/GetFeatureText   → species name + accession per feature
//
// This script:
//   1. Hits GetFeatures once for the whole campus.
//   2. Concurrently hits GetFeatureText for each feature (~8.8k calls).
//   3. Parses scientific names, filters to our forageable species.
//   4. Writes data/raw/cornell-bg.geojson and runs the same upsert
//      pipeline as cornell-cti / ithaca-ti.
//
// Run with: npm run import:cornell-bg
//
// Be polite: concurrency is capped at 12 and there's a 50ms gap between
// batches. Total runtime is usually 1-2 minutes.

import postgres from 'postgres';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import {
  registerImportSource,
  startImportRun,
  finishImportRun,
  loadSpecies,
  matchSpecies,
  bulkUpsertImportedPins,
  type ImportRow,
  type ImportRunSummary
} from './lib/upsert';

loadEnv({ path: resolve(process.cwd(), '.env.local') });
loadEnv({ path: resolve(process.cwd(), '.env') });

const SOURCE_ID = 'cornell-bg';
const SOURCE_NAME = 'Cornell Botanic Gardens';
const SOURCE_URL = 'https://cornell.gardenexplorer.org/';

// Wide enough to cover the entire arboretum + plantations.
const BOUNDS = '-76.500,42.430,-76.430,42.475';

const CONCURRENCY = 12;
const BATCH_DELAY_MS = 50;

interface RawFeature {
  type: 'Feature';
  id: string;
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: { text: string; icon: string; keys: string };
}

interface GetFeaturesResponse {
  d: { type: 'FeatureCollection'; features: RawFeature[] };
}

interface GetFeatureTextResponse {
  d: string; // '<span dir="ltr">Genus species</span>|accession*location<img>'
}

interface EnrichedFeature {
  fid: string;
  scientificName: string;
  accession: string | null;
  lng: number;
  lat: number;
}

async function getFeatures(): Promise<RawFeature[]> {
  const res = await fetch('https://cornell.gardenexplorer.org/map.aspx/GetFeatures', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Requested-With': 'XMLHttpRequest'
    },
    body: JSON.stringify({
      currzoom: 20,
      prevzoom: 0,
      startzoom: 18,
      usecluster: false,
      isloaded: false,
      bounds: BOUNDS
    })
  });
  if (!res.ok) throw new Error(`GetFeatures failed: ${res.status}`);
  const data = (await res.json()) as GetFeaturesResponse;
  return data.d.features;
}

async function getFeatureText(fid: string): Promise<string> {
  const res = await fetch('https://cornell.gardenexplorer.org/map.aspx/GetFeatureText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Requested-With': 'XMLHttpRequest'
    },
    body: JSON.stringify({ fid })
  });
  if (!res.ok) throw new Error(`GetFeatureText(${fid}) failed: ${res.status}`);
  const data = (await res.json()) as GetFeatureTextResponse;
  return data.d ?? '';
}

function parseFeatureText(s: string): { scientificName: string; accession: string | null } {
  // Format examples:
  //   '<span dir="ltr">Picea glauca</span>|1995-103*AC<img>'
  //   '<span dir="ltr">Cornus mas</span>|2003-040*AB'
  const sci = (/<span[^>]*>([^<]+)<\/span>/.exec(s) || [])[1] ?? '';
  // Strip HTML if any remains.
  const cleaned = sci.replace(/<[^>]+>/g, '').trim();
  const acc = (/\|([^*<]+)\*/.exec(s) || [])[1] ?? null;
  return { scientificName: cleaned, accession: acc };
}

async function enrichFeatures(features: RawFeature[]): Promise<EnrichedFeature[]> {
  const out: EnrichedFeature[] = [];
  for (let i = 0; i < features.length; i += CONCURRENCY) {
    const batch = features.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (f) => {
        try {
          const text = await getFeatureText(f.id);
          const parsed = parseFeatureText(text);
          if (!parsed.scientificName) return null;
          const [lng, lat] = f.geometry.coordinates;
          return {
            fid: f.id,
            scientificName: parsed.scientificName,
            accession: parsed.accession,
            lng,
            lat
          };
        } catch (err) {
          console.warn(`  ! feature ${f.id} skipped:`, err instanceof Error ? err.message : err);
          return null;
        }
      })
    );
    for (const r of results) if (r) out.push(r);
    if (i % 500 === 0) {
      process.stdout.write(`  fetched ${Math.min(i + CONCURRENCY, features.length)} / ${features.length}\n`);
    }
    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
  }
  return out;
}

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  const userId = process.env.FORAGER_DEV_USER_ID;
  if (!dbUrl) throw new Error('SUPABASE_DB_URL missing.');
  if (!userId) throw new Error('FORAGER_DEV_USER_ID missing (admin user for attribution).');

  console.log('Fetching feature list from Cornell Botanic Gardens…');
  const raw = await getFeatures();
  console.log(`  got ${raw.length} features`);

  console.log('Resolving scientific names (this takes ~1-2 min)…');
  const enriched = await enrichFeatures(raw);
  console.log(`  resolved ${enriched.length} features`);

  // Save GeoJSON for audit / re-import.
  const geojson = {
    type: 'FeatureCollection' as const,
    features: enriched.map((e) => ({
      type: 'Feature' as const,
      properties: {
        fid: e.fid,
        scientificName: e.scientificName,
        accession: e.accession
      },
      geometry: { type: 'Point' as const, coordinates: [e.lng, e.lat] as [number, number] }
    }))
  };
  await mkdir(resolve(process.cwd(), 'data/raw'), { recursive: true });
  await writeFile(
    resolve(process.cwd(), 'data/raw/cornell-bg.geojson'),
    JSON.stringify(geojson, null, 0)
  );
  console.log('  saved data/raw/cornell-bg.geojson');

  // Now run the upsert pipeline.
  const sql = postgres(dbUrl, { ssl: 'require', onnotice: () => undefined });
  try {
    const { regionId } = await registerImportSource(sql, {
      sourceId: SOURCE_ID,
      name: SOURCE_NAME,
      url: SOURCE_URL,
      description: 'Cornell Botanic Gardens — accession plant collection (scraped via Garden Explorer).',
      regionName: 'Ithaca, NY'
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

    for (const f of enriched) {
      const sp = matchSpecies(species, {
        externalId: f.fid,
        scientificName: f.scientificName,
        commonName: undefined,
        lng: f.lng,
        lat: f.lat,
        raw: { fid: f.fid, scientificName: f.scientificName, accession: f.accession }
      });
      if (!sp) {
        summary.pinsSkippedUnmatched++;
        continue;
      }
      matched.push({
        externalId: f.fid,
        speciesId: sp.id,
        lng: f.lng,
        lat: f.lat,
        raw: { fid: f.fid, scientificName: f.scientificName, accession: f.accession }
      });
    }

    // Same trigger-disable dance as the framework / dryad importer.
    await sql`alter table public.pins disable trigger tg_gate_public_pins`;
    await sql`alter table public.pins disable trigger tg_pin_density_track_ins`;
    await sql`alter table public.pins disable trigger tg_pin_density_track_upd`;
    await sql`alter table public.pins disable trigger tg_pin_density_track_del`;
    const BATCH = 500;
    for (let i = 0; i < matched.length; i += BATCH) {
      const slice = matched.slice(i, i + BATCH);
      const r = await bulkUpsertImportedPins(sql, {
        regionId,
        sourceId: SOURCE_ID,
        userId,
        rows: slice
      });
      summary.pinsCreated += r.created;
      summary.pinsUpdated += r.updated;
      process.stdout.write(`  batch ${Math.floor(i / BATCH) + 1}: +${r.created} new, ${r.updated} updated\n`);
    }
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
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('Cornell BG scraper failed:', err);
  process.exit(1);
});
