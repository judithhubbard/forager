// Phase 2E framework: shared utilities for municipal-tree-inventory
// scrapes. Each new city becomes one config object + a one-line
// invocation of runImport().
//
// What lives here:
//   - fetchArcGisLayer(): paginated query against an ArcGIS REST
//     endpoint with auto-pagination and resultOffset handling.
//   - fetchOpenDataApiJson(): paginated query against a Socrata-style
//     endpoint (NYC OpenData, Chicago Data Portal, DataSF use this).
//   - normalizeSpeciesName(): strip cultivar suffixes, fold whitespace,
//     drop "spp.", "var.", and "x" hybrid markers — gives matchSpecies
//     a clean scientific name to work with.
//   - runImport(): wraps registerImportSource → loadSpecies →
//     fetchAll → mapFeature → matchSpecies → bulkUpsertImportedPins
//     into a single async function with the city-specific bits
//     plugged in by config.

import postgres from 'postgres';
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
} from './upsert';

loadEnv({ path: resolve(process.cwd(), '.env.local') });
loadEnv({ path: resolve(process.cwd(), '.env') });

/** Strip cultivar suffixes ('Crimson King', 'Aristocrat'), the
 *  whitespace cultivar marker var./ssp./subsp./f., and hybrid 'x'.
 *  Returns the binomial in lowercase, single-spaced. */
export function normalizeSpeciesName(raw: string | undefined | null): string {
  if (!raw) return '';
  let s = raw.trim();
  // Drop quoted cultivar names: Acer 'Crimson King' → Acer
  s = s.replace(/['‘’"][^'‘’"]+['‘’"]/g, '');
  // Drop trailing cultivar in parentheses: Acer (Crimson King) → Acer
  s = s.replace(/\([^)]*\)/g, '');
  // Strip subsp./var./ssp./f. and what follows them.
  s = s.replace(/\b(?:subsp|ssp|var|f|cv)\.[^,]*$/i, '');
  // Hybrid marker: "Acer x freemanii" → "Acer freemanii"
  s = s.replace(/\bx\s+/g, '');
  // Collapse whitespace and drop trailing junk.
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/** ArcGIS REST `query` endpoint with auto-pagination. Returns all
 *  features as a single array. Use this for endpoints that return
 *  `{ features: [...], exceededTransferLimit: bool }` shapes. */
export async function fetchArcGisLayer(opts: {
  url: string;             // .../FeatureServer/0/query
  where?: string;          // SQL-ish filter, default '1=1'
  outFields?: string;      // CSV, default '*'
  pageSize?: number;       // server cap is usually 1000–2000
}): Promise<unknown[]> {
  const params = new URLSearchParams({
    where: opts.where ?? '1=1',
    outFields: opts.outFields ?? '*',
    f: 'geojson',
    returnGeometry: 'true',
    resultRecordCount: String(opts.pageSize ?? 1000)
  });
  const all: unknown[] = [];
  let offset = 0;
  for (;;) {
    params.set('resultOffset', String(offset));
    const url = `${opts.url}?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`ArcGIS fetch ${res.status} on ${url}`);
    }
    const body = (await res.json()) as {
      features?: unknown[];
      // FeatureServer puts the flag under properties; MapServer
      // (e.g. City of Madison's maps.cityofmadison.com) puts it
      // at the top level. Check both.
      properties?: { exceededTransferLimit?: boolean };
      exceededTransferLimit?: boolean;
    };
    const feats = body.features ?? [];
    all.push(...feats);
    process.stdout.write(`  fetched offset ${offset}: ${feats.length} (total ${all.length})\n`);
    const more = !!(body.properties?.exceededTransferLimit ?? body.exceededTransferLimit);
    if (!more || feats.length === 0) break;
    offset += feats.length;
  }
  return all;
}

/** Socrata-style OpenData API (used by NYC OpenData, DataSF, etc).
 *  Endpoint shape: https://data.cityofnewyork.us/resource/<id>.json
 *  Pagination via $offset + $limit; max page is usually 50000. */
export async function fetchOpenDataApiJson(opts: {
  url: string;
  pageSize?: number;
  where?: string;       // SoQL clause for $where
}): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  const page = opts.pageSize ?? 50000;
  let offset = 0;
  for (;;) {
    const params = new URLSearchParams({
      $limit: String(page),
      $offset: String(offset)
    });
    if (opts.where) params.set('$where', opts.where);
    const url = `${opts.url}?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OpenData fetch ${res.status} on ${url}`);
    const rows = (await res.json()) as Record<string, unknown>[];
    all.push(...rows);
    process.stdout.write(`  fetched offset ${offset}: ${rows.length} (total ${all.length})\n`);
    if (rows.length < page) break;
    offset += rows.length;
  }
  return all;
}

/** CKAN DataStore API (used by Toronto's open.toronto.ca, lots of
 *  Canadian/UK municipal portals). Endpoint shape:
 *  https://<host>/api/3/action/datastore_search?resource_id=<uuid>
 *  Response: { result: { records: [...], _links: { next, ... } } }.
 *  Page via the cursor-style _links.next path until exhausted. */
export async function fetchCkanDataStore(opts: {
  /** Base URL like 'https://ckan0.cf.opendata.inter.prod-toronto.ca'. */
  baseUrl: string;
  resourceId: string;
  pageSize?: number;
}): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  const limit = opts.pageSize ?? 32000;
  let nextPath: string | null =
    `/api/3/action/datastore_search?resource_id=${opts.resourceId}&limit=${limit}`;
  while (nextPath) {
    const url = `${opts.baseUrl}${nextPath}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`CKAN fetch ${res.status} on ${url}`);
    const body = (await res.json()) as {
      success?: boolean;
      result?: {
        records?: Record<string, unknown>[];
        _links?: { next?: string };
      };
    };
    const records = body.result?.records ?? [];
    all.push(...records);
    process.stdout.write(`  fetched ${records.length} (total ${all.length})\n`);
    if (records.length === 0) break;
    nextPath = body.result?._links?.next ?? null;
  }
  return all;
}

