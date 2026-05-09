// City of Hamilton (ON) Public Tree Inventory.
//
// Source: https://open.hamilton.ca/datasets/SpatialSolutions::public-tree-inventory
// API:    ArcGIS REST FeatureServer
// License: City of Hamilton Open Data Licence — attribution required,
//          permissive for commercial use.
// ~282k rows; both scientific and common name fields. Refreshed daily.
//
// Run with:
//   npm run import:hamilton-trees
//
// Requires a 'Hamilton public' region row before running.

import {
  fetchArcGisLayer,
  runImport,
  type ImportConfig
} from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'hamilton-public-trees';
const ENDPOINT =
  'https://services.arcgis.com/rYz782eMbySr2srL/ArcGIS/rest/services/Public_Tree_Inventory/FeatureServer/0/query';
const REGION_NAME = 'Hamilton public';

interface ArcGisFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    SPECIES_SCIENTIFIC?: string;
    SPECIES_COMMON?: string;
    DBH?: number;
    STATUS?: string;
  };
}

const config: ImportConfig<ArcGisFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'City of Hamilton Public Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    "Hamilton (ON) public tree inventory: street + park trees with " +
    "both scientific and common names. Open Data Licence — attribution required.",
  regionName: REGION_NAME,
  license: 'Hamilton Open Data Licence',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      where: 'SPECIES_SCIENTIFIC IS NOT NULL'
    }) as Promise<ArcGisFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const lng = f.geometry?.coordinates?.[0];
    const lat = f.geometry?.coordinates?.[1];
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    const latin = f.properties?.SPECIES_SCIENTIFIC;
    if (!latin) return null;
    return {
      externalId: String(f.properties?.OBJECTID ?? `${(lng as number).toFixed(6)},${(lat as number).toFixed(6)}`),
      scientificName: latin,
      commonName: f.properties?.SPECIES_COMMON,
      lng: lng as number,
      lat: lat as number,
      raw: f
    };
  }
};

runImport(config).catch((err) => {
  console.error('Hamilton trees import failed:', err);
  process.exit(1);
});
