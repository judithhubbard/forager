// Madison (WI) Urban Forestry Street Trees — refresh of the
// stale OpenTrees `madison` source (last seen 2020). Live ArcGIS
// MapServer endpoint refreshes through 2025.
//
// Source: https://data-cityofmadison.opendata.arcgis.com/datasets/cityofmadison::street-trees
// API:    City of Madison ArcGIS REST MapServer
// License: City of Madison open data terms (permissive)
//
// Run with:
//   npm run import:madison-trees
//
// Requires a 'Madison public' region row before running.

import {
  fetchArcGisLayer,
  runImport,
  type ImportConfig
} from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'madison-street-trees';
const ENDPOINT =
  'https://maps.cityofmadison.com/arcgis/rest/services/Public/OPEN_DATA/MapServer/0/query';
const REGION_NAME = 'Madison public';

// Schema confirmed via /MapServer/0?f=json: SPP_BOT (scientific),
// SPP_COM (common), STATUS, site_id.
interface ArcGisFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    site_id?: number;
    SPP_BOT?: string;
    SPP_COM?: string;
    STATUS?: string;
  };
}

const config: ImportConfig<ArcGisFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Madison Urban Forestry Street Trees',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of Madison Urban Forestry street tree inventory. ' +
    'Refreshes the stale OpenTrees `madison` (~2020) snapshot ' +
    'with the live ArcGIS MapServer feed.',
  regionName: REGION_NAME,
  license: 'City of Madison Open Data',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      where: "SPP_BOT IS NOT NULL AND STATUS = 'Active'"
    }) as Promise<ArcGisFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const lng = f.geometry?.coordinates?.[0];
    const lat = f.geometry?.coordinates?.[1];
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    const sci = f.properties?.SPP_BOT;
    if (!sci) return null;
    return {
      externalId: String(f.properties?.OBJECTID ?? f.properties?.site_id ?? `${(lng as number).toFixed(6)},${(lat as number).toFixed(6)}`),
      scientificName: sci,
      commonName: f.properties?.SPP_COM,
      lng: lng as number,
      lat: lat as number,
      raw: f
    };
  }
};

runImport(config).catch((err) => {
  console.error('Madison trees import failed:', err);
  process.exit(1);
});
