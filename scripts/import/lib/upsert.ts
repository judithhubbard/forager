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

/** Genus-only fuzzy match: "Amelanchier" matches any A. species in our list. */
function startsWithGenus(scientific: string, target: string): boolean {
  const a = norm(scientific).split(' ');
  const b = norm(target).split(' ');
  return a[0] === b[0];
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
  // 4) genus-only fall-through (Amelanchier sp. → first matching genus)
  if (sciq) {
    const hit = species.find((s) => startsWithGenus(s.scientific_name, sciq));
    if (hit) return hit;
  }
  return null;
}

export interface UpsertResult {
  created: boolean;
  updated: boolean;
  pinId: string;
}

/**
 * Idempotent upsert: keyed by (region_id, import_source, import_external_id).
 * - If pin doesn't exist: insert with location, status=active.
 * - If pin exists: refresh import_raw, refresh location IFF user hasn't moved it
 *   (location_modified_by_user_at is null), never touch user-edited fields.
 */
export async function upsertImportedPin(
  sql: Sql,
  args: {
    regionId: string;
    sourceId: string;
    externalId: string;
    speciesId: string;
    lng: number;
    lat: number;
    raw: unknown;
    userId: string;
  }
): Promise<UpsertResult> {
  const existing = await sql<{ id: string; location_modified_by_user_at: Date | null }[]>`
    select id, location_modified_by_user_at
      from pins
     where region_id = ${args.regionId}
       and import_source = ${args.sourceId}
       and import_external_id = ${args.externalId}
     limit 1
  `;

  if (existing.length === 0) {
    const inserted = await sql<{ id: string }[]>`
      insert into pins (
        region_id, created_by, species_id,
        location, status,
        import_source, import_external_id, import_raw
      ) values (
        ${args.regionId}, ${args.userId}, ${args.speciesId},
        ST_SetSRID(ST_MakePoint(${args.lng}, ${args.lat}), 4326)::geography,
        'active',
        ${args.sourceId}, ${args.externalId}, ${sql.json(args.raw as object)}
      )
      returning id
    `;
    return { created: true, updated: false, pinId: inserted[0].id };
  }

  const userMoved = existing[0].location_modified_by_user_at !== null;
  if (userMoved) {
    // User edited location; only refresh import_raw.
    await sql`
      update pins set
        import_raw = ${sql.json(args.raw as object)}
       where id = ${existing[0].id}
    `;
  } else {
    await sql`
      update pins set
        import_raw = ${sql.json(args.raw as object)},
        location = ST_SetSRID(ST_MakePoint(${args.lng}, ${args.lat}), 4326)::geography
       where id = ${existing[0].id}
    `;
  }
  return { created: false, updated: true, pinId: existing[0].id };
}
