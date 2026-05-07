// Boston Parks & Recreation Department tree inventory (BPRD Trees)
// — both park and street trees, with separate scientific (`spp_bot`)
// and common (`spp_com`) name fields and lat/lng already in EPSG 4326.
//
// Source: https://data.boston.gov/dataset/bprd-trees
// API:    ArcGIS REST FeatureServer
// License: Open Data Commons Public Domain Dedication and License (PDDL).
//
// Run with:
//   npm run import:boston-trees
//
// Requires a 'Boston public' region row before running.

import {
  fetchArcGisLayer,
  runImport,
  type ImportConfig
} from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'boston-bprd-trees';
const ENDPOINT =
  'https://services.arcgis.com/sFnw0xNflSi8J0uh/arcgis/rest/services/BPRD_Trees/FeatureServer/0/query';
const REGION_NAME = 'Boston public';

/** ArcGIS GeoJSON feature shape. The framework's fetchArcGisLayer
 *  returns features with this exact structure (it uses f=geojson). */
interface ArcGisFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    spp_bot?: string;        // botanical (Latin) species name
    spp_com?: string;        // common species name
    x_longitude?: number;    // duplicate of geometry but useful as fallback
    y_latitude?: number;
  };
}

const config: ImportConfig<ArcGisFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Boston BPRD Trees',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of Boston Parks & Recreation Department tree inventory ' +
    '(both park and street trees). Public domain via the Open Data ' +
    'Commons PDDL.',
  regionName: REGION_NAME,
  license: 'Open Data Commons Public Domain Dedication and License (PDDL)',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      // Filter at the API tier: we only need rows with a botanical
      // name. Dataset has no 'status' column to filter on (unlike NYC).
      where: 'spp_bot IS NOT NULL'
    }) as Promise<ArcGisFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const geomLng = f.geometry?.coordinates?.[0];
    const geomLat = f.geometry?.coordinates?.[1];
    const lng = Number.isFinite(geomLng) ? Number(geomLng) : Number(f.properties?.x_longitude);
    const lat = Number.isFinite(geomLat) ? Number(geomLat) : Number(f.properties?.y_latitude);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    const latin = f.properties?.spp_bot;
    if (!latin) return null;
    return {
      externalId: String(f.properties?.OBJECTID ?? `${lng.toFixed(6)},${lat.toFixed(6)}`),
      scientificName: latin,
      commonName: f.properties?.spp_com,
      lng,
      lat,
      raw: f
    };
  }
};

runImport(config).catch((err) => {
  console.error('Boston trees import failed:', err);
  process.exit(1);
});
