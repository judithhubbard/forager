// iNaturalist research-grade observation ingest (Round E).
//
// For each forageable species in the catalog, pulls research-grade
// observations from the iNat API and inserts them as pins under the
// 'iNaturalist research-grade public' region. Major differentiator
// vs the municipal pipeline: covers wild populations of HERBS,
// MUSHROOMS, BERRIES, FLOWERS, ROOTS — categories municipal tree
// inventories never include. The municipal pipeline gives us street
// trees; iNat gives us everything else.
//
// LICENSE FILTER (critical for the paid tier).
//
// iNat's default license for user-contributed Content is CC BY-NC
// (Attribution-NonCommercial), incompatible with a paid product.
// Per their ToS (verified 2026-05-11): "Unless you specify otherwise
// when you post Content, you agree to license Content you contribute
// to the Platform under the Creative Commons Attribution Noncommercial
// license (CC BY-NC)."
//
// We filter at the API level via `license=cc0,cc-by` so we only ingest
// observations the contributor explicitly opted into commercial-OK
// licenses. Roughly 20-25% of iNat observations qualify. The remaining
// ~75% (CC BY-NC default) are skipped.
//
// Photos are NOT pulled. Each photo carries its own license_code that
// is independent of the observation's license. If photos are added
// later, filter `photos[].license_code` separately.
//
// AI training is also explicitly banned by the ToS — not relevant for
// this read/display pipeline but worth knowing.
//
// SAFETY FILTERS (separate from license):
//
//   - quality_grade=research (community-confirmed ID, not 'Needs ID')
//   - geoprivacy = 'open' only (skip 'obscured' and 'private' — those
//     coordinates are deliberately fuzzed by the contributor to ~30km
//     for sensitive species)
//   - positional_accuracy <= 1000m (drop pins we can't place precisely)
//   - per-species cap (default 1000) so a single hot species doesn't
//     dominate the import volume
//
// ATTRIBUTION: each pin's import_raw payload preserves the iNat
// observer's username, the observation URL, and the license_code so
// the calibration/pin viewer can render proper attribution.
//
// Run: npx tsx scripts/import/inat-observations.ts
//      npx tsx scripts/import/inat-observations.ts "Grifola frondosa"
//      npx tsx scripts/import/inat-observations.ts --max-per-species 200
//
// Pre-req: an 'iNaturalist research-grade public' region row.

import { runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'inaturalist-research-grade';
const REGION_NAME = 'iNaturalist research-grade public';

const INAT_USER_AGENT =
  'forager-research/1.0 (' +
  (process.env.FORAGER_CONTACT_EMAIL || 'forager-research@example.invalid') +
  ')';

// CLI args:
//   positional arg = specific scientific name(s) to ingest (else all forageable)
//   --max-per-species <n> = per-species cap (default 1000)
//   --batch <n> = limit how many species to process this run (default Infinity)
const args = process.argv.slice(2);
const maxPerSpeciesIdx = args.indexOf('--max-per-species');
const MAX_PER_SPECIES = maxPerSpeciesIdx >= 0
  ? parseInt(args[maxPerSpeciesIdx + 1], 10)
  : 1000;
const batchIdx = args.indexOf('--batch');
const SPECIES_BATCH = batchIdx >= 0 ? parseInt(args[batchIdx + 1], 10) : Infinity;
const explicitSpecies = args.filter((a, i) => !a.startsWith('--')
  && args[i - 1] !== '--max-per-species'
  && args[i - 1] !== '--batch');

// Safety thresholds
const MAX_POSITIONAL_ACCURACY_M = 1000; // skip pins fuzzier than ~city-block

interface InatObservation {
  id: number;
  uuid?: string;
  species_guess?: string;
  observed_on?: string | null;
  location?: string | null;        // "lat,lng" string
  positional_accuracy?: number | null;
  geoprivacy?: 'open' | 'obscured' | 'private' | null;
  taxon_geoprivacy?: 'open' | 'obscured' | 'private' | null;
  obscured?: boolean;
  license_code?: string | null;    // 'cc0' | 'cc-by' | 'cc-by-nc' | ...
  taxon?: {
    id: number;
    name: string;
    rank: string;
    preferred_common_name?: string;
  };
  user?: { login?: string };
  uri?: string;
}

/** Look up an iNat taxon_id by scientific name. */
async function inatTaxonId(scientificName: string): Promise<number | null> {
  const url = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(scientificName)}&is_active=true`;
  const r = await fetch(url, { headers: { 'User-Agent': INAT_USER_AGENT } });
  if (!r.ok) throw new Error(`iNat taxa lookup ${r.status} for ${scientificName}`);
  const j = (await r.json()) as { results?: Array<{ id: number; name: string; iconic_taxon_name?: string; rank?: string }> };
  const hits = j.results ?? [];
  // Prefer exact scientific-name match at species/genus rank.
  const exact = hits.find((t) => t.name?.toLowerCase() === scientificName.toLowerCase());
  return exact?.id ?? hits[0]?.id ?? null;
}

/** Pull research-grade, openly-licensed observations for one species.
 *  Paginates until cap or end-of-results. */
async function pullSpeciesObservations(
  scientificName: string,
  taxonId: number,
  maxObs: number
): Promise<InatObservation[]> {
  const out: InatObservation[] = [];
  const PAGE = 200;
  for (let page = 1; out.length < maxObs; page++) {
    const params = new URLSearchParams({
      taxon_id: String(taxonId),
      quality_grade: 'research',
      // CRITICAL: license filter so we only ingest commercial-compatible obs.
      license: 'cc0,cc-by',
      geo: 'true',
      per_page: String(PAGE),
      page: String(page),
      // Skip suppressed-coord obs at the API level when possible. iNat
      // also exposes `geoprivacy` and `taxon_geoprivacy` per observation;
      // we double-check those below.
      geoprivacy: 'open',
      taxon_geoprivacy: 'open'
    });
    const url = `https://api.inaturalist.org/v1/observations?${params.toString()}`;
    const r = await fetch(url, { headers: { 'User-Agent': INAT_USER_AGENT } });
    if (!r.ok) {
      if (r.status === 429) {
        // Rate-limited — back off and retry the same page.
        await new Promise((s) => setTimeout(s, 2000));
        page--;
        continue;
      }
      throw new Error(`iNat observations ${r.status} for taxon ${taxonId}`);
    }
    const body = (await r.json()) as { results?: InatObservation[]; total_results?: number };
    const results = body.results ?? [];
    if (results.length === 0) break;
    out.push(...results);
    const total = body.total_results ?? 0;
    if (out.length >= total) break;
    if (page * PAGE >= total) break;
    // Polite pacing — 1 req/sec is iNat's recommended max.
    await new Promise((s) => setTimeout(s, 1000));
  }
  return out.slice(0, maxObs);
}

/** Map a raw observation to an ImportRecord, or null to skip. Applies
 *  the safety filters: must have open geo, sub-1km accuracy, parseable
 *  coords, and a usable taxon. */
