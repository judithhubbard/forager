// Shared import logic: species lookup with normalization, idempotent
// pin upsert via direct Postgres, ImportRun bookkeeping.

import type { Sql } from 'postgres';

export interface ImportRecord {
  /** Stable id from the source dataset; used as import_external_id. */
  externalId: string;
  /** Best-guess scientific name (or common name as fallback). */
  scientificName?: string;
  commonName?: string;
  lng: number;
  lat: number;
  /** The full original record, stored verbatim in import_raw. */
  raw: unknown;
}

export interface RegisterImportSourceArgs {
  sourceId: string; // e.g. 'cornell-cti'
  name: string;
  url: string;
  description: string;
  regionName: string; // 'Ithaca shared'
  license?: string;
}

export async function registerImportSource(
  sql: Sql,
  args: RegisterImportSourceArgs
): Promise<{ regionId: string }> {
  const region = await sql<{ id: string }[]>`
    select id from regions where name = ${args.regionName} limit 1
  `;
  if (region.length === 0) {
    throw new Error(`Region "${args.regionName}" not found. Run npm run seed first.`);
  }
  const regionId = region[0].id;

  await sql`
    insert into import_sources (id, name, url, description, region_id, license)
    values (${args.sourceId}, ${args.name}, ${args.url}, ${args.description}, ${regionId}, ${args.license ?? null})
    on conflict (id) do update set
      name = excluded.name,
      url = excluded.url,
      description = excluded.description,
      license = excluded.license
  `;

  return { regionId };
}

export interface ImportRunSummary {
  pinsCreated: number;
  pinsUpdated: number;
  pinsSkippedUnmatched: number;
  errors: Array<{ externalId: string; message: string }>;
}

export async function startImportRun(
  sql: Sql,
  sourceId: string,
  triggeredByUserId: string | null
): Promise<string> {
  const run = await sql<{ id: string }[]>`
    insert into import_runs (import_source_id, triggered_by)
    values (${sourceId}, ${triggeredByUserId})
    returning id
  `;
  return run[0].id;
}

export async function finishImportRun(
  sql: Sql,
  runId: string,
  summary: ImportRunSummary
): Promise<void> {
  await sql`
    update import_runs set
      finished_at = now(),
      pins_created = ${summary.pinsCreated},
      pins_updated = ${summary.pinsUpdated},
      pins_skipped_unmatched = ${summary.pinsSkippedUnmatched},
      errors = ${sql.json(summary.errors)}
    where id = ${runId}
  `;
}

interface SpeciesRow {
  id: string;
  scientific_name: string;
  common_name: string;
  aliases: string[];
}

let speciesCache: SpeciesRow[] | null = null;

export async function loadSpecies(sql: Sql): Promise<SpeciesRow[]> {
  if (speciesCache) return speciesCache;
  const rows = await sql<SpeciesRow[]>`
    select id, scientific_name, common_name, aliases from species
  `;
  speciesCache = rows;
  return rows;
}

const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');

const GENUS_ONLY_PLACEHOLDERS = new Set(['species', 'spp', 'spp.', 'sp', 'sp.']);

/** True iff `target` is an unspecific genus reference (bare genus, "Genus
 *  species", "Genus sp", "Genus spp", etc). Specific species names like
 *  "Cornus kousa" return false — we never use the genus fallback for them. */
function isGenusOnly(target: string): boolean {
  const parts = norm(target).split(/\s+/);
  if (parts.length === 1) return true;
  if (parts.length === 2 && GENUS_ONLY_PLACEHOLDERS.has(parts[1])) return true;
  return false;
}

export function matchSpecies(
  species: SpeciesRow[],
  rec: ImportRecord
): SpeciesRow | null {
  const sciq = rec.scientificName ? norm(rec.scientificName) : '';
  const comq = rec.commonName ? norm(rec.commonName) : '';

  // 1) exact scientific name match
  if (sciq) {
    const hit = species.find((s) => norm(s.scientific_name) === sciq);
    if (hit) return hit;
  }
  // 2) common name match
  if (comq) {
    const hit = species.find((s) => norm(s.common_name) === comq);
    if (hit) return hit;
  }
  // 3) alias match
  if (sciq || comq) {
    const hit = species.find((s) =>
      (s.aliases ?? []).some((a) => norm(a) === sciq || norm(a) === comq)
    );
    if (hit) return hit;
  }
  // 4) genus-only fall-through — ONLY when the source explicitly indicates
  //    "any species in this genus" (e.g. "Amelanchier species"). Specific
  //    other species in the same genus (e.g. "Cornus kousa") are skipped
  //    rather than mis-matched to our species in the same genus.
  if (sciq && isGenusOnly(sciq)) {
    const targetGenus = sciq.split(/\s+/)[0];
    const hit = species.find(
      (s) => norm(s.scientific_name).split(/\s+/)[0] === targetGenus
    );
    if (hit) return hit;
  }
  return null;
}

export interface ImportRow {
  externalId: string;
  speciesId: string;
  lng: number;
  lat: number;
  raw: unknown;
}

/**
 * Bulk upsert of imported pins. Single round-trip per batch via INSERT ...
 * ON CONFLICT ... DO UPDATE. Idempotent re-runs:
 *   - new external IDs: inserted.
 *   - existing: refresh import_raw, refresh location IFF the user has not
 *     manually moved the pin (location_modified_by_user_at is null).
 *     User-edited fields (species_id, display_name, notes, status) are
 *     never touched.
 *
 * Uses RETURNING (xmax = 0) to distinguish inserts from updates.
 */
export async function bulkUpsertImportedPins(
  sql: Sql,
  args: {
    regionId: string;
    sourceId: string;
    userId: string;
    rows: ImportRow[];
  }
): Promise<{ created: number; updated: number }> {
  if (args.rows.length === 0) return { created: 0, updated: 0 };

  const externalIds = args.rows.map((r) => r.externalId);
  const speciesIds = args.rows.map((r) => r.speciesId);
  const lngs = args.rows.map((r) => r.lng);
  const lats = args.rows.map((r) => r.lat);
  const raws = args.rows.map((r) => JSON.stringify(r.raw ?? {}));

  const rows = await sql<{ id: string; inserted: boolean }[]>`
    insert into public.pins (
      region_id, created_by, species_id,
      location, status,
      import_source, import_external_id, import_raw
    )
    select
      ${args.regionId}::uuid,
      ${args.userId}::uuid,
      t.species_id::uuid,
      ST_SetSRID(ST_MakePoint(t.lng, t.lat), 4326)::geography,
      'active'::pin_status,
      ${args.sourceId},
      t.external_id,
      t.raw::jsonb
    from unnest(
      ${speciesIds}::uuid[],
      ${lngs}::float8[],
      ${lats}::float8[],
      ${externalIds}::text[],
      ${raws}::text[]
    ) as t(species_id, lng, lat, external_id, raw)
    on conflict (region_id, import_source, import_external_id) do update set
      import_raw = excluded.import_raw,
      location = case
        when public.pins.location_modified_by_user_at is null
          then excluded.location
        else public.pins.location
      end,
      updated_at = now()
    returning id, (xmax = 0) as inserted
  `;

  const created = rows.filter((r) => r.inserted).length;
  return { created, updated: rows.length - created };
}
