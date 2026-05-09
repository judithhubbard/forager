// Seattle SDOT Trees inventory.
//
// Source: https://data-seattlecitygis.opendata.arcgis.com/datasets/SeattleCityGIS::sdot-trees
// API:    ArcGIS REST FeatureServer
// License: City of Seattle open-data terms — permissive, attribution
//          appreciated, accuracy disclaimed.
// ~267k rows; daily refresh. Treekeeper-flavored schema with
// SCIENTIFICN + COMMONNAME columns.
//
// Filter: SDOT publishes both in-service and removed/dead rows.
// CURRENT_STATUS = 'INSVC' keeps just the live trees.
//
// Run with:
//   npm run import:seattle-trees
//
// Requires a 'Seattle public' region row before running.

import {
  fetchArcGisLayer,
  runImport,
  type ImportConfig
} from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'seattle-sdot-trees';
const ENDPOINT =
  'https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/SDOT_TREES/FeatureServer/0/query';
const REGION_NAME = 'Seattle public';

interface ArcGisFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    UNITID?: string;
    SCIENTIFIC?: string;
    SCIENTIFICN?: string;
    COMMONNAME?: string;
    CURRENT_STATUS?: string;
  };
}

const config: ImportConfig<ArcGisFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Seattle SDOT Trees',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of Seattle Department of Transportation tree inventory — ' +
    'street + right-of-way trees. Treekeeper schema, daily refresh.',
  regionName: REGION_NAME,
  license: 'City of Seattle Open Data Terms',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      where: "CURRENT_STATUS = 'INSVC'"
    }) as Promise<ArcGisFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const lng = f.geometry?.coordinates?.[0];
    const lat = f.geometry?.coordinates?.[1];
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    const latin = f.properties?.SCIENTIFICN ?? f.properties?.SCIENTIFIC;
    if (!latin) return null;
    return {
      externalId: String(f.properties?.OBJECTID ?? f.properties?.UNITID ?? `${(lng as number).toFixed(6)},${(lat as number).toFixed(6)}`),
      scientificName: latin,
      commonName: f.properties?.COMMONNAME,
      lng: lng as number,
      lat: lat as number,
      raw: f
    };
  }
};

runImport(config).catch((err) => {
  console.error('Seattle trees import failed:', err);
  process.exit(1);
});
