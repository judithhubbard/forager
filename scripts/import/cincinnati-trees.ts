// Cincinnati Park Board Tree Inventory (March 2020). ~34k trees
// published on ArcGIS Online (owner=parks_cbelcher, Cincinnati Park
// Board). Includes iTree benefits, FAMILY/SPECIES/CULTIVAR/COMMON_NAME.
//
// Source page: https://www.cincinnatiparks.com/
// REST API:    services.arcgis.com/JyZag7oO4NteHGiq/.../Tree_Inventory_Benefits/FeatureServer/0
// License:     Cincinnati open data (permissive, attribution to Park Board)
// Refresh:     2026-05-10 verified count = 34,296
//
// Schema notes: SPECIES holds the *epithet only* (e.g. "Triacanthos"
// for Honeylocust), not the binomial. FAMILY is "Fabaceae". GENUS is
// just a numeric code ("17"). We rely on COMMON_NAME for matching;
// the matcher's common-name path resolves "Honeylocust", "Sycamore",
// etc., without needing the genus name resolved from GENUS_NUMBER.
//
// Run: npm run import:cincinnati-trees
// Pre-req: a 'Cincinnati public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'cincinnati-park-board-trees';
const LAYER_URL =
  'https://services.arcgis.com/JyZag7oO4NteHGiq/arcgis/rest/services/Tree_Inventory_Benefits/FeatureServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Cincinnati public';

interface CinFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    ID?: number;
    ORDERNUMBER?: string;
    FAMILY?: string;
    SPECIES?: string;     // epithet only ("Triacanthos")
    CULTIVAR?: string;
    COMMON_NAME?: string; // "Honeylocust"
    GLOBALID?: string;
    PARK_NAME?: string;
    STREET?: string;
  };
}

/** Cincinnati metro bbox (~30km around city center). City sits around
 *  39.10 N, -84.51 W. */
function inCincinnatiBbox(lng: number, lat: number): boolean {
  return lat >= 38.95 && lat <= 39.35 && lng >= -84.85 && lng <= -84.25;
}

const config: ImportConfig<CinFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Cincinnati Park Board Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'Cincinnati Park Board tree inventory (March 2020 snapshot, ' +
    '~34k trees) with iTree benefits. Source stores SPECIES as ' +
    'epithet only (no Latin binomial), so matching is via COMMON_NAME. ' +
    'Cincinnati open data (permissive, attribution).',
  regionName: REGION_NAME,
  license: 'Cincinnati open data',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      where: "COMMON_NAME IS NOT NULL AND COMMON_NAME <> ''"
    }) as Promise<CinFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inCincinnatiBbox(lng, lat)) return null;
    const common = f.properties?.COMMON_NAME?.trim();
    if (!common) return null;
    return {
      // OBJECTID is the only field guaranteed unique on this layer —
      // ID (Cincinnati's internal tree number) is heavily duplicated
      // and GLOBALID is unique but harder to grep in raw exports.
      externalId: String(
        f.properties?.OBJECTID ??
          f.properties?.GLOBALID ??
          `${lng.toFixed(6)},${lat.toFixed(6)}`
      ),
      // SPECIES is just the epithet ("Triacanthos") and GENUS is a
      // numeric code in this source; common-name matching is the
      // reliable path.
      commonName: common,
      lng,
      lat,
      raw: f as unknown as Record<string, unknown>
    };
  }
};

runImport(config).catch((err) => {
  console.error('Cincinnati trees import failed:', err);
  process.exit(1);
});