function mapObs(obs: InatObservation, fallbackSci: string): ImportRecord | null {
  // Geo-privacy: paranoid — skip anything not explicitly 'open'.
  if (obs.geoprivacy && obs.geoprivacy !== 'open') return null;
  if (obs.taxon_geoprivacy && obs.taxon_geoprivacy !== 'open') return null;
  if (obs.obscured) return null;
  // Location
  if (!obs.location) return null;
  const [latStr, lngStr] = obs.location.split(',');
  const lat = Number.parseFloat(latStr);
  const lng = Number.parseFloat(lngStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  // Accuracy
  const acc = obs.positional_accuracy;
  if (acc != null && acc > MAX_POSITIONAL_ACCURACY_M) return null;
  // License — double-check (API filter is the primary; this is defense
  // in depth in case iNat ever serves a non-matching record).
  const lic = (obs.license_code ?? '').toLowerCase();
  if (lic !== 'cc0' && lic !== 'cc-by' && lic !== 'cc-by-4.0') return null;
  // Species name — fall back to the per-species lookup if iNat's taxon
  // is a sub-species or variety; the matchSpecies binomial fallback
  // will pull it back to the parent species in our catalog.
  const sci = obs.taxon?.name ?? fallbackSci;
  return {
    externalId: String(obs.id),
    scientificName: sci,
    commonName: obs.taxon?.preferred_common_name,
    lng,
    lat,
    raw: {
      // Minimal attribution payload — keep small. The full obs is
      // available via the URL if needed for audit.
      inat_id: obs.id,
      uuid: obs.uuid,
      observer: obs.user?.login,
      observed_on: obs.observed_on,
      license_code: obs.license_code,
      uri: obs.uri ?? `https://www.inaturalist.org/observations/${obs.id}`,
      positional_accuracy_m: obs.positional_accuracy
    }
  };
}

/** Build the species list. Defaults to all forageable species; CLI
 *  args narrow to a specific set. */
async function pickSpecies(): Promise<string[]> {
  if (explicitSpecies.length > 0) return explicitSpecies;
  // Pull from DB directly via a one-shot connection (the import
  // framework's loadSpecies is called by runImport later for matching).
  const { default: postgres } = await import('postgres');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const env = fs.readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf8');
  const url = env.match(/SUPABASE_DB_URL=(.+)/)![1].trim();
  const sql = postgres(url, { ssl: 'require', onnotice: () => undefined });
  try {
    const rows = await sql<{ scientific_name: string }[]>`
      select scientific_name from species
       where is_forageable = true and scientific_name is not null
       order by scientific_name`;
    return rows.map((r) => r.scientific_name);
  } finally {
    await sql.end();
  }
}

const config: ImportConfig<InatObservation> = {
  sourceId: SOURCE_ID,
  sourceName: 'iNaturalist research-grade observations (CC0 + CC-BY only)',
  sourceUrl: 'https://www.inaturalist.org/observations',
  sourceDescription:
    'Research-grade observations from iNaturalist where the contributor has explicitly licensed under CC0 or CC-BY (commercial-compatible). ' +
    'Photos NOT included (per-photo licenses vary). Filtered to open geoprivacy, sub-1km positional accuracy. ' +
    'Default license on iNaturalist is CC-BY-NC, which we do NOT ingest; ~20-25% of iNat observations qualify under cc0/cc-by. ' +
    'Each pin carries the observer username + observation URL in import_raw for proper attribution.',
  regionName: REGION_NAME,
  license: 'CC0 + CC-BY (per-observation; observer attribution preserved in import_raw)',
  async fetchAll() {
    const speciesList = (await pickSpecies()).slice(0, SPECIES_BATCH);
    console.log(`  iNat ingest: ${speciesList.length} species, max ${MAX_PER_SPECIES} obs each`);
    console.log(`  License filter: cc0,cc-by ONLY (skipping CC BY-NC default)`);
    const all: InatObservation[] = [];
    let processed = 0;
    for (const sci of speciesList) {
      processed++;
      const taxonId = await inatTaxonId(sci);
      if (!taxonId) {
        console.log(`  [${processed}/${speciesList.length}] ${sci}: no iNat taxon match`);
        continue;
      }
      const obs = await pullSpeciesObservations(sci, taxonId, MAX_PER_SPECIES);
      console.log(`  [${processed}/${speciesList.length}] ${sci}: pulled ${obs.length} CC0/CC-BY research-grade obs`);
      all.push(...obs);
    }
    // Dedupe by iNat observation id. The same obs can land twice when
    // two species in our catalog both resolve to the same iNat taxon —
    // either via the genus-only-placeholder fallback (e.g. our catalog's
    // "Carya sp." has no exact iNat match and falls through to hits[0]
    // which is also what "Carya ovata" resolves to), or because iNat
    // sometimes returns the same observation under both a parent and
    // child taxon. Without dedup, the bulk upsert fails with
    // "ON CONFLICT DO UPDATE command cannot affect row a second time"
    // and we lose entire 500-row batches.
    const seen = new Set<number>();
    const deduped: InatObservation[] = [];
    for (const obs of all) {
      if (seen.has(obs.id)) continue;
      seen.add(obs.id);
      deduped.push(obs);
    }
    const dupCount = all.length - deduped.length;
    if (dupCount > 0) {
      console.log(`  deduped ${dupCount} cross-species duplicate observations (${all.length} → ${deduped.length})`);
    }
    return deduped;
  },
  mapFeature(obs): ImportRecord | null {
    // We don't know which species this obs is for at this layer (the
    // fetchAll combined them), but taxon.name on the obs is iNat's
    // species ID — runImport's matchSpecies will resolve it. fallback
    // is empty since we never have one without obs.taxon.
    return mapObs(obs, obs.taxon?.name ?? '');
  }
};

runImport(config).catch((err) => {
  console.error('iNat observations import failed:', err);
  process.exit(1);
});