/** Per-city configuration + plug-in feature mapper. */
export interface ImportConfig<F> {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  sourceDescription: string;
  /** Region the imported pins land in. Must already exist (via the
   *  /welcome flow or an admin-portal create). */
  regionName: string;
  /** Optional license string for import_sources. Note: only
   *  permissively-licensed datasets should land in the public layer. */
  license?: string;
  /** Pull every raw feature/record from the source. */
  fetchAll(): Promise<F[]>;
  /** Translate one source feature into our generic ImportRecord
   *  shape. Return null to skip (e.g. invalid geometry). */
  mapFeature(f: F): ImportRecord | null;
}

/** End-to-end runner: registers the source, takes an advisory lock,
 *  starts a run, fetches + matches + upserts in batches, finalizes
 *  the run. Logs progress to stdout. */
export async function runImport<F>(config: ImportConfig<F>): Promise<void> {
  const dbUrl = process.env.SUPABASE_DB_URL;
  const userId = process.env.FORAGER_DEV_USER_ID;
  if (!dbUrl) throw new Error('SUPABASE_DB_URL missing.');
  if (!userId) throw new Error('FORAGER_DEV_USER_ID missing.');

  console.log(`Fetching from ${config.sourceUrl} …`);
  const features = await config.fetchAll();
  console.log(`Fetched ${features.length} features. Matching against species …`);

  const sql = postgres(dbUrl, { ssl: 'require', onnotice: () => undefined });
  try {
    const { regionId } = await registerImportSource(sql, {
      sourceId: config.sourceId,
      name: config.sourceName,
      url: config.sourceUrl,
      description: config.sourceDescription,
      regionName: config.regionName,
      license: config.license
    });

    await sql`select pg_advisory_lock(hashtext(${`${regionId}:${config.sourceId}`}))`;
    const runId = await startImportRun(sql, config.sourceId, userId);
    const summary: ImportRunSummary = {
      pinsCreated: 0,
      pinsUpdated: 0,
      pinsSkippedUnmatched: 0,
      errors: []
    };

    const species = await loadSpecies(sql);
    const matched: ImportRow[] = [];
    for (const f of features) {
      const rec = config.mapFeature(f);
      if (!rec) continue;
      // Cheap scientific-name normalization before matchSpecies, so
      // 'Acer x freemanii Cultivar' lines up with the catalog entry.
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

    // The visibility-gate trigger from migration 15 blocks
    // visibility='public' writes unless auth.uid() belongs to a
    // global admin. The import script connects as the database owner
    // via SUPABASE_DB_URL, so auth.uid() is NULL and the trigger
    // would block every row. Disable for the bulk insert (and
    // re-enable in a finally block below) — same pattern migration 16
    // used for the bootstrap promote-to-public update.
    // Bypass triggers for THIS session only via session_replication_role.
    // Earlier code did ALTER TABLE … DISABLE TRIGGER, which is global —
    // running two importers concurrently caused one to re-enable the
    // gate while the other was mid-batch, losing ~140k rows per
    // concurrent run. Replica role skips non-replica triggers in
    // this session and leaves other sessions unaffected.
    await sql`set session_replication_role = replica`;
    const BATCH = 500;
    for (let i = 0; i < matched.length; i += BATCH) {
      const slice = matched.slice(i, i + BATCH);
      try {
        const r = await bulkUpsertImportedPins(sql, {
          regionId,
          sourceId: config.sourceId,
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
    // Restore default replication role; only matters if the
    // connection is reused after this function returns.
    await sql`set session_replication_role = origin`;

    await finishImportRun(sql, runId, summary);
    await sql`select pg_advisory_unlock(hashtext(${`${regionId}:${config.sourceId}`}))`;

    // Refresh the pre-computed pin-density grid so the heatmap
    // toggle reflects the freshly-imported pins on the next page
    // load. Cheap (~1s) and idempotent.
    if (summary.pinsCreated > 0 || summary.pinsUpdated > 0) {
      try {
        await sql`select public.refresh_pin_density()`;
        console.log('  refreshed pin_density_grid');
      } catch (err) {
        // Don't fail the whole import on a refresh failure — the
        // grid can be re-computed manually with `select
        // public.refresh_pin_density()` in SQL editor.
        console.warn('  refresh_pin_density failed (non-fatal):',
          err instanceof Error ? err.message : err);
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
