// Saint Paul, MN — Bikeway Feasibility Study Tree Inventory. ~3.8k
// trees published on ArcGIS Online (owner=dtinklenberg, consultant
// for the City). PARTIAL coverage: only trees along the bikeway-study
// corridors, NOT a citywide inventory. Phase-3 outreach is targeting
// Saint Paul Parks & Rec for the full citywide feed.
//
// Source page: https://www.stpaul.gov/departments/public-works
// REST API:    services.arcgis.com/sLe4VrKqV1JxToKz/.../Saint_Paul_Bikeway_Feasibility_Study_Tree_Inventory/FeatureServer/0
// License:     Saint Paul / consultant open data (permissive)
// Refresh:     2026-05-10 verified count = 3,788
//
// Schema notes: Species field combines common+latin in one string
// e.g. "Elm, Hybrid - Patriot (Ulmus 'Patriot')",
// "Linden, Littleleaf (Tilia cordata)". We parse the latin from the
// parenthesis; falls back to skipping rows we can't parse. DBH is
// inches, Year_Planted is "N/A" for many older trees.
//
// Run: npm run import:saint-paul-trees
// Pre-req: a 'Saint Paul public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'saint-paul-bikeway-trees';
const LAYER_URL =
  'https://services.arcgis.com/sLe4VrKqV1JxToKz/arcgis/rest/services/Saint_Paul_Bikeway_Feasibility_Study_Tree_Inventory/FeatureServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Saint Paul public';

interface SpFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    GlobalID?: string;
    Site?: number;
    Species?: string;     // "Linden, Littleleaf (Tilia cordata)"
    DBH?: number;
    Park_Name?: string;
    Latitude?: number;
    Longitude?: number;
  };
}

/** Saint Paul metro bbox (~30km around city center). St Paul sits
 *  around 44.95 N, -93.09 W. */
function inSaintPaulBbox(lng: number, lat: number): boolean {
  return lat >= 44.80 && lat <= 45.15 && lng >= -93.30 && lng <= -92.85;
}

const SPECIES_RX = /^(.*?)\s*\(([^)]+)\)\s*$/;

/** Parse "Linden, Littleleaf (Tilia cordata)" into {common, latin}.
 *  Skips entries without a real Latin binomial (Stump, etc.) and
 *  cleans up the cultivar-only form "Ulmus 'Patriot'" by letting
 *  normalizeSpeciesName() strip the quoted cultivar downstream. */
function parseSpSpecies(raw: string): { common: string; latin: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const m = SPECIES_RX.exec(trimmed);
  if (!m) return null;
  const commonPart = m[1].trim();
  const latin = m[2].trim();
  if (!latin) return null;
  if (/^stump$/i.test(latin)) return null;
  if (/^empty/i.test(latin)) return null;
  if (/^vacant/i.test(latin)) return null;
  if (/^unknown$/i.test(latin)) return null;
  const common = commonPart.split(',')[0].trim();
  return { common, latin };
}

const config: ImportConfig<SpFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Saint Paul Bikeway Feasibility Study Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'Saint Paul, MN Bikeway Feasibility Study tree inventory (~3.8k ' +
    'trees) — PARTIAL coverage along bikeway corridors only, NOT ' +
    'citywide. Source encodes species as "Common, Modifier (Latin)" ' +
    'in one string; we split at import time. Saint Paul / consultant ' +
    'open data (permissive).',
  regionName: REGION_NAME,
  license: 'Saint Paul / consultant open data',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      where: "Species IS NOT NULL AND Species <> ''"
    }) as Promise<SpFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0] ?? f.properties?.Longitude);
    const lat = Number(c?.[1] ?? f.properties?.Latitude);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inSaintPaulBbox(lng, lat)) return null;
    const raw = f.properties?.Species ?? '';
    const parsed = parseSpSpecies(raw);
    if (!parsed) return null;
    return {
      externalId: String(
        f.properties?.OBJECTID ??
          f.properties?.GlobalID ??
          `${lng.toFixed(6)},${lat.toFixed(6)}`
      ),
      scientificName: parsed.latin,
      commonName: parsed.common || undefined,
      lng,
      lat,
      raw: f as unknown as Record<string, unknown>
    };
  }
};

runImport(config).catch((err) => {
  console.error('Saint Paul trees import failed:', err);
  process.exit(1);
});
