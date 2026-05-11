// Weaverville, NC — Town Tree Inventory.
// ~960 trees on town-managed land in Weaverville (Buncombe County,
// just north of Asheville). Maintained by the town and published as
// a public hosted feature service on a town staff member's AGOL
// account (owner=jeller@weavervillenc.org).
//
// Source page: https://www.arcgis.com/home/item.html?id=c7b2caa071c04948ab4c20a00e8919f2
// REST API:    services5.arcgis.com/lA7fMEY4qaPiZF6g/.../Weaverville_Tree_Inventory/FeatureServer/0
// License:     Town of Weaverville public open data; no explicit CC
//              license string. Treat as public-with-attribution per
//              Town of Weaverville publication.
// Refresh:     2026-05-11 verified count = 960.
//
// Schema notes:
//   - Botanical holds the Latin binomial ("Acer saccharinum").
//   - Common holds the common name ("Silver Maple").
//   - LatDD / LonDD also stored separately — we use the geometry.
//
// Run: npm run import:weaverville-trees
// Pre-req: a 'Weaverville public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'weaverville-town-trees';
const LAYER_URL =
  'https://services5.arcgis.com/lA7fMEY4qaPiZF6g/arcgis/rest/services/Weaverville_Tree_Inventory/FeatureServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Weaverville public';

interface WvFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    FID?: number;
    FID__?: number;
    Botanical?: string;
    Common?: string;
    Stems?: number;
    DBH?: number;
    Condition?: string;
    Heritage_T?: string;
    LatDD?: number;
    LonDD?: number;
    GlobalID_2?: string;
  };
}

/** Weaverville, NC bbox. Town sits at 35.6960 N, -82.5604 W just
 *  north of Asheville. Pad slightly to catch trees just outside town
 *  boundaries. */
function inWeavervilleBbox(lng: number, lat: number): boolean {
  return lat >= 35.65 && lat <= 35.75 && lng >= -82.62 && lng <= -82.50;
}

const config: ImportConfig<WvFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Town of Weaverville, NC Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'Town of Weaverville, NC tree inventory (~960 trees) maintained ' +
    'by the town just north of Asheville (Buncombe County). Source ' +
    'publishes Botanical (Latin binomial), Common, Stems, DBH, ' +
    'Condition, Heritage_T (landmark flag), and street address. AGOL ' +
    'item carries no explicit Creative Commons license — treated as ' +
    'public-with-attribution per Town of Weaverville publication.',
  regionName: REGION_NAME,
  license: 'Public (Town of Weaverville, NC; no explicit CC license)',
  async fetchAll() {
    return fetchArcGisLayer({ url: ENDPOINT }) as Promise<WvFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inWeavervilleBbox(lng, lat)) return null;

    const latin = (f.properties?.Botanical ?? '').trim();
    const common = (f.properties?.Common ?? '').trim();
    if (!latin && !common) return null;

    return {
      externalId: String(
        f.properties?.FID ??
          f.properties?.FID__ ??
          f.properties?.GlobalID_2 ??
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
  console.error('Weaverville trees import failed:', err);
  process.exit(1);
});
