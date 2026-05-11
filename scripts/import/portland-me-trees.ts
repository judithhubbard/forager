// City of Portland, ME — Parks Division tree inventory. ~22k trees
// (single-shot pull, FeatureServer maxRecordCount = 25k). Hosted on
// the City's ArcGIS Server (gis.portlandmaine.gov) and surfaced via a
// public Tree Map Viewer at portlandme.maps.arcgis.com (item
// 8c1f329f45384c1080608df88501bcbe).
//
// Source page: https://www.portlandmaine.gov/1119/Tree-Inventory-Map
// REST API:    gis.portlandmaine.gov/.../ParksRec/Trees/FeatureServer/1
// License:     None declared on AGOL item. City of Portland publishes
//              the inventory under its open-government data publication
//              policy — treat as public-with-attribution.
// Refresh:     2026-05-11 single-shot fetch returned 21,688 features.
//
// Quirks of the endpoint that prevented use of the shared
// fetchArcGisLayer():
//   * The server returns HTTP 500 on returnCountOnly=true.
//   * Pagination by resultOffset returns HTTP 500 unconditionally
//     (the underlying versioned-data store doesn't support OFFSET).
//   * Queries WITHOUT outSR=4326 return EPSG:26856 (Maine State
//     Plane West) coordinates with x ~ 2,950,000 — useless for our
//     WGS84 storage.
//   * Queries WITHOUT outFields=* return 0 features.
//
// So this importer uses a one-shot fetch with outSR=4326,
// outFields=*, f=geojson and no record-count parameter. The server's
// 25k maxRecordCount covers the ~22k row count with margin. If
// Portland's inventory ever exceeds 25k we'll need to add a
// where-clause-based partition (e.g. by OBJECTID range).
//
// Schema notes: BotanicalName holds the Latin binomial (occasional
// cultivar suffix like "Acer rubrum 'Karpick'"); CommonName is a
// coded-domain value with mostly natural-order names ("Ash Green",
// "Pear Callery"). We use BotanicalName as primary and reorder
// CommonName as a fallback for rows with null Latin.
//
// Run: npm run import:portland-me-trees
// Pre-req: a 'Portland ME public' region row.

import postgres from 'postgres';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { normalizeSpeciesName } from './lib/framework';
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

const SOURCE_ID = 'portland-me-parks-trees';
const ENDPOINT =
  'https://gis.portlandmaine.gov/maps/rest/services/ParksRec/Trees/FeatureServer/1/query';
const REGION_NAME = 'Portland ME public';
const SOURCE_URL = ENDPOINT;

interface PmeFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    FacilityID?: string;
    CommonName?: string;
    BotanicalName?: string;
    Location?: string;
    Address?: string;
    DBH?: number;
    TreeStatus?: string;
    GlobalID?: string;
  };
}

/** Portland ME peninsula + outskirts bbox. City sits ~43.66 N,
 *  -70.26 W. The tree inventory includes Deering, Stroudwater, and
 *  Forest Avenue corridors. */
function inPortlandMeBbox(lng: number, lat: number): boolean {
  return lat >= 43.60 && lat <= 43.75 && lng >= -70.36 && lng <= -70.15;
}

/** "Pear Callery" → "Callery Pear" so we line up with our catalog.
 *  Portland's domain has many "Type Variant" two-word entries — we
 *  flip them only when the first token is a recognised genus-common
 *  prefix that benefits from the swap (Maple/Oak/Pine/etc.). For
 *  most entries the natural order is already correct and no swap is
 *  needed. */
const SWAP_PREFIXES = new Set([
  'Maple', 'Oak', 'Pine', 'Spruce', 'Fir', 'Birch', 'Ash', 'Cherry',
  'Elm', 'Hawthorn', 'Hickory', 'Lilac', 'Linden', 'Locust',
  'Magnolia', 'Mountain Ash', 'Pear', 'Plum', 'Hemlock', 'Cedar',
  'Beech', 'Dogwood', 'Hornbeam', 'Larch', 'Willow', 'Zelkova',
  'Stewartia', 'Ginkgo', 'Walnut'
]);
function reorderCommon(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name.trim();
  // Try two-word prefix first ("Mountain Ash European" → "European Mountain Ash")
  const head2 = `${parts[0]} ${parts[1]}`;
  if (SWAP_PREFIXES.has(head2) && parts.length >= 3) {
    return `${parts.slice(2).join(' ')} ${head2}`;
  }
  if (SWAP_PREFIXES.has(parts[0])) {
    return `${parts.slice(1).join(' ')} ${parts[0]}`;
  }
  return name.trim();
}

