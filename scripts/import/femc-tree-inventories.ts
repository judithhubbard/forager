// FEMC (UVM Forest Ecosystem Monitoring Cooperative) tree-inventory
// archive aggregator.
//
// Source: https://www.uvm.edu/femc/CI4/search/raw?search-query=tree+inventory
// (396 records — see /docs/femc-tree-inventories.md for the full audit.)
//
// Of the 396 records:
//   - 209 are "project" landing pages with no downloadable child dataset
//     (description-only metadata stubs).
//   - 186 are dataset pages. Of those:
//       117 say "This data is not publicly available" (private metadata
//         stubs — FEMC has cataloged the inventory but the city/owner
//         did not release the rows).
//       59 are downloadable. Crawl 2026-05-10:
//         3 have per-tree lat/lng AND a permissive license (CC0). That's
//           the importable subset this script handles:
//             - Syracuse, NY            (Z1442_2957_ZJP55R, ~48,350 trees)
//             - Watertown, NY (2017-18) (Z1445_2961_RQFR8P, ~7,581 trees)
//             - Bath, ME                (Z1431_2937_0A5GEY, ~4,802 rows;
//                                        only ~1,046 have valid lat/lng)
//         24 are CC0 / CC BY / 3rd-party but lack lat/lng (address-only;
//           e.g. Hartford CT, Newburgh NY, Stamford CT) — would need
//           geocoding to be useful, out of scope.
//         32 are CC BY-SA (Vermont VTrans-style inventories — non-spatial
//           tabular Davey-style data) — BLOCKED both on missing lat/lng
//           and the SA copyleft term.
//
// Download protocol (per dataset):
//   1. GET <dataset-url> on host vmc.w3.uvm.edu (the canonical host —
//      www.uvm.edu/femc 301-redirects there and drops the cookie).
//      Capture the `ci_session` cookie and the second `csrfHash = '…'`
//      occurrence in the page (the first one is for the table-exists
//      probe; the second is for the actual download POST).
//   2. POST to /CI4/download/datatable_ajax/<token> with form fields
//      anonDownload=1 / datasetid=<d> / projectid=<p> / filterqry= /
//      selectqry= / filtered=0 / csrf_test_name=<hash>. Response is
//      JSON: { rand, filename, rows, size, message:"success" }.
//   3. Wait ~3–8 s (FEMC builds the CSV server-side into a temp dir).
//   4. GET https://vmc.w3.uvm.edu/CI4/temp/<rand>/<filename> — the CSV.
//
// Each dataset becomes its own import_source (`femc-<slug>`) and lands
// in its own region (e.g. `Syracuse public`, `Watertown NY public`,
// `Bath ME public`). Failures on one dataset don't poison the others;
// the loop catches per-dataset errors and continues.
//
// Run: npm run import:femc-tree-inventories
// Single-dataset run: SLUG=syracuse npm run import:femc-tree-inventories
//
// Pre-req regions (create these in `regions` before running):
//   - Syracuse public
//   - Watertown NY public
//   - Bath ME public

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
import postgres from 'postgres';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: resolve(process.cwd(), '.env.local') });
loadEnv({ path: resolve(process.cwd(), '.env') });

const UA = 'Mozilla/5.0 (compatible; ForagerImport/1.0)';
const FEMC_HOST = 'https://vmc.w3.uvm.edu';

interface FemcDatasetDef {
  slug: string;                // short slug for import_source id
  /** FEMC dataset page URL on the canonical vmc.w3.uvm.edu host. */
  datasetUrl: string;
  /** Token used in datatable_ajax/<token> — format "Z<proj>_<ds>_<key>". */
  downloadToken: string;
  projectId: string;
  datasetId: string;
  title: string;
  regionName: string;          // pre-existing in `regions`
  license: string;
  /** Estimated row count for the dashboard / logs. */
  estimatedRows: number;
  /** Plausible lat-lng bounding box for sanity filtering (rejects
   *  (0,0) and any UTM/StatePlane leftovers). */
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  /** Map one CSV row (already parsed into a {col: value} object) into
   *  the canonical import shape. Return null to skip. */
  mapRow(row: Record<string, string>, lineNo: number): {
    externalId: string;
    latin?: string;        // may be undefined if only common name is present
    common?: string;
    lng: number;
    lat: number;
  } | null;
}

