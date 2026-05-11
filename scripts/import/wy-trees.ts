// Wyoming State Forestry Division (WSFD) — STATE-LEVEL aggregator.
// Four AGOL feature services (owner=jacob.mares_WSFD /
// william.ozment_WSFD) pooled into one logical "Wyoming public"
// source. ~14,279 trees combined (statewide + Laramie three-layer
// set). Public access on all four layers.
//
//   - CommunityTreeInventoryDataCollection  ~1,324  (statewide aggregator)
//   - Laramie_StreetTrees                   ~8,693  (Laramie street trees)
//   - Laramie_ParkTrees                     ~1,785  (Laramie park trees)
//   - Laramie_OtherTrees                    ~2,477  (Laramie other trees)
//
// We register a single import_source ("wy-wsfd-trees") and import all
// four into 'Wyoming public', namespacing the external IDs per layer
// so the idempotent upsert key stays disjoint.
//
// Schema notes:
//   - CommunityTreeInventoryDataCollection encodes species in a coded
//     field "CommonName_SciName_SpCode" whose ArcGIS domain maps each
//     code to a string like "Maple_Bigtooth_Acer_grandidentatum". We
//     parse the latin binomial from the last two underscore-separated
//     tokens.
//   - The three Laramie layers use a plain "Species" string field,
//     usually a common-name fragment like "Spruce" or "Apple, Crab".
//     No latin binomial — rely on common-name match.
//
// Source page: https://wsfd.wyo.gov/ (Wyoming State Forestry Division)
// License:     Wyoming open data (permissive; attribution to WSFD)
// Refresh:     2026-05-10 verified counts above.
//
// This file follows the stiles-la-county-trees.ts multi-layer pattern:
// one runner function that loops over per-layer definitions, registers
// a single source, and pushes everything through the framework helpers
// directly (not via runImport, which is single-layer).
//
// Run: npm run import:wy-trees
// Pre-req: a 'Wyoming public' region row.

import { fetchArcGisLayer, normalizeSpeciesName } from './lib/framework';
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

const SOURCE_ID = 'wy-wsfd-trees';
const SOURCE_NAME = 'Wyoming State Forestry Division Trees';
const REGION_NAME = 'Wyoming public';
const SOURCE_LICENSE = 'Wyoming open data';
const SOURCE_DESCRIPTION =
  'Wyoming State Forestry Division (WSFD) tree inventories — four ' +
  'AGOL feature layers pooled: CommunityTreeInventoryDataCollection ' +
  '(statewide), Laramie_StreetTrees, Laramie_ParkTrees, and ' +
  'Laramie_OtherTrees. ~14,279 trees combined. Wyoming open data.';

type Feature = {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: Record<string, unknown> | null;
};

/** Wyoming rough bbox. */
function inWyomingBbox(lng: number, lat: number): boolean {
  return lat >= 40.9 && lat <= 45.1 && lng >= -111.1 && lng <= -104.0;
}

interface LayerDef {
  tag: string;             // namespace for external IDs
  url: string;             // /query URL
  label: string;           // human-readable
  estRows: number;
  /** Returns the matched-species record, or null to skip. The base
   *  bbox + null-geometry checks are run by the caller. */
  mapFeature(f: Feature): ImportRecord | null;
}

/** Parse "Maple_Bigtooth_Acer_grandidentatum" or
 *  "Boxelder_Acer_negundo" into a latin binomial. The convention in
 *  the WSFD domain is the *last two* underscore-separated tokens are
 *  Genus + species. Hybrid markers ("Acer_x_freemanii") become
 *  three-token tails; detect and rejoin. Returns undefined if no
 *  recognisable binomial. */