async function fetchPortlandMeFeatures(): Promise<PmeFeature[]> {
  // Single-shot fetch. outSR=4326 is REQUIRED; without it the server
  // returns Maine State Plane coords. outFields=* is REQUIRED; with
  // outFields=OBJECTID the server returns 0 features. f=geojson
  // gives us WGS84-shaped Point geometries directly.
  //
  // Portland ME's ArcGIS Server is operationally flaky — its versioned-
  // data store returns HTTP 500 ("Error performing query operation")
  // for minutes at a time, then recovers without warning. We retry
  // with exponential backoff up to ~5 minutes total, since the
  // alternative is failing the whole import.
  const params = new URLSearchParams({
    where: '1=1',
    outFields: '*',
    outSR: '4326',
    f: 'geojson'
  });
  const url = `${ENDPOINT}?${params.toString()}`;
  process.stdout.write(`  fetching one-shot from ${ENDPOINT}\n`);

  const MAX_ATTEMPTS = 12;
  const BACKOFF_MS = [
    2_000, 5_000, 10_000, 15_000, 20_000, 30_000,
    30_000, 30_000, 45_000, 60_000, 60_000, 60_000
  ];
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status} on attempt ${attempt}`);
        process.stdout.write(`  attempt ${attempt}: ${res.status} (retrying)\n`);
      } else {
        const ct = res.headers.get('content-type') ?? '';
        if (!ct.includes('json')) {
          const head = (await res.text()).slice(0, 80);
          lastErr = new Error(`non-JSON response (${ct}): ${head}`);
          process.stdout.write(`  attempt ${attempt}: non-JSON content-type (retrying)\n`);
        } else {
          const body = (await res.json()) as {
            features?: PmeFeature[];
            exceededTransferLimit?: boolean;
            properties?: { exceededTransferLimit?: boolean };
            error?: { code?: number; message?: string };
          };
          if (body.error) {
            lastErr = new Error(
              `server error ${body.error.code}: ${body.error.message}`
            );
            process.stdout.write(
              `  attempt ${attempt}: server error ${body.error.code} (retrying)\n`
            );
          } else {
            const feats = body.features ?? [];
            const exceeded =
              body.exceededTransferLimit ?? body.properties?.exceededTransferLimit;
            process.stdout.write(
              `  attempt ${attempt}: ${feats.length} features (exceeded=${!!exceeded})\n`
            );
            if (exceeded) {
              throw new Error(
                `Portland ME single-shot fetch hit the server's maxRecordCount; ` +
                  `dataset has grown beyond 25k rows and the importer needs a ` +
                  `partitioned where-clause strategy. Rebuild fetchPortlandMeFeatures().`
              );
            }
            return feats;
          }
        }
      }
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      process.stdout.write(`  attempt ${attempt}: fetch threw — ${lastErr.message} (retrying)\n`);
    }
    const wait = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
    await new Promise((r) => setTimeout(r, wait));
  }
  throw new Error(
    `Portland ME fetch failed after ${MAX_ATTEMPTS} attempts; last error: ` +
      (lastErr?.message ?? 'unknown')
  );
}

async function main(): Promise<void> {
  const dbUrl = process.env.SUPABASE_DB_URL;
  const userId = process.env.FORAGER_DEV_USER_ID;
  if (!dbUrl) throw new Error('SUPABASE_DB_URL missing.');
  if (!userId) throw new Error('FORAGER_DEV_USER_ID missing.');

  console.log(`Fetching from ${ENDPOINT} …`);
  const features = await fetchPortlandMeFeatures();
  console.log(`Fetched ${features.length} features. Matching …`);

  const sql = postgres(dbUrl, { ssl: 'require', onnotice: () => undefined });
  try {
    const { regionId } = await registerImportSource(sql, {
      sourceId: SOURCE_ID,
      name: 'Portland ME Parks Division Tree Inventory',
      url: SOURCE_URL,
      description:
        'City of Portland, ME Parks Division tree inventory (~22k ' +
        'trees). Source publishes BotanicalName (Latin, occasional ' +
        'cultivar suffix) and CommonName as coded-domain values. ' +
        'AGOL item carries no explicit license; treated as public-' +
        'with-attribution per City of Portland ME publication.',
      regionName: REGION_NAME,
      license: 'Public (City of Portland ME; no explicit CC license)'
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
    for (const f of features) {
      const c = f.geometry?.coordinates;
      const lng = Number(c?.[0]);
      const lat = Number(c?.[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      if (lng === 0 || lat === 0) continue;
      if (!inPortlandMeBbox(lng, lat)) continue;

      let latin = (f.properties?.BotanicalName ?? '').trim();
      const commonRaw = (f.properties?.CommonName ?? '').trim();
      // Filter placeholder rows: "EMPTY", "NO TREE", "Unknown", "Stump".
      const placeholderCommon = /^(EMPTY|NO TREE|Stump|Unknown)$/i;
      if (commonRaw && placeholderCommon.test(commonRaw)) continue;
      const placeholderLatin = /^(NO TREE|Unknown|STUMP|Other)$/i;
      if (latin && placeholderLatin.test(latin)) latin = '';
      const common = commonRaw ? reorderCommon(commonRaw) : undefined;
      if (!latin && !common) continue;

      const rec: ImportRecord = {
        externalId: String(
          f.properties?.OBJECTID ??
            f.properties?.FacilityID ??
            f.properties?.GlobalID ??
            `${lng.toFixed(6)},${lat.toFixed(6)}`
        ),
        scientificName: latin || undefined,
        commonName: common,
        lng,
        lat,
        raw: f as unknown as Record<string, unknown>
      };
      if (rec.scientificName) {
        rec.scientificName = normalizeSpeciesName(rec.scientificName);
      }
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

    await sql`set session_replication_role = replica`;
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
        process.stdout.write(
          `  batch ${Math.floor(i / BATCH) + 1}: +${r.created} new, ${r.updated} updated\n`
        );
      } catch (err) {
        summary.errors.push({
          externalId: `batch-${i}`,
          message: err instanceof Error ? err.message : String(err)
        });
      }
    }
    await sql`set session_replication_role = origin`;

    await finishImportRun(sql, runId, summary);
    await sql`select pg_advisory_unlock(hashtext(${`${regionId}:${SOURCE_ID}`}))`;

    if (summary.pinsCreated > 0 || summary.pinsUpdated > 0) {
      try {
        await sql`select public.refresh_pin_density()`;
        console.log('  refreshed pin_density_grid');
      } catch (err) {
        console.warn(
          '  refresh_pin_density failed (non-fatal):',
          err instanceof Error ? err.message : err
        );
      }
    }

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
  console.error('Portland ME trees import failed:', err);
  process.exit(1);
});