/** Strip "(Latin name)" suffix from FEMC "Species" columns that store
 *  the common-name form "honeylocust, thornless (Gleditsia triacanthos
 *  inermis)". Returns { common, latin }. */
function splitFemcSpecies(raw: string | undefined): { common?: string; latin?: string } {
  if (!raw) return {};
  const s = raw.trim();
  const m = s.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (m) return { common: m[1].trim(), latin: m[2].trim() };
  return { common: s };
}

const DATASETS: FemcDatasetDef[] = [
  {
    slug: 'syracuse',
    datasetUrl:
      `${FEMC_HOST}/CI4/data/archive/project/syracuse_new_york_street_tree_inventories/dataset/syracuse-new-york-street-tree-inventory`,
    downloadToken: 'Z1442_2957_ZJP55R',
    projectId: '1442',
    datasetId: '2957',
    title: 'Syracuse, New York Street Tree Inventory Data',
    regionName: 'Syracuse public',
    license: 'CC0 (FEMC archive)',
    estimatedRows: 48_350,
    bbox: { minLat: 42.9, maxLat: 43.2, minLng: -76.3, maxLng: -75.9 },
    mapRow(row) {
      // Schema: Address,Suffix,Street,Side,Site,On_Street,From_Street,To_Street,
      //         X,Y,Latitude,Longitude,Inventory_Date,Site_ID,Site_Comments,
      //         Species,Common_Name,Sci_Name,DBH,Area,Cultivar,Planting_Date,Space_Size
      const lat = Number(row.Latitude);
      const lng = Number(row.Longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      const latin = (row.Sci_Name || '').trim();
      const common = (row.Common_Name || '').trim() || undefined;
      // Skip placeholder "Vacant site" rows commonly used for planting
      // spots without a tree planted yet.
      if (latin === '' && (common ?? '').toLowerCase().startsWith('vacant')) return null;
      const eid = (row.Site_ID || '').trim() ||
        `${lat.toFixed(6)},${lng.toFixed(6)}`;
      return { externalId: `syracuse-${eid}`, latin, common, lng, lat };
    }
  },
  {
    slug: 'watertown-ny-2017-2018',
    datasetUrl:
      `${FEMC_HOST}/CI4/data/archive/project/Watertown_new_york_street_tree_inventory/dataset/watertown-new-york-street-tree-inventory-1`,
    downloadToken: 'Z1445_2961_RQFR8P',
    projectId: '1445',
    datasetId: '2961',
    title: 'Watertown, New York Street Tree Inventory Data (2017-2018)',
    regionName: 'Watertown NY public',
    license: 'CC0 (FEMC archive)',
    estimatedRows: 7_581,
    bbox: { minLat: 43.9, maxLat: 44.1, minLng: -76.1, maxLng: -75.8 },
    mapRow(row) {
      // Schema: Address,Suffix,Street,Side,Site,On_Street,X,Y,Latitude,
      //         Longitude,Inventory_Date,Site_ID,Species,DBH,Parcel
      const lat = Number(row.Latitude);
      const lng = Number(row.Longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      // Watertown's `Species` column uses the FEMC convention
      // "common, modifier (Scientific name)" — split it.
      const { common, latin } = splitFemcSpecies(row.Species);
      if (!latin && !common) return null;
      if (common && common.toLowerCase().startsWith('vacant site')) return null;
      const eid = (row.Site_ID || '').trim() ||
        `${lat.toFixed(6)},${lng.toFixed(6)}`;
      return { externalId: `watertown-ny-${eid}`, latin, common, lng, lat };
    }
  },
  {
    slug: 'bath-me',
    datasetUrl:
      `${FEMC_HOST}/CI4/data/archive/project/bath_maine_street_tree_inventory/dataset/bath-maine-street-tree-inventory-data`,
    downloadToken: 'Z1431_2937_0A5GEY',
    projectId: '1431',
    datasetId: '2937',
    title: 'Bath, Maine Street Tree Inventory Data',
    regionName: 'Bath ME public',
    license: 'CC0 (FEMC archive)',
    estimatedRows: 4_802,
    bbox: { minLat: 43.85, maxLat: 43.95, minLng: -69.85, maxLng: -69.75 },
    mapRow(row) {
      // Schema: Serial_Number,Ward,Segment_Number,Address,Street,Tree_ID,
      //         Land_Use,Common_Name,Cultivat,Genus,Species,Tree_ID_Code,
      //         DBH,...,Lat,Long,...
      // ~22% of rows have non-empty Lat/Long. Skip those that don't.
      const latRaw = (row.Lat || '').trim();
      const lngRaw = (row.Long || '').trim();
      if (!latRaw || !lngRaw) return null;
      const lat = Number(latRaw);
      const lng = Number(lngRaw);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      // Bath stores Genus + Species separately (often only Genus filled,
      // e.g. "Acer" with empty Species). Build best-effort binomial.
      const genus = (row.Genus || '').trim();
      const species = (row.Species || '').trim();
      const latin = genus && species ? `${genus} ${species}` :
        (genus || undefined);
      // Common_Name has FEMC "all-caps, comma" form: "MAPLE, NORWAY".
      // Strip the modifier so the species matcher's common-name path
      // hits ("maple" rather than "maple, norway").
      const rawCommon = (row.Common_Name || '').trim();
      const common = rawCommon
        ? rawCommon.split(',')[0].trim().toLowerCase()
        : undefined;
      const eid = (row.Serial_Number || '').trim() ||
        (row.Old_Serial_Number || '').trim() ||
        `${lat.toFixed(6)},${lng.toFixed(6)}`;
      return { externalId: `bath-me-${eid}`, latin, common, lng, lat };
    }
  }
];

/** Extract the second `csrfHash = '…'` value from a FEMC dataset
 *  page — that's the one paired with the download endpoint POST.
 *  (The first one is for `doesTableExist`, a server-side polling check
 *  we don't need since the datasets we target have empty `table`.) */
function extractDownloadCsrf(html: string): string | null {
  const re = /csrfHash = '([a-f0-9]+)'/g;
  const all: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    all.push(m[1]);
    if (all.length >= 3) break;
  }
  return all[1] ?? all[0] ?? null;
}

/** Extract `Set-Cookie: ci_session=…` value from a Response — used to
 *  thread the same session through subsequent POST + GET calls so the
 *  CSRF check binds. Returns the raw cookie pair "ci_session=<value>". */
function extractCiSession(res: Response): string | null {
  // Some Node fetch implementations expose multiple Set-Cookie via
  // .headers.raw() or .getSetCookie(); fall back to single getter.
  const headers = res.headers as unknown as {
    getSetCookie?: () => string[];
    get: (k: string) => string | null;
  };
  const arr = headers.getSetCookie?.() ?? [];
  const direct = arr.length > 0 ? arr : [headers.get('set-cookie') ?? ''];
  for (const c of direct) {
    if (!c) continue;
    const m = /ci_session=([^;]+)/.exec(c);
    if (m) return `ci_session=${m[1]}`;
  }
  return null;
}

/** Fetch a FEMC dataset's full CSV via the multi-step protocol.
 *  Returns the raw CSV text. Throws on any unrecoverable error. */
async function fetchFemcCsv(ds: FemcDatasetDef): Promise<string> {
  // Step 1: GET dataset page; capture cookie + CSRF.
  const pageRes = await fetch(ds.datasetUrl, {
    headers: { 'User-Agent': UA },
    redirect: 'follow'
  });
  if (!pageRes.ok) {
    throw new Error(`FEMC page GET ${pageRes.status} for ${ds.slug}`);
  }
  const cookie = extractCiSession(pageRes);
  if (!cookie) {
    throw new Error(`No ci_session cookie returned for ${ds.slug}`);
  }
  const html = await pageRes.text();
  const csrf = extractDownloadCsrf(html);
  if (!csrf) {
    throw new Error(`No download csrfHash found on dataset page for ${ds.slug}`);
  }

  // Step 2: POST download initiation; parse JSON response.
  const body = new URLSearchParams({
    anonDownload: '1',
    datasetid: ds.datasetId,
    projectid: ds.projectId,
    filterqry: '',
    selectqry: '',
    filtered: '0',
    csrf_test_name: csrf
  });
  const postRes = await fetch(
    `${FEMC_HOST}/CI4/download/datatable_ajax/${ds.downloadToken}`,
    {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        Cookie: cookie,
        Referer: ds.datasetUrl,
        Origin: FEMC_HOST,
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    }
  );
  if (!postRes.ok) {
    throw new Error(`FEMC POST ${postRes.status} for ${ds.slug}`);
  }
  const postBody = (await postRes.json()) as {
    rand?: string;
    filename?: string;
    rows?: number;
    size?: number;
    message?: string;
  };
  if (postBody.message !== 'success' || !postBody.rand || !postBody.filename) {
    throw new Error(`FEMC POST returned ${postBody.message ?? '(no msg)'} for ${ds.slug}: ${JSON.stringify(postBody)}`);
  }
  process.stdout.write(`  ${ds.slug}: ${postBody.rows ?? '?'} rows, ${postBody.size ?? '?'} MB queued; waiting for build …\n`);

  // Step 3: poll /CI4/temp for the prepared file. FEMC builds the CSV
  // server-side; small files appear in 2–4 s, the 12 MB Syracuse one
  // takes ~10 s. Retry every 3 s for up to 60 s.
  const tempUrl = `${FEMC_HOST}/CI4/temp/${postBody.rand}/${postBody.filename}`;
  const deadline = Date.now() + 60_000;
  let lastStatus: number | null = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3_000));
    const csvRes = await fetch(tempUrl, {
      headers: { 'User-Agent': UA, Cookie: cookie }
    });
    lastStatus = csvRes.status;
    if (csvRes.ok) {
      const text = await csvRes.text();
      if (text.length > 200) return text;
      // Sometimes FEMC returns a tiny "still building" stub; keep waiting.
    }
  }
  throw new Error(`FEMC tempfile not ready after 60s for ${ds.slug} (last ${lastStatus})`);
}

