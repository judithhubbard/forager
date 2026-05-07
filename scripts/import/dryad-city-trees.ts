// Dryad "5 million city trees from 63 US cities"
//   Dataset DOI: 10.5061/dryad.2jm63xsrf
//   Landing:     https://datadryad.org/dataset/doi:10.5061/dryad.2jm63xsrf
//
// Each Dryad release ships per-city CSVs (Albuquerque_NM.csv,
// New_York_NY.csv, …) plus a Column_Headers_Dryad.csv defining the 28
// shared columns and a README_Dryad.txt. This script imports any
// subset of those CSVs as separate runs (one sourceId per city) into
// a single shared region so the public layer gets coverage in dozens
// of US cities at once.
//
// Why local files instead of a fetch:
//   - The August 2022 release is ~1.24 GB across 60 files. Pulling
//     that through the script would hammer Dryad's bandwidth limits
//     and is fragile mid-import.
//   - You'll typically curate which cities to import (skip ones we
//     already scrape directly), and re-run individual cities after
//     fixing schema quirks.
// Download the dataset manually, unzip, then point this script at the
// directory (or a single CSV) via --dir / --file.
//
// Why one region for all cities:
//   - Authed users join regions by membership; they don't join 60
//     city regions. The public layer doesn't care about region for
//     visibility (RLS gates on visibility='public', not region).
//   - Per-city sourceIds (`dryad-trees-<slug>`) still let us track
//     each city's import_runs separately.
//
// Usage:
//   npm run import:dryad-trees -- --dir /path/to/dryad/
//   npm run import:dryad-trees -- --file /path/to/Boston_MA.csv
//   npm run import:dryad-trees -- --dir … --skip nyc-ny,chicago-il
//   npm run import:dryad-trees -- --dir … --only boston-ma,detroit-mi
//
// By default we skip cities we already have dedicated importers for
// (NYC, Chicago, SF, Boston) so re-importing through Dryad doesn't
// double-pin those areas.
//
// Environment: SUPABASE_DB_URL + FORAGER_DEV_USER_ID (same as the
// other importers).

import { readFileSync, readdirSync, statSync, createReadStream } from 'node:fs';
import { resolve, basename, join } from 'node:path';
import { createInterface } from 'node:readline';
import postgres from 'postgres';
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
import { normalizeSpeciesName } from './lib/framework';

loadEnv({ path: resolve(process.cwd(), '.env.local') });
loadEnv({ path: resolve(process.cwd(), '.env') });

const REGION_NAME = 'Dryad city trees (US)';
const REGION_TIMEZONE = 'America/New_York'; // arbitrary — region timezone
                                            // only affects fruiting-window
                                            // computation, which uses the
                                            // pin's climate zone anyway.
// Cities we have direct scrapes for; Dryad's copy is skipped by default
// to avoid double-importing pins. Slugs follow fileToCity()'s output:
// CamelCase cities get hyphenated ('NewYork' → 'new-york'); cities with
// glued state codes like 'AuroraCO' get '-co' appended. Toronto isn't
// in the Dryad set (it's US-only).
const DEFAULT_SKIP = new Set([
  'new-york', 'boston', 'san-francisco'
  // Chicago isn't in the Dryad release.
]);

// ---------- CLI parsing ----------

interface CliArgs {
  dir?: string;
  file?: string;
  skip: Set<string>;
  only?: Set<string>;
  region: string;
  dryRun: boolean;
}

function parseCli(argv: string[]): CliArgs {
  const args: CliArgs = {
    skip: new Set(DEFAULT_SKIP),
    region: REGION_NAME,
    dryRun: false
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir')           args.dir = argv[++i];
    else if (a === '--file')     args.file = argv[++i];
    else if (a === '--region')   args.region = argv[++i];
    else if (a === '--dry-run')  args.dryRun = true;
    else if (a === '--skip')     args.skip = new Set(argv[++i].split(',').map(s => s.trim().toLowerCase()));
    else if (a === '--only')     args.only = new Set(argv[++i].split(',').map(s => s.trim().toLowerCase()));
    else if (a === '--no-default-skip') args.skip = new Set();
    else if (a === '-h' || a === '--help') { printHelp(); process.exit(0); }
  }
  if (!args.dir && !args.file) {
    console.error('Need --dir <path> or --file <path>.');
    printHelp();
    process.exit(2);
  }
  return args;
}

function printHelp(): void {
  console.log(`Usage:
  npm run import:dryad-trees -- --dir /path/to/dryad/
  npm run import:dryad-trees -- --file /path/to/Boston_MA.csv

Options:
  --dir <path>        Directory of *.csv city files from the Dryad release.
  --file <path>       Single city CSV (overrides --dir for one run).
  --skip <cities>     Comma-separated city slugs to skip (e.g. nyc-ny,sf-ca).
                      Defaults to cities we already have direct scrapes for:
                      ${[...DEFAULT_SKIP].join(', ')}
  --only <cities>     Comma-separated allowlist; overrides --skip.
  --no-default-skip   Don't apply the default skip-list (force re-import of
                      cities we already have).
  --region <name>     Destination region (default: "${REGION_NAME}").
  --dry-run           Parse + count matchable rows but don't write to DB.
`);
}

