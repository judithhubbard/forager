// Seed species + Ithaca fruiting windows into Supabase.
//
// Default: insert-if-not-exists. Existing rows are NOT touched (admins may
// have edited windows via the app or directly in the DB).
//
// Run with:        npm run seed
// Force-overwrite: npm run seed -- --force
//
// Uses a direct Postgres connection (SUPABASE_DB_URL in .env.local) rather
// than going through PostgREST, because we need PostGIS literals for
// geography columns. Service-role key is not used.
//
// PLAN reference: §6.2 (filter), §10 (seed conventions, C20 functions).

import postgres from 'postgres';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import 'dotenv/config';

type SpeciesSeed = {
  scientific_name: string;
  common_name: string;
  aliases: string[];
  forage_parts: string[];
  safety_notes: string;
};

type StageWindow = { start_doy: number; end_doy: number; peak_doy?: number };

type IthacaWindowSeed = {
  scientific_name: string;
  stages: Partial<
    Record<'flowering' | 'green' | 'ripening' | 'ripe' | 'past' | 'bare', StageWindow[]>
  >;
};

const ITHACA = {
  name: 'Ithaca shared',
  climate_zone: '5b',
  timezone: 'America/New_York',
  // Cornell campus center; admins can move via the region settings UI later.
  default_lng: -76.4836,
  default_lat: 42.4534,
  default_zoom: 14
};

const FORCE = process.argv.includes('--force');

async function loadJson<T>(relPath: string): Promise<T> {
  const text = await readFile(resolve(process.cwd(), relPath), 'utf8');
  return JSON.parse(text) as T;
}

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) throw new Error('SUPABASE_DB_URL missing in environment.');

  const sql = postgres(dbUrl, { ssl: 'require', onnotice: () => undefined });

  console.log(`Seeding (force=${FORCE})...`);

  const speciesFile = await loadJson<{ schema_version: number; species: SpeciesSeed[] }>(
    'data/forageable_species.json'
  );
  if (speciesFile.schema_version !== 1) {
    throw new Error(`Unsupported forageable_species.json schema_version ${speciesFile.schema_version}`);
  }

  const ithacaFile = await loadJson<{
    schema_version: number;
    region: string;
    windows: IthacaWindowSeed[];
  }>('data/species/ithaca.json');
  if (ithacaFile.schema_version !== 1) {
    throw new Error(`Unsupported ithaca.json schema_version ${ithacaFile.schema_version}`);
  }

  // Region: ensure exists, set default center via PostGIS.
  let region = await sql<{ id: string }[]>`select id from regions where name = ${ITHACA.name} limit 1`;
  if (region.length === 0) {
    region = await sql<{ id: string }[]>`
      insert into regions (name, climate_zone, timezone, default_zoom, default_map_center)
      values (
        ${ITHACA.name},
        ${ITHACA.climate_zone},
        ${ITHACA.timezone},
        ${ITHACA.default_zoom},
        ST_SetSRID(ST_MakePoint(${ITHACA.default_lng}, ${ITHACA.default_lat}), 4326)::geography
      )
      returning id
    `;
  }
  const regionId = region[0].id;
  console.log(`  region "${ITHACA.name}": ${regionId}`);

  // Species: insert-if-not-exists; --force replaces.
  let speciesWritten = 0;
  let speciesKept = 0;
  for (const s of speciesFile.species) {
    const existing = await sql<{ id: string }[]>`
      select id from species where scientific_name = ${s.scientific_name} limit 1
    `;
    if (existing.length > 0 && !FORCE) {
      speciesKept++;
      continue;
    }
    if (existing.length > 0 && FORCE) {
      await sql`
        update species set
          common_name = ${s.common_name},
          aliases = ${s.aliases},
          forage_parts = ${s.forage_parts},
          safety_notes = ${s.safety_notes}
        where id = ${existing[0].id}
      `;
    } else {
      await sql`
        insert into species (scientific_name, common_name, aliases, forage_parts, safety_notes, is_forageable)
        values (${s.scientific_name}, ${s.common_name}, ${s.aliases}, ${s.forage_parts}, ${s.safety_notes}, true)
      `;
    }
    speciesWritten++;
  }
  console.log(`  species: ${speciesWritten} written, ${speciesKept} kept`);

  // Fruiting windows: keyed on (species, region, stage, start_doy).
  let winWritten = 0;
  let winKept = 0;
  for (const w of ithacaFile.windows) {
    const sp = await sql<{ id: string }[]>`
      select id from species where scientific_name = ${w.scientific_name} limit 1
    `;
    if (sp.length === 0) {
      console.warn(`  ! species not found: ${w.scientific_name} (skipping)`);
      continue;
    }
    const speciesId = sp[0].id;

    for (const [stage, ranges] of Object.entries(w.stages)) {
      if (!ranges) continue;
      for (const r of ranges) {
        const existing = await sql<{ id: string }[]>`
          select id from species_fruiting_windows
          where species_id = ${speciesId}
            and region_id  = ${regionId}
            and stage      = ${stage}
            and start_doy  = ${r.start_doy}
          limit 1
        `;
        if (existing.length > 0 && !FORCE) {
          winKept++;
          continue;
        }
        if (existing.length > 0 && FORCE) {
          await sql`
            update species_fruiting_windows
               set end_doy = ${r.end_doy}, peak_doy = ${r.peak_doy ?? null}
             where id = ${existing[0].id}
          `;
        } else {
          await sql`
            insert into species_fruiting_windows
              (species_id, region_id, stage, start_doy, end_doy, peak_doy)
            values
              (${speciesId}, ${regionId}, ${stage}, ${r.start_doy}, ${r.end_doy}, ${r.peak_doy ?? null})
          `;
        }
        winWritten++;
      }
    }
  }
  console.log(`  fruiting windows: ${winWritten} written, ${winKept} kept`);

  await sql.end();
  console.log('Done.');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