/** Parse a single line of CSV with quoted-field support. Returns the
 *  ordered array of field values for that row. Handles `""` escapes and
 *  preserves embedded commas / newlines inside quotes. Not a full RFC
 *  4180 parser, but FEMC's CSVs are well-behaved. */
function parseCsvLine(line: string, start: number): { fields: string[]; next: number } {
  const fields: string[] = [];
  let i = start;
  let field = '';
  let inQuote = false;
  while (i < line.length) {
    const c = line[i];
    if (inQuote) {
      if (c === '"' && line[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (c === '"') { inQuote = false; i++; continue; }
      field += c; i++;
    } else {
      if (c === '"' && field === '') { inQuote = true; i++; continue; }
      if (c === ',') { fields.push(field); field = ''; i++; continue; }
      if (c === '\n' || c === '\r') break;
      field += c; i++;
    }
  }
  fields.push(field);
  // Skip CRLF
  while (i < line.length && (line[i] === '\n' || line[i] === '\r')) i++;
  return { fields, next: i };
}

function parseCsv(text: string): { header: string[]; rows: Record<string, string>[] } {
  let i = 0;
  const { fields: header, next } = parseCsvLine(text, 0);
  i = next;
  const rows: Record<string, string>[] = [];
  while (i < text.length) {
    const { fields, next: n } = parseCsvLine(text, i);
    if (fields.length === 1 && fields[0] === '') { i = n; continue; }
    const row: Record<string, string> = {};
    for (let k = 0; k < header.length; k++) {
      row[header[k]] = fields[k] ?? '';
    }
    rows.push(row);
    i = n;
  }
  return { header, rows };
}

async function importOne(ds: FemcDatasetDef, dbUrl: string, userId: string): Promise<void> {
  const sourceId = `femc-${ds.slug}`;
  console.log(`Downloading ${ds.slug} from FEMC …`);
  const csv = await fetchFemcCsv(ds);
  const { header, rows } = parseCsv(csv);
  console.log(`  parsed ${rows.length} rows, ${header.length} columns`);

  const sql = postgres(dbUrl, { ssl: 'require', onnotice: () => undefined });
  try {
    const { regionId } = await registerImportSource(sql, {
      sourceId,
      name: `FEMC: ${ds.title}`,
      url: ds.datasetUrl,
      description:
        `${ds.title} — sourced from the UVM Forest Ecosystem ` +
        `Monitoring Cooperative (FEMC) data archive at uvm.edu/femc/CI4. ` +
        `License: ${ds.license}. Estimated ~${ds.estimatedRows.toLocaleString()} rows.`,
      regionName: ds.regionName,
      license: ds.license
    });

    await sql`select pg_advisory_lock(hashtext(${`${regionId}:${sourceId}`}))`;
    const runId = await startImportRun(sql, sourceId, userId);
    const summary: ImportRunSummary = {
      pinsCreated: 0,
      pinsUpdated: 0,
      pinsSkippedUnmatched: 0,
      errors: []
    };

    const species = await loadSpecies(sql);
    const matched: ImportRow[] = [];
    let outOfBbox = 0;
    let unmapped = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const m = ds.mapRow(r, i + 2); // line numbers are 1-indexed plus header
      if (!m) { unmapped++; continue; }
      if (
        m.lat < ds.bbox.minLat || m.lat > ds.bbox.maxLat ||
        m.lng < ds.bbox.minLng || m.lng > ds.bbox.maxLng
      ) {
        outOfBbox++;
        continue;
      }
      const rec: ImportRecord = {
        externalId: m.externalId,
        scientificName: m.latin ? normalizeSpeciesName(m.latin) : undefined,
        commonName: m.common,
        lng: m.lng,
        lat: m.lat,
        raw: r as unknown as Record<string, unknown>
      };
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
    console.log(`  ${ds.slug}: mapped ${matched.length} matched / ${rows.length} rows ` +
      `(${unmapped} skipped by mapper, ${outOfBbox} out-of-bbox, ` +
      `${summary.pinsSkippedUnmatched} species-unmatched)`);

    await sql`set session_replication_role = replica`;
    const BATCH = 500;
    for (let i = 0; i < matched.length; i += BATCH) {
      const slice = matched.slice(i, i + BATCH);
      try {
        const r = await bulkUpsertImportedPins(sql, {
          regionId,
          sourceId,
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
    await sql`set session_replication_role = origin`;

    await finishImportRun(sql, runId, summary);
    await sql`select pg_advisory_unlock(hashtext(${`${regionId}:${sourceId}`}))`;

    if (summary.pinsCreated > 0 || summary.pinsUpdated > 0) {
      try {
        await sql`select public.refresh_pin_density()`;
      } catch (err) {
        console.warn('  refresh_pin_density failed (non-fatal):',
          err instanceof Error ? err.message : err);
      }
    }

    console.log(`  ${ds.slug}: created=${summary.pinsCreated} updated=${summary.pinsUpdated} ` +
      `skipped=${summary.pinsSkippedUnmatched} errors=${summary.errors.length}`);
  } finally {
    await sql.end();
  }
}

async function main(): Promise<void> {
  const dbUrl = process.env.SUPABASE_DB_URL;
  const userId = process.env.FORAGER_DEV_USER_ID;
  if (!dbUrl) throw new Error('SUPABASE_DB_URL missing.');
  if (!userId) throw new Error('FORAGER_DEV_USER_ID missing.');

  const onlySlug = process.env.SLUG?.trim();
  const targets = onlySlug
    ? DATASETS.filter((d) => d.slug === onlySlug)
    : DATASETS;
  if (targets.length === 0) {
    throw new Error(`No matching FEMC dataset for SLUG="${onlySlug}". Known: ${DATASETS.map((d) => d.slug).join(', ')}`);
  }

  for (const ds of targets) {
    console.log(`\n=== ${ds.slug}: ${ds.title} (est ${ds.estimatedRows.toLocaleString()} rows) ===`);
    try {
      await importOne(ds, dbUrl, userId);
    } catch (err) {
      console.error(`  FAILED ${ds.slug}:`, err instanceof Error ? err.message : err);
      // Continue with next dataset.
    }
  }
}

main().catch((err) => {
  console.error('FEMC tree inventories import failed:', err);
  process.exit(1);
});
