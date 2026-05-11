// Bates College — Campus Tree Inventory ("Trees of Bates").
// ~512 trees on the Bates College campus in Lewiston, ME, published by
// Bates GIS staff (owner=cmurray2_Bates2).
//
// Source page: https://www.arcgis.com/home/item.html?id=b310ddc1670243d2af4f01d121b8cb9b
// REST API:    services6.arcgis.com/Tn4wEZ0eH9wSsA4l/.../Trees_of_Bates/FeatureServer/0
// License:     Bates College public-view layer; no explicit CC license
//              string. Treated as public-with-attribution per Bates
//              publication.
// Refresh:     2026-05-11 verified count = 512.
//
// Schema notes:
//   - Common_nam holds the common name (truncated field name).
//   - Genus + species are separate fields.
//   - Family is a separate field carried into raw.
//
// Run: npm run import:bates-trees
// Pre-req: a 'Lewiston public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'bates-college-trees';
const LAYER_URL =
  'https://services6.arcgis.com/Tn4wEZ0eH9wSsA4l/arcgis/rest/services/Trees_of_Bates/FeatureServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Lewiston public';

interface BatesFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    Common_nam?: string;
    Genus?: string;
    species?: string;
    Family?: string;
    DBH?: number;
    DBH_cm?: string;
  };
}

/** Bates College campus bbox. Lewiston ME, roughly 44.10–44.11 N /
 *  -70.21 – -70.20 W. Pad slightly. */
function inBatesBbox(lng: number, lat: number): boolean {
  return lat >= 44.08 && lat <= 44.13 && lng >= -70.24 && lng <= -70.17;
}

const config: ImportConfig<BatesFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Bates College Campus Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'Bates College campus tree inventory (~512 trees) in Lewiston, ME. ' +
    'Maintained by Bates GIS staff. Source publishes Genus + species ' +
    '(separate), Common_nam, Family, DBH/DBH_cm, and educational ' +
    'fields (Leaves, Twigs_Buds, Fruit_Cone, Bark, Silvics, photo ' +
    'URLs). AGOL item has no explicit CC license — treated as public-' +
    'with-attribution per Bates College publication.',
  regionName: REGION_NAME,
  license: 'Public (Bates College; no explicit CC license)',
  async fetchAll() {
    return fetchArcGisLayer({ url: ENDPOINT }) as Promise<BatesFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inBatesBbox(lng, lat)) return null;

    const genus = (f.properties?.Genus ?? '').trim();
    const species = (f.properties?.species ?? '').trim();
    const latin = genus && species ? `${genus} ${species}` : genus;
    const common = (f.properties?.Common_nam ?? '').trim();
    if (!latin && !common) return null;

    return {
      externalId: String(
        f.properties?.OBJECTID ??
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
  console.error('Bates trees import failed:', err);
  process.exit(1);
});
