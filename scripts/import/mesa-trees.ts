// City of Mesa, AZ — iTree Inventory (Mesa_AZ_iTree_Inventory_WFL1).
// ~33k trees published on ArcGIS Online (owner=1gVyYKfYgW5Nxb1V).
//
// Source page: https://www.mesaaz.gov/
// REST API:    services2.arcgis.com/.../Mesa_AZ_iTree_Inventory_WFL1/FeatureServer/0
// License:     City of Mesa open data (permissive, attribution)
// Refresh:     2026-05-10 verified count = 33,311
//
// Schema notes: BOTANICAL_NAME and Species_Name both hold the Latin
// binomial (e.g. "Sophora secundiflora") — they agree on sampled rows.
// COMMON_NAME holds the natural common name ("Texas Mountain Laurel").
// Longitude/Latitude attribute fields agree with geometry — prefer
// geometry.
//
// Run: npm run import:mesa-trees
// Pre-req: a 'Mesa public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'mesa-itree-inventory';
const LAYER_URL =
  'https://services2.arcgis.com/1gVyYKfYgW5Nxb1V/arcgis/rest/services/Mesa_AZ_iTree_Inventory_WFL1/FeatureServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Mesa public';

interface MesaFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    Tree_ID?: number;
    FACILITYID?: string;
    Species_Name?: string;
    BOTANICAL_NAME?: string;
    COMMON_NAME?: string;
    DBH__in_?: number;
    TREE_DBH?: number;
    Longitude?: number;
    Latitude?: number;
  };
}

/** Mesa metro bbox (~30km around city center). Mesa sits around
 *  33.42 N, -111.83 W; covers the city limits. */
function inMesaBbox(lng: number, lat: number): boolean {
  return lat >= 33.20 && lat <= 33.65 && lng >= -112.10 && lng <= -111.45;
}

const config: ImportConfig<MesaFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Mesa AZ iTree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of Mesa, AZ iTree inventory (~33k trees) with full Latin ' +
    'binomial (BOTANICAL_NAME / Species_Name) and common name. ' +
    'City of Mesa open data (permissive, attribution).',
  regionName: REGION_NAME,
  license: 'City of Mesa open data',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      where: "BOTANICAL_NAME IS NOT NULL AND BOTANICAL_NAME <> ''"
    }) as Promise<MesaFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0] ?? f.properties?.Longitude);
    const lat = Number(c?.[1] ?? f.properties?.Latitude);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inMesaBbox(lng, lat)) return null;
    const latin =
      f.properties?.BOTANICAL_NAME?.trim() ||
      f.properties?.Species_Name?.trim();
    if (!latin) return null;
    const common = f.properties?.COMMON_NAME?.trim() || undefined;
    return {
      externalId: String(
        f.properties?.Tree_ID ??
          f.properties?.FACILITYID ??
          f.properties?.OBJECTID ??
          `${lng.toFixed(6)},${lat.toFixed(6)}`
      ),
      scientificName: latin,
      commonName: common,
      lng,
      lat,
      raw: f as unknown as Record<string, unknown>
    };
  }
};

runImport(config).catch((err) => {
  console.error('Mesa trees import failed:', err);
  process.exit(1);
});