// ---------- Forageable genera (cheap pre-filter) ----------

interface SpeciesJson {
  species: Array<{
    scientific_name: string;
    common_name: string;
    aliases?: string[];
  }>;
}

/** Build the set of genera (lowercased first word of scientific_name)
 *  we'd potentially want to keep. Used as a cheap pre-filter while
 *  streaming each CSV — rows whose genus isn't in this set are dropped
 *  before they consume any of the framework's heavier matching logic. */
function loadForageableGenera(): Set<string> {
  const path = resolve(process.cwd(), 'data/forageable_species.json');
  const data = JSON.parse(readFileSync(path, 'utf8')) as SpeciesJson;
  const genera = new Set<string>();
  for (const s of data.species) {
    const first = s.scientific_name.trim().split(/\s+/)[0];
    if (first) genera.add(first.toLowerCase());
  }
  return genera;
}

// ---------- City filename → slug + display name ----------

/** Parse the Dryad city CSV filename into a stable slug + display name.
 *  Real shapes seen in the dataset:
 *    Albuquerque_Final_2022-06-18.csv          → 'albuquerque'              | 'Albuquerque'
 *    NewYork_Final_2022-06-18.csv              → 'new-york'                 | 'New York'
 *    AuroraCO_Final_2022-06-18.csv             → 'aurora-co'                | 'Aurora, CO'
 *    WashingtonDC_Final_2022-06-18.csv         → 'washington-dc'            | 'Washington, DC'
 *    SanFrancisco_Final_2022-06-18.csv         → 'san-francisco'            | 'San Francisco'
 *  Strategy:
 *    1. Strip the '_Final_<YYYY-MM-DD>(.csv)' suffix.
 *    2. If the result ends with 2 uppercase letters glued to a CamelCase
 *       run (AuroraCO, WashingtonDC), peel them off as the state code.
 *    3. Split CamelCase to get a 'New York' / 'San Francisco' display.
 *    4. lowercase + hyphenate for the slug. */
function fileToCity(filename: string): { slug: string; display: string } {
  const base = basename(filename, '.csv');
  // Strip '_Final_<YYYY-MM-DD>' or any trailing '_<YYYY-MM-DD>'.
  const withoutSuffix = base
    .replace(/_Final_\d{4}-\d{2}-\d{2}$/i, '')
    .replace(/_\d{4}-\d{2}-\d{2}$/, '');
  // Split a trailing 2-char uppercase state code if it's glued to a
  // lowercase letter (City + State pattern). Match the *last* capital
  // pair preceded by a lowercase to avoid splitting in the middle of
  // CamelCase city names like SanJose.
  let cityRaw = withoutSuffix;
  let state: string | null = null;
  const stateMatch = cityRaw.match(/^(.+?[a-z])([A-Z]{2})$/);
  if (stateMatch) {
    cityRaw = stateMatch[1];
    state = stateMatch[2];
  }
  // CamelCase split: 'NewYork' → 'New York', 'SanFrancisco' → 'San Francisco'.
  const display = cityRaw.replace(/([a-z])([A-Z])/g, '$1 $2');
  const citySlug = display.toLowerCase().replace(/\s+/g, '-');
  return state
    ? { slug: `${citySlug}-${state.toLowerCase()}`, display: `${display}, ${state}` }
    : { slug: citySlug, display };
}

// ---------- CSV parsing (line-based, quote-aware) ----------

/** Tokenize a single CSV line. Handles double-quoted fields with embedded
 *  commas; does NOT handle embedded newlines (Dryad's per-tree rows are
 *  single-line so this is fine). Returns the array of unquoted field values. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  let cur = '';
  let inQuotes = false;
  while (i < line.length) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i += 2; continue; }
      if (c === '"') { inQuotes = false; i++; continue; }
      cur += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { out.push(cur); cur = ''; i++; continue; }
    cur += c; i++;
  }
  out.push(cur);
  return out;
}

/** Pick the column index from `header` whose lowercased name first matches
 *  any of the candidates (substring match; whichever is found first wins).
 *  Returns -1 if none match. */
function findCol(header: string[], candidates: string[]): number {
  const lower = header.map(h => h.toLowerCase().trim());
  for (let i = 0; i < lower.length; i++) {
    for (const c of candidates) {
      if (lower[i] === c) return i; // exact match wins
    }
  }
  for (let i = 0; i < lower.length; i++) {
    for (const c of candidates) {
      if (lower[i].includes(c)) return i; // substring fallback
    }
  }
  return -1;
}

