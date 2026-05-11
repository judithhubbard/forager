// Leon County, FL — Canopy Roads Tree Inventory.
// ~5.7k trees lining Leon County's protected Canopy Roads (a network
// of historic oak-canopied scenic roadways in and around Tallahassee).
// Maintained by Leon County GIS / Public Works Operations and
// published as a public hosted feature service.
//
// Source page: https://www.arcgis.com/home/item.html?id=c03d6a2b995345e18b9a4a3a86fee4a0
// REST API:    services.arcgis.com/ptvDyBs1KkcwzQNJ/.../Canopy_Road_Tree_Inventory_Public/FeatureServer/0
// License:     Leon County public open data; no explicit CC license
//              string. Treat as public-with-attribution per Leon
//              County GIS publication.
// Refresh:     2026-05-11 verified count = 5,743.
//
// Schema notes:
//   - BOTANICAL holds the Latin binomial ("Quercus virginiana",
//     "Pinus palustris").
//   - COMMON holds the common name.
//   - INVEN_STS marks inventory status (we keep all rows; no
//     destructive filter applied).
//   - AREA marks the canopy road segment (carried into raw).
//
// Run: npm run import:leon-county-canopy-roads-trees
// Pre-req: a 'Leon County public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'leon-county-canopy-roads-trees';
const LAYER_URL =
  'https://services.arcgis.com/ptvDyBs1KkcwzQNJ/arcgis/rest/services/Canopy_Road_Tree_Inventory_Public/FeatureServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Leon County public';

interface LeonFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    COMMON?: string;
    BOTANICAL?: string;
    DBH?: number;
    HEIGHT_RNG?: string;
    STEMS?: string;
    COND?: string;
    CLEARANCE?: string;
    RISK?: string;
    AREA?: string;
    OWNER?: string;
    INVEN_STS?: string;
    UNIQUEID?: string;
  };
}

/** Leon County, FL bbox. County spans roughly 30.30–30.70 N and
 *  -84.55 – -84.05 W (Tallahassee + canopy roads in north/east).
 *  Pad slightly. */
function inLeonCountyBbox(lng: number, lat: number): boolean {
  return lat >= 30.25 && lat <= 30.75 && lng >= -84.60 && lng <= -84.00;
}

const config: ImportConfig<LeonFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Leon County, FL Canopy Roads Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'Leon County, FL Canopy Roads tree inventory (~5.7k trees) along ' +
    'the network of protected historic oak-canopied scenic roadways ' +
    'in and around Tallahassee. Maintained by Leon County GIS / ' +
    'Public Works Operations. Source publishes BOTANICAL (Latin ' +
    'binomial), COMMON (common name), DBH, HEIGHT_RNG, STEMS, COND, ' +
    'CLEARANCE, RISK, AREA (road segment), and OWNER fields. AGOL ' +
    'item carries no explicit CC license — treated as public-with-' +
    'attribution per Leon County publication.',
  regionName: REGION_NAME,
  license: 'Public (Leon County, FL; no explicit CC license)',
  async fetchAll() {
    return fetchArcGisLayer({ url: ENDPOINT }) as Promise<LeonFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inLeonCountyBbox(lng, lat)) return null;

    const latin = (f.properties?.BOTANICAL ?? '').trim();
    const common = (f.properties?.COMMON ?? '').trim();
    if (!latin && !common) return null;

    return {
      externalId: String(
        f.properties?.OBJECTID ??
          f.properties?.UNIQUEID ??
          `${lng.toFixed(6)},${lat.toFixed(6)}`
      ),
      scientificName: latin || undefined,
      commonName: common || undefined,
      lng,
      lat,
      raw: f as unknown as Record<string, unknown>
    };
  }
};

runImport(config).catch((err) => {
  console.error('Leon County canopy roads trees import failed:', err);
  process.exit(1);
});
