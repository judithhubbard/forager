// City of Allen, TX — Tree Inventory.
// ~10.8k inventoried trees on city-managed parks/parkways, published
// on the City of Allen's own ArcGIS Server (gismaps.cityofallen.org).
//
// Source page: https://www.arcgis.com/home/item.html?id=60f6c569c0b6410e92664caf1c06ec2d
// REST API:    gismaps.cityofallen.org/arcgis/rest/services/Trees/MapServer/0
// License:     City of Allen, TX public open data; no explicit CC
//              license string. Treated as public-with-attribution.
// Refresh:     2026-05-11 verified count = 10,779.
//
// Schema notes:
//   - CommonScientificName is a single field in format
//     "Common (Latin)", e.g. "Locust, Black (Robinia pseudoacacia)".
//   - We split on the first " (" / ")" pair into common + Latin and
//     reorder the common-name comma-modifier.
//   - LifeCycleStatus = 'Active' for live trees; we filter accordingly.
//
// Run: npm run import:allen-tx-trees
// Pre-req: an 'Allen TX public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'allen-tx-trees';
const LAYER_URL =
  'https://gismaps.cityofallen.org/arcgis/rest/services/Trees/MapServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Allen TX public';

interface AllenFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    CWID?: string;
    LocationType?: string;
    ParkName?: string;
    CommonScientificName?: string;
    Condition?: string;
    TreeHeight?: number;
    LifeCycleStatus?: string;
    OwnedBy?: string;
    MaintainedBy?: string;
  };
}

/** Allen, TX bbox. City sits roughly 33.07–33.15 N / -96.72 – -96.61 W. */
function inAllenBbox(lng: number, lat: number): boolean {
  return lat >= 33.00 && lat <= 33.20 && lng >= -96.78 && lng <= -96.55;
}

/** Parse "Common Name (Latin name)" into [common, latin]. Handles the
 *  comma-modifier reordering: "Locust, Black (Robinia pseudoacacia)"
 *  → common="Black Locust", latin="Robinia pseudoacacia". */
function parseCommonScientific(s: string): { common?: string; latin?: string } {
  if (!s) return {};
  const m = /^(.+?)\s*\(([^)]+)\)\s*$/.exec(s);
  if (!m) {
    return { common: s.trim() };
  }
  const rawCommon = m[1].trim();
  const latin = m[2].trim();
  // Comma-modifier reorder: "Locust, Black" → "Black Locust".
  const idx = rawCommon.indexOf(',');
  const common = idx < 0
    ? rawCommon
    : `${rawCommon.slice(idx + 1).trim()} ${rawCommon.slice(0, idx).trim()}`.trim();
  return { common, latin };
}

const config: ImportConfig<AllenFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'City of Allen, TX Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of Allen, TX tree inventory (~10.8k trees) on city-managed ' +
    'parks/parkways. Source publishes CommonScientificName as a single ' +
    'field in "Common (Latin)" format (e.g. "Locust, Black (Robinia ' +
    'pseudoacacia)"); we split into common+Latin and reorder the ' +
    'comma-modifier. LifeCycleStatus, Condition, ParkName, TreeHeight, ' +
    'OwnedBy/MaintainedBy are carried into raw. We filter to ' +
    'LifeCycleStatus=\'Active\'. AGOL item has no explicit CC license ' +
    '— treated as public-with-attribution per City of Allen publication.',
  regionName: REGION_NAME,
  license: 'Public (City of Allen, TX; no explicit CC license)',
  async fetchAll() {
    const where = "LifeCycleStatus = 'Active'";
    return fetchArcGisLayer({ url: ENDPOINT, where }) as Promise<AllenFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inAllenBbox(lng, lat)) return null;

    const raw = (f.properties?.CommonScientificName ?? '').trim();
    const { common, latin } = parseCommonScientific(raw);
    if (!latin && !common) return null;

    return {
      externalId: String(
        f.properties?.OBJECTID ??
          f.properties?.CWID ??
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
  console.error('Allen TX trees import failed:', err);
  process.exit(1);
});
