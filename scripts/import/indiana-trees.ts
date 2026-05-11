// Indiana DNR Bloomington & Indianapolis Tree Inventories — STATE-LEVEL
// aggregator owned by ugimaps_IU (Indiana University Environmental
// Resilience Institute) on ArcGIS Online. ~387k trees across 20 IN
// municipalities including Bloomington and Indianapolis. Single ingest
// covers the whole state's currently-published urban-forest inventory.
//
// Source page: https://eri.iu.edu/  (IU Environmental Resilience Institute)
// REST API:    services.arcgis.com/.../Bloomington_and_Indianapolis_Tree_Inventories/FeatureServer/0
// License:     Indiana public data (permissive, attribution to IU ERI / IN DNR)
// Refresh:     2026-05-10 verified count = 387,655
//
// Schema notes: the layer exposes both SPECIES (full Latin binomial,
// e.g. "Juglans nigra") and COMMONNAME ("Black walnut"). When SPECIES
// is genus-only ("Picea spp.") the matcher's genus-only fallback handles
// it (subject to NO_FALLBACK_GENERA). LATITUDE/LONGITUDE attribute
// fields agree with geometry coordinates — we prefer geometry.
//
// Run: npm run import:indiana-trees
// Pre-req: an 'Indiana public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'indiana-dnr-tree-inventory';
const LAYER_URL =
  'https://services.arcgis.com/tKsJAIiLjd90D5q2/arcgis/rest/services/Bloomington_and_Indianapolis_Tree_Inventories/FeatureServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Indiana public';

interface InFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    ObjectId?: number;
    SPECIES?: string;
    GENUS?: string;
    FAMILY?: string;
    COMMONNAME?: string;
    LOCATION?: string;
    INVYEAR?: number;
    LATITUDE?: number;
    LONGITUDE?: number;
  };
}

/** Indiana state rough bbox. Filters (0,0) and any wild outliers
 *  without losing legitimate IN points (state spans ~37.7-41.8 N,
 *  ~88.1-84.8 W). */
function inIndianaBbox(lng: number, lat: number): boolean {
  return lat >= 37.5 && lat <= 41.9 && lng >= -88.3 && lng <= -84.6;
}

const config: ImportConfig<InFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Indiana DNR Bloomington & Indianapolis Tree Inventories',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'Indiana DNR / IU Environmental Resilience Institute tree ' +
    'inventory aggregator — ~387k trees across 20 IN municipalities ' +
    'including Bloomington and Indianapolis. Indiana public data ' +
    '(permissive, attribution to IU ERI / IN DNR).',
  regionName: REGION_NAME,
  license: 'Indiana public data (IU ERI / IN DNR)',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      where: "SPECIES IS NOT NULL AND SPECIES <> ''"
    }) as Promise<InFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0] ?? f.properties?.LONGITUDE);
    const lat = Number(c?.[1] ?? f.properties?.LATITUDE);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inIndianaBbox(lng, lat)) return null;
    const latin = f.properties?.SPECIES?.trim();
    if (!latin) return null;
    const common = f.properties?.COMMONNAME?.trim() || undefined;
    return {
      externalId: String(
        f.properties?.ObjectId ?? `${lng.toFixed(6)},${lat.toFixed(6)}`
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
  console.error('Indiana trees import failed:', err);
  process.exit(1);
});