function parseWyDomainLatin(name: string): { latin?: string; common?: string } {
  const parts = name.split('_').filter(Boolean);
  if (parts.length < 2) return { common: name };
  // Detect hybrid pattern "Genus x species" (the 'x' token between
  // genus and species).
  const tailIdx = parts.length - 1;
  if (tailIdx >= 2 && parts[tailIdx - 1] === 'x') {
    const latin = `${parts[tailIdx - 2]} x ${parts[tailIdx]}`;
    const common = parts.slice(0, tailIdx - 2).join(' ').trim() || undefined;
    return { latin, common };
  }
  // Standard "Genus species" — last two tokens.
  const last = parts[tailIdx];
  const prev = parts[tailIdx - 1];
  // If the last token is "species" (generic), drop it — we only have
  // a genus reference.
  if (last.toLowerCase() === 'species') {
    return {
      latin: `${prev} species`,
      common: parts.slice(0, tailIdx - 1).join(' ').trim() || undefined
    };
  }
  // Capitalised previous token = Genus; lowercase last token = species.
  if (/^[A-Z][a-z]+$/.test(prev) && /^[a-z]+/.test(last)) {
    return {
      latin: `${prev} ${last}`,
      common: parts.slice(0, tailIdx - 1).join(' ').trim() || undefined
    };
  }
  // Otherwise treat as common name (e.g. "Broadleaf_Deciduous_Large").
  return { common: parts.join(' ') };
}

/** Memoised: SPCODE → "Group_Common_Latin" mapping for the WSFD
 *  CommunityTreeInventoryDataCollection layer. Fetched once at
 *  startup. */
let coreSpDomain: Map<string, string> | null = null;
async function loadCoreSpDomain(layerUrl: string): Promise<Map<string, string>> {
  if (coreSpDomain) return coreSpDomain;
  const descUrl = layerUrl.replace(/\/query$/, '?f=json');
  const res = await fetch(descUrl);
  if (!res.ok) throw new Error(`WSFD core layer-description fetch ${res.status}`);
  const body = (await res.json()) as {
    fields?: Array<{
      name?: string;
      domain?: { codedValues?: Array<{ code?: string; name?: string }> };
    }>;
  };
  const f = body.fields?.find((x) => x.name === 'CommonName_SciName_SpCode');
  const cvs = f?.domain?.codedValues ?? [];
  const m = new Map<string, string>();
  for (const cv of cvs) if (cv.code && cv.name) m.set(cv.code, cv.name);
  if (m.size === 0) throw new Error('WSFD core species domain empty — schema changed?');
  coreSpDomain = m;
  return m;
}

