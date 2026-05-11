// City of Newport News, VA — Public Tree Inventory.
// ~914 trees in the publicly-shared view of the city's larger Cityworks
// tree inventory. The full city inventory exists as a non-public-view
// layer (`Trees_Not_Public_View`) which returns 0 rows for anonymous
// callers — only the curated public view is exposed.
//
// Source page: https://www.arcgis.com/home/item.html?id=9d10ce6b9f0e4d29ac48285037193138
// REST API:    services6.arcgis.com/SiUAoHzWN11AIADA/.../Trees_Public_View/FeatureServer/1
// License:     City of Newport News public open data; no explicit CC
//              license string. Treated as public-with-attribution per
//              City of Newport News GIS publication.
// Refresh:     2026-05-11 verified count = 914 in the public view.
//              City likely maintains more in their non-public layer
//              but only the public-view is exposed (flagged for
//              Phase 3 outreach to expand if needed).
//
// Schema notes:
//   - genus + species are separate fields; concatenate to form Latin.
//   - commonname holds the common name.
//   - publicview = 'Yes' confirms exposure; the view already filters.
//
// Run: npm run import:newport-news-trees
// Pre-req: a 'Newport News public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'newport-news-public-trees';
const LAYER_URL =
  'https://services6.arcgis.com/SiUAoHzWN11AIADA/arcgis/rest/services/Trees_Public_View/FeatureServer/1';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Newport News public';

interface NnFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    assetid?: string;
    fulladdr?: string;
    district?: string;
    municipality?: string;
    commonname?: string;
    genus?: string;
    species?: string;
    diameter?: number;
    height?: number;
    heritage?: string;
    publicview?: string;
    globalid?: string;
    Condition?: string;
  };
}

/** Newport News, VA bbox. City sits at 37.0871 N, -76.4730 W along
 *  the lower James River. Pad to cover the full peninsula. */
function inNewportNewsBbox(lng: number, lat: number): boolean {
  return lat >= 36.95 && lat <= 37.22 && lng >= -76.62 && lng <= -76.35;
}

const config: ImportConfig<NnFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'City of Newport News, VA Public Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of Newport News, VA public tree inventory (~914 trees) ' +
    'maintained by City GIS. The full Cityworks inventory is hosted as ' +
    'a separate non-public-view layer that returns 0 rows for anonymous ' +
    'callers; only this curated public-view is exposed. Source ' +
    'publishes genus + species (separate fields), commonname, diameter, ' +
    'height, district, municipality, heritage (landmark flag), and ' +
    'condition. AGOL item has no explicit Creative Commons license ' +
    '— treated as public-with-attribution per City of Newport News ' +
    'publication.',
  regionName: REGION_NAME,
  license: 'Public (City of Newport News, VA; no explicit CC license)',
  async fetchAll() {
    return fetchArcGisLayer({ url: ENDPOINT }) as Promise<NnFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inNewportNewsBbox(lng, lat)) return null;

    const genus = (f.properties?.genus ?? '').trim();
    const species = (f.properties?.species ?? '').trim();
    // Concatenate to a binomial when both are present; fall back to
    // just genus or just common name.
    const latin = genus && species ? `${genus} ${species}` : genus;
    const common = (f.properties?.commonname ?? '').trim();
    if (!latin && !common) return null;

    return {
      externalId: String(
        f.properties?.OBJECTID ??
          f.properties?.assetid ??
          f.properties?.globalid ??
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
  console.error('Newport News trees import failed:', err);
  process.exit(1);
});