interface CsvSchema {
  iSci: number;       // scientific name
  iCommon: number;    // common name (optional)
  iLat: number;
  iLng: number;
  iId: number;        // tree id (optional)
}

function detectSchema(header: string[]): CsvSchema {
  return {
    iSci:    findCol(header, ['scientific_name', 'sci_name', 'latin_name', 'species_sci', 'spc_latin', 'botanical_name', 'genus_species']),
    iCommon: findCol(header, ['common_name', 'spc_common', 'name_common']),
    iLat:    findCol(header, ['latitude', 'lat']),
    iLng:    findCol(header, ['longitude', 'lng', 'lon', 'long']),
    iId:     findCol(header, ['tree_id', 'treeid', 'objectid', 'object_id', 'id'])
  };
}

interface ParsedRow {
  externalId: string;
  scientificName: string;
  commonName?: string;
  lng: number;
  lat: number;
  raw: Record<string, string>;
}

/** Stream a city CSV from disk, applying the genus pre-filter while reading.
 *  Memory cost is bounded by the *kept* rows (matching genera), not the
 *  total file size — typically 5–10% of input. Returns kept rows + the
 *  total rows read for reporting. */
async function streamCsvFiltered(
  filePath: string,
  genera: Set<string>
): Promise<{ rows: ParsedRow[]; total: number; schema: CsvSchema; header: string[] }> {
  const stream = createReadStream(filePath, { encoding: 'utf8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  const rows: ParsedRow[] = [];
  let header: string[] | null = null;
  let schema: CsvSchema | null = null;
  let total = 0;
  for await (const line of rl) {
    if (!line) continue;
    if (!header) {
      header = splitCsvLine(line);
      schema = detectSchema(header);
      if (schema.iSci < 0 || schema.iLat < 0 || schema.iLng < 0) {
        throw new Error(
          `Could not locate scientific_name / lat / lng columns in ${basename(filePath)}\n` +
          `header: ${header.join(', ')}`
        );
      }
      continue;
    }
    total++;
    const fields = splitCsvLine(line);
    const sciRaw = fields[schema!.iSci];
    if (!sciRaw) continue;
    const genus = sciRaw.trim().split(/\s+/)[0];
    if (!genus || !genera.has(genus.toLowerCase())) continue;
    const lat = Number(fields[schema!.iLat]);
    const lng = Number(fields[schema!.iLng]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const id = schema!.iId >= 0 ? fields[schema!.iId] : '';
    const raw: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) raw[header[i]] = fields[i] ?? '';
    rows.push({
      externalId: id || `${lng.toFixed(6)},${lat.toFixed(6)}`,
      scientificName: sciRaw.trim(),
      commonName: schema!.iCommon >= 0 ? fields[schema!.iCommon] : undefined,
      lng,
      lat,
      raw
    });
  }
  return { rows, total, schema: schema!, header: header! };
}

// ---------- Region provisioning ----------

/** Create the destination region if it doesn't exist. The Dryad import
 *  spans dozens of cities; the existing per-city importers each require
 *  a pre-provisioned region, but having 60 hand-created regions for one
 *  dataset is more friction than value, so we do it inline here. */
async function ensureRegion(
  sql: ReturnType<typeof postgres>,
  name: string
): Promise<void> {
  const existing = await sql<{ id: string }[]>`
    select id from public.regions where name = ${name} limit 1
  `;
  if (existing.length > 0) return;
  console.log(`Region "${name}" not found — creating.`);
  await sql`
    insert into public.regions (name, timezone)
    values (${name}, ${REGION_TIMEZONE})
  `;
}

// ---------- Main ----------

async function importCity(
  sql: ReturnType<typeof postgres>,
  filePath: string,
  args: CliArgs,
  genera: Set<string>,
  userId: string
): Promise<void> {
  const { slug, display } = fileToCity(filePath);
  if (args.only && !args.only.has(slug)) {
    console.log(`SKIP ${display}: not in --only list`);
    return;
  }
  if (!args.only && args.skip.has(slug)) {
    console.log(`SKIP ${display}: in --skip list`);
    return;
  }
  console.log(`\n=== ${display} (${slug}) ===`);
  console.log(`  reading ${filePath} …`);

  const { rows, total } = await streamCsvFiltered(filePath, genera);
  console.log(`  ${total} rows scanned, ${rows.length} match a forageable genus`);

  if (rows.length === 0) {
    console.log('  nothing to import');
    return;
  }

  if (args.dryRun) {
    console.log('  --dry-run: not writing to DB');
    return;
  }

  const sourceId = `dryad-trees-${slug}`;
  const { regionId } = await registerImportSource(sql, {
    sourceId,
    name: `Dryad: ${display} city trees`,
    url: 'https://doi.org/10.5061/dryad.2jm63xsrf',
    description:
      `City tree inventory for ${display} from the Dryad ` +
      '"5 million city trees from 63 US cities" dataset (2022).',
    regionName: args.region,
    license: 'CC0 1.0 (Dryad default — verify on dataset page)'
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
  // Dedupe by externalId. Dryad's tree_ID is supposed to be unique
  // per city but in practice some cities have repeats (and rows with
  // missing tree_ID share the lat/lng-derived fallback). The bulk
  // upsert's ON CONFLICT (region_id, import_source, import_external_id)
  // can't update the same row twice in one INSERT — duplicates here
  // would fail the entire batch. Keep the first occurrence; later
  // duplicates lose any divergent data, but it's the same source row
  // 99% of the time.
  const seenIds = new Set<string>();
  let dupCount = 0;
  const matched: ImportRow[] = [];
  for (const r of rows) {
    if (seenIds.has(r.externalId)) { dupCount++; continue; }
    seenIds.add(r.externalId);
    const sci = normalizeSpeciesName(r.scientificName);
    const sp = matchSpecies(species, {
      externalId: r.externalId,
      scientificName: sci,
      commonName: r.commonName,
      lng: r.lng,
      lat: r.lat,
      raw: r.raw
    });
    if (!sp) { summary.pinsSkippedUnmatched++; continue; }
    matched.push({
      externalId: r.externalId,
      speciesId: sp.id,
      lng: r.lng,
      lat: r.lat,
      raw: r.raw
    });
  }
  if (dupCount > 0) console.log(`  dropped ${dupCount} duplicate tree_IDs within file`);
  console.log(`  matched ${matched.length}/${rows.length} rows to species catalog`);

  // Same trigger-disable dance as runImport(): the public-visibility
  // gate trigger checks auth.uid() against the global-admin profile,
  // which is null when connecting via SUPABASE_DB_URL as the DB owner.
  // Density grid triggers are disabled to keep the bulk insert from
  // re-aggregating per row; one refresh_pin_density() call at the end
  // brings the grid back in sync.
  await sql`alter table public.pins disable trigger tg_gate_public_pins`;
  await sql`alter table public.pins disable trigger tg_pin_density_track_ins`;
  await sql`alter table public.pins disable trigger tg_pin_density_track_upd`;
  await sql`alter table public.pins disable trigger tg_pin_density_track_del`;
  try {
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
  } finally {
    await sql`alter table public.pins enable trigger tg_gate_public_pins`;
    await sql`alter table public.pins enable trigger tg_pin_density_track_ins`;
    await sql`alter table public.pins enable trigger tg_pin_density_track_upd`;
    await sql`alter table public.pins enable trigger tg_pin_density_track_del`;
  }

  await finishImportRun(sql, runId, summary);
  await sql`select pg_advisory_unlock(hashtext(${`${regionId}:${sourceId}`}))`;

  console.log(`  → +${summary.pinsCreated} created · ${summary.pinsUpdated} updated · ` +
              `${summary.pinsSkippedUnmatched} skipped (unmatched) · ${summary.errors.length} errors`);
}

function listCsvFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  return entries
    .filter(f => f.toLowerCase().endsWith('.csv'))
    .filter(f => !/column[_ ]?headers/i.test(f) && !/^readme/i.test(f))
    .map(f => join(dir, f))
    .filter(p => statSync(p).isFile())
    .sort();
}

async function main(): Promise<void> {
  const args = parseCli(process.argv.slice(2));
  const dbUrl = process.env.SUPABASE_DB_URL;
  const userId = process.env.FORAGER_DEV_USER_ID;
  if (!dbUrl) throw new Error('SUPABASE_DB_URL missing.');
  if (!userId) throw new Error('FORAGER_DEV_USER_ID missing.');

  const genera = loadForageableGenera();
  console.log(`Forageable genera: ${[...genera].sort().join(', ')}`);

  const files = args.file
    ? [resolve(args.file)]
    : listCsvFiles(resolve(args.dir!));
  console.log(`Found ${files.length} CSV file(s) to consider.`);

  const sql = postgres(dbUrl, { ssl: 'require', onnotice: () => undefined });
  try {
    if (!args.dryRun) await ensureRegion(sql, args.region);
    for (const f of files) {
      try {
        await importCity(sql, f, args, genera, userId);
      } catch (err) {
        console.error(`FAILED ${basename(f)}:`, err instanceof Error ? err.message : err);
      }
    }
    if (!args.dryRun) {
      try {
        await sql`select public.refresh_pin_density()`;
        console.log('\nRefreshed pin_density_grid');
      } catch (err) {
        console.warn('refresh_pin_density failed (non-fatal):',
          err instanceof Error ? err.message : err);
      }
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('Dryad import failed:', err);
  process.exit(1);
});