const LAYERS: LayerDef[] = [
  {
    tag: 'core',
    url: 'https://services1.arcgis.com/i5xRZLABP6oUOcld/arcgis/rest/services/CommunityTreeInventoryDataCollection/FeatureServer/0/query',
    label: 'CommunityTreeInventoryDataCollection',
    estRows: 1_324,
    mapFeature(f) {
      const c = f.geometry?.coordinates;
      const lng = Number(c?.[0]);
      const lat = Number(c?.[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
      if (lng === 0 || lat === 0) return null;
      if (!inWyomingBbox(lng, lat)) return null;
      const p = f.properties ?? {};
      const code = String(p.CommonName_SciName_SpCode ?? '').trim();
      if (!code) return null;
      const domainName = coreSpDomain?.get(code);
      if (!domainName) return null;
      // Drop the non-species placeholder buckets (Broadleaf_Deciduous_*,
      // Conifer_Evergreen_*) — no useful match in our catalog.
      if (/^(Broadleaf|Conifer)_/.test(domainName)) return null;
      const { latin, common } = parseWyDomainLatin(domainName);
      if (!latin && !common) return null;
      const eid = String(p.GlobalID ?? p.OBJECTID ?? `${lng.toFixed(6)},${lat.toFixed(6)}`);
      return {
        externalId: `core:${eid}`,
        scientificName: latin,
        commonName: common,
        lng,
        lat,
        raw: f
      };
    }
  },
  {
    tag: 'lar-street',
    url: 'https://services1.arcgis.com/i5xRZLABP6oUOcld/arcgis/rest/services/Laramie_StreetTrees/FeatureServer/0/query',
    label: 'Laramie_StreetTrees',
    estRows: 8_693,
    mapFeature: laramieMapper('lar-street')
  },
  {
    tag: 'lar-park',
    url: 'https://services1.arcgis.com/i5xRZLABP6oUOcld/arcgis/rest/services/Laramie_ParkTrees/FeatureServer/0/query',
    label: 'Laramie_ParkTrees',
    estRows: 1_785,
    mapFeature: laramieMapper('lar-park')
  },
  {
    tag: 'lar-other',
    url: 'https://services1.arcgis.com/i5xRZLABP6oUOcld/arcgis/rest/services/Laramie_OtherTrees/FeatureServer/0/query',
    label: 'Laramie_OtherTrees',
    estRows: 2_477,
    mapFeature: laramieMapper('lar-other')
  }
];

/** Mapper shared by all three Laramie layers. They have identical
 *  schemas: Species (common-name string), DBH, Placement, Condition,
 *  Hazard, etc. Geometry is WGS84 lat/lng. */
function laramieMapper(tag: string): (f: Feature) => ImportRecord | null {
  return (f) => {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inWyomingBbox(lng, lat)) return null;
    const p = f.properties ?? {};
    const speciesRaw = String(p.Species ?? '').trim();
    if (!speciesRaw) return null;
    // Skip non-species placeholders. "Space" appears in the street
    // layer's data for empty planting sites; "Stump" / "Vacant" etc.
    if (/^(space|stump|vacant|no\s+tree|none|unknown|other)$/i.test(speciesRaw)) {
      return null;
    }
    // Laramie's "Apple, Crab" pattern reads as common name with a
    // qualifier; collapse to a matcher-friendly form.
    const common = speciesRaw.replace(/,\s*/g, ' ').trim();
    const eid = String(p.OBJECTID ?? p.OBJECTID_1 ?? `${lng.toFixed(6)},${lat.toFixed(6)}`);
    return {
      externalId: `${tag}:${eid}`,
      commonName: common,
      lng,
      lat,
      raw: f
    };
  };
}

async function main(): Promise<void> {
  const dbUrl = process.env.SUPABASE_DB_URL;
  const userId = process.env.FORAGER_DEV_USER_ID;
  if (!dbUrl) throw new Error('SUPABASE_DB_URL missing.');
  if (!userId) throw new Error('FORAGER_DEV_USER_ID missing.');

  // Pre-load the WSFD core SPCODE domain so the core layer's mapper
  // can resolve synchronously.
  const coreLayer = LAYERS.find((l) => l.tag === 'core');
  if (coreLayer) await loadCoreSpDomain(coreLayer.url);

  // Fetch every layer up-front, tagging features with their source
  // layer for namespace-safe external IDs in the mapper.
  const allFeatures: Array<{ feature: Feature; layer: LayerDef }> = [];
  for (const layer of LAYERS) {
    console.log(`Fetching WY layer "${layer.label}" (est ${layer.estRows.toLocaleString()})`);
    const feats = (await fetchArcGisLayer({
      url: layer.url,
      where: '1=1'
    })) as Feature[];
    for (const f of feats) allFeatures.push({ feature: f, layer });
  }
  console.log(`Total WY features across ${LAYERS.length} layers: ${allFeatures.length}`);

  const sql = postgres(dbUrl, { ssl: 'require', onnotice: () => undefined });
  try {
    const { regionId } = await registerImportSource(sql, {
      sourceId: SOURCE_ID,
      name: SOURCE_NAME,
      url: 'https://services1.arcgis.com/i5xRZLABP6oUOcld/arcgis/rest/services',
      description: SOURCE_DESCRIPTION,
      regionName: REGION_NAME,
      license: SOURCE_LICENSE
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
    for (const { feature, layer } of allFeatures) {
      const rec = layer.mapFeature(feature);
      if (!rec) continue;
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
    console.log(`Matched ${matched.length} / ${allFeatures.length} features against species catalog`);

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
    await sql`select pg_advisory_unlock(hashtext(${`${regionId}:${SOURCE_ID}`}))`;

    if (summary.pinsCreated > 0 || summary.pinsUpdated > 0) {
      try {
        await sql`select public.refresh_pin_density()`;
      } catch (err) {
        console.warn('  refresh_pin_density failed (non-fatal):',
          err instanceof Error ? err.message : err);
      }
    }

    console.log('\nWY import complete:');
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
  console.error('Wyoming trees import failed:', err);
  process.exit(1);
});
