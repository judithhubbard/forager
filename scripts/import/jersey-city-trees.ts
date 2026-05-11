// City of Jersey City, NJ — Tree Inventory Dashboard 2023. ~18k trees
// published on ArcGIS Online (owner=EGuseman_JC, City of Jersey City).
//
// Source page: https://data.jerseycitynj.gov/
// REST API:    services2.arcgis.com/UXbywc7dSkfgdPp4/.../City_of_Jersey_City_Tree_Inventory_Dashboard_2023_WFL1/FeatureServer/0
// License:     City of Jersey City open data (permissive, attribution)
// Refresh:     2026-05-10 verified count = 18,011
//
// Schema notes: there is no separate Latin binomial column — the
// `species` field encodes it as "Common, Modifier (Latin binomial)",
// e.g. "Dogwood, Kousa (Cornus kousa)". We split into (common, latin)
// at the parenthesis and skip Stump / empty-pit placeholders ("Stump
// (Stump)") which don't represent live trees.
//
// Run: npm run import:jersey-city-trees
// Pre-req: a 'Jersey City public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'jersey-city-tree-inventory';
const LAYER_URL =
  'https://services2.arcgis.com/UXbywc7dSkfgdPp4/arcgis/rest/services/City_of_Jersey_City_Tree_Inventory_Dashboard_2023_WFL1/FeatureServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Jersey City public';

interface JcFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    FID?: number;
    site_id?: number;
    species?: string;     // "Dogwood, Kousa (Cornus kousa)"
    dbh?: number;
    condition?: string;
    ward?: string;
    longitude?: number;
    latitude?: number;
  };
}

/** Jersey City bbox (~30km around city). JC sits around 40.72 N,
 *  -74.04 W; bbox covers the city plus a buffer into Hudson County. */
function inJerseyCityBbox(lng: number, lat: number): boolean {
  return lat >= 40.60 && lat <= 40.85 && lng >= -74.20 && lng <= -73.90;
}

const SPECIES_RX = /^(.*?)\s*\(([^)]+)\)\s*$/;

/** Parse "Dogwood, Kousa (Cornus kousa)" into { common, latin }.
 *  Returns null for "Stump (Stump)", "Empty Tree Pit (...)" and
 *  anything else without a real Latin binomial. */
function parseJcSpecies(raw: string): { common: string; latin: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const m = SPECIES_RX.exec(trimmed);
  if (!m) return null;
  const commonPart = m[1].trim();
  const latin = m[2].trim();
  if (!latin) return null;
  // Filter non-tree placeholders.
  if (/^stump$/i.test(latin)) return null;
  if (/^empty/i.test(latin)) return null;
  if (/^vacant/i.test(latin)) return null;
  if (/^unknown$/i.test(latin)) return null;
  // Drop the "Modifier" half of "Common, Modifier" — matchSpecies's
  // common-name path expects natural-order names like "Dogwood",
  // "Maple", which it can fall through into genus matching on.
  const common = commonPart.split(',')[0].trim();
  return { common, latin };
}

const config: ImportConfig<JcFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Jersey City Tree Inventory Dashboard 2023',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of Jersey City Tree Inventory Dashboard 2023 (~18k trees). ' +
    'Source encodes species as "Common, Modifier (Latin binomial)"; ' +
    'we split into Latin + common at import time. City of Jersey ' +
    'City open data (permissive, attribution).',
  regionName: REGION_NAME,
  license: 'City of Jersey City open data',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      where: "species IS NOT NULL AND species <> ''"
    }) as Promise<JcFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0] ?? f.properties?.longitude);
    const lat = Number(c?.[1] ?? f.properties?.latitude);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inJerseyCityBbox(lng, lat)) return null;
    const raw = f.properties?.species ?? '';
    const parsed = parseJcSpecies(raw);
    if (!parsed) return null;
    return {
      externalId: String(
        f.properties?.site_id ??
          f.properties?.FID ??
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
  console.error('Jersey City trees import failed:', err);
  process.exit(1);
});
