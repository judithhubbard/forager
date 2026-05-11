// Town of Wellesley, MA — Public Shade Trees inventory.
// ~7.7k inventoried trees on town-managed land, published on the
// Wellesley Open Data portal (owner=mkthompson).
//
// Source page: https://www.arcgis.com/home/item.html?id=4b5c6eed495141fd85e56e06c5521327
// REST API:    services6.arcgis.com/f6G5SbcwuEVmR1CW/.../OpenDataLayers2/FeatureServer/0
// License:     Town of Wellesley public open data; no explicit CC
//              license string. Treated as public-with-attribution per
//              Town of Wellesley publication.
// Refresh:     2026-05-11 verified count = 7,735.
//
// Schema notes:
//   - ScientificName holds the canonical Latin binomial (mix of clean
//     binomials and "Genus sp." entries; the framework handles both).
//   - CommonName uses a comma-modifier format like "Oak, Black";
//     we reorder to "Black Oak" so the matcher lines up.
//   - Status='Existing' marks live trees; we keep only Existing.
//
// Run: npm run import:wellesley-trees
// Pre-req: a 'Wellesley public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'wellesley-public-shade-trees';
const LAYER_URL =
  'https://services6.arcgis.com/f6G5SbcwuEVmR1CW/arcgis/rest/services/OpenDataLayers2/FeatureServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Wellesley public';

interface WelFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    ZoneID?: string;
    Class?: string;
    Facility?: string;
    Street?: string;
    ClosestAddress?: string;
    Setting?: string;
    Status?: string;
    CommonName?: string;
    ScientificName?: string;
    DBH?: number;
    Trunks?: number;
    Condition?: string;
  };
}

/** Reorder "Oak, Black" → "Black Oak" so common-name matching works
 *  against the catalog. Preserve original spelling. */
function reorderCommon(name: string): string {
  const idx = name.indexOf(',');
  if (idx < 0) return name.trim();
  const head = name.slice(0, idx).trim();
  const tail = name.slice(idx + 1).trim();
  if (!tail) return head;
  return `${tail} ${head}`;
}

/** Wellesley, MA bbox. Roughly 42.28–42.32 N / -71.32 – -71.27 W. */
function inWellesleyBbox(lng: number, lat: number): boolean {
  return lat >= 42.26 && lat <= 42.34 && lng >= -71.35 && lng <= -71.24;
}

const config: ImportConfig<WelFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Town of Wellesley, MA Public Shade Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'Town of Wellesley, MA Public Shade Trees inventory (~7.7k trees) ' +
    'maintained by the Wellesley Tree Warden. Source publishes ' +
    'ScientificName (Latin binomial), CommonName (comma-modifier format ' +
    'we reorder to "Black Oak" style), Status, DBH, Trunks, Condition. ' +
    'We filter to Status=\'Existing\' to drop removed/planned entries. ' +
    'AGOL item carries no explicit CC license — treated as public-with-' +
    'attribution per Town of Wellesley publication.',
  regionName: REGION_NAME,
  license: 'Public (Town of Wellesley, MA; no explicit CC license)',
  async fetchAll() {
    const where = "Status = 'Existing'";
    return fetchArcGisLayer({ url: ENDPOINT, where }) as Promise<WelFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inWellesleyBbox(lng, lat)) return null;

    const latin = (f.properties?.ScientificName ?? '').trim();
    const commonRaw = (f.properties?.CommonName ?? '').trim();
    const common = commonRaw ? reorderCommon(commonRaw) : undefined;
    if (!latin && !common) return null;

    return {
      externalId: String(
        f.properties?.OBJECTID ??
          f.properties?.ZoneID ??
          `${lng.toFixed(6)},${lat.toFixed(6)}`
      ),
      scientificName: latin || undefined,
      commonName: common,
      lng,
      lat,
      raw: f as unknown as Record<string, unknown>
    };
  }
};

runImport(config).catch((err) => {
  console.error('Wellesley trees import failed:', err);
  process.exit(1);
});
