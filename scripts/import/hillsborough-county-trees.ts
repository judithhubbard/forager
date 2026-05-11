// Hillsborough County, FL — County Park Trees (Parks & Recreation
// inventory). ~10.9k inventoried trees on county parkland (Tampa
// metro suburbs and surrounding parks). Maintained by Hillsborough
// County Parks & Recreation and published as a public hosted feature
// service on the County's AGOL org.
//
// Source page: https://www.arcgis.com/home/item.html?id=3332fa56f5184334854cb4951bbfe88c
// REST API:    services.arcgis.com/apTfC6SUmnNfnxuF/.../CountyPark_Trees_All_20210127/FeatureServer/0
// License:     Hosted feature service on County AGOL org; no explicit
//              Creative Commons license string. Treated as public-with-
//              attribution per Hillsborough County Parks & Recreation
//              publication.
// Refresh:     2026-05-11 verified count = 10,916. Snapshot timestamp
//              in service name is 2021-01-27; data may not have been
//              updated since.
//
// Schema notes:
//   - Scientific holds the Latin binomial.
//   - CommonName holds the common name.
//   - DBH (in), Height, RiskRating, DeadTree, GrandTree, and Cityworks-
//     style inspection fields are present. The DeadTree flag has not
//     been verified as reliable; we keep all records and rely on the
//     ImportSource visibility for downstream curation.
//
// Run: npm run import:hillsborough-county-trees
// Pre-req: a 'Hillsborough County public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'hillsborough-county-park-trees';
const LAYER_URL =
  'https://services.arcgis.com/apTfC6SUmnNfnxuF/arcgis/rest/services/CountyPark_Trees_All_20210127/FeatureServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Hillsborough County public';

interface HilFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    FID?: number;
    ID?: number;
    Lat?: number;
    Lng?: number;
    Location?: string;
    DBH?: number;
    Height?: number;
    CommonName?: string;
    Scientific?: string;
    RiskRating?: string;
    DeadTree?: string;
    GrandTree?: string;
  };
}

/** Hillsborough County, FL bbox. County spans roughly 27.69–28.17 N
 *  and -82.63 – -82.07 W (Tampa, Plant City, county parks). Pad
 *  slightly. The service's declared full extent matches this range. */
function inHillsboroughBbox(lng: number, lat: number): boolean {
  return lat >= 27.65 && lat <= 28.25 && lng >= -82.70 && lng <= -82.00;
}

const config: ImportConfig<HilFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Hillsborough County, FL County Park Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'Hillsborough County, FL Parks & Recreation tree inventory ' +
    '(~10.9k trees) covering county parkland in the Tampa metro and ' +
    'surrounding parks. Snapshot dated 2021-01-27 (per service name). ' +
    'Source publishes Scientific (Latin binomial), CommonName, DBH, ' +
    'Height, RiskRating, and inspection fields. AGOL item carries no ' +
    'explicit Creative Commons license — treated as public-with-' +
    'attribution per Hillsborough County publication.',
  regionName: REGION_NAME,
  license: 'Public (Hillsborough County, FL; no explicit CC license)',
  async fetchAll() {
    return fetchArcGisLayer({ url: ENDPOINT }) as Promise<HilFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inHillsboroughBbox(lng, lat)) return null;

    const latin = (f.properties?.Scientific ?? '').trim();
    const common = (f.properties?.CommonName ?? '').trim();
    if (!latin && !common) return null;

    return {
      externalId: String(
        f.properties?.FID ??
          f.properties?.ID ??
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
  console.error('Hillsborough County trees import failed:', err);
  process.exit(1);
});
