// City of Charlottesville Tree Inventory.
//
// Source: https://opendata.charlottesville.org/datasets/charlottesville::tree-inventory-point
// API:    City of Charlottesville ArcGIS REST MapServer
// License: City of Charlottesville open-data terms (permissive)
// ~7,951 trees. Schema has Genus + Species split (no full
// scientific column), Common_Name. Combine genus+species for the
// matcher.
//
// Run with:
//   npm run import:charlottesville-trees
//
// Requires a 'Charlottesville public' region row before running.

import {
  fetchArcGisLayer,
  runImport,
  type ImportConfig
} from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'charlottesville-tree-inventory';
const ENDPOINT =
  'https://gisweb.charlottesville.org/arcgis/rest/services/OpenData_1/MapServer/79/query';
const REGION_NAME = 'Charlottesville public';

interface ArcGisFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    Asset_ID?: string;
    Common_Name?: string;
    Genus?: string;
    Species?: string;
    Removal_Date?: number | null;
  };
}

const config: ImportConfig<ArcGisFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Charlottesville Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of Charlottesville (VA) tree inventory. Per-tree points ' +
    'with Genus + Species fields (combined into scientific name on ' +
    'import) and Common_Name. Skips rows where Removal_Date is set.',
  regionName: REGION_NAME,
  license: 'City of Charlottesville Open Data',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      where: 'Genus IS NOT NULL AND Species IS NOT NULL AND Removal_Date IS NULL'
    }) as Promise<ArcGisFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const lng = f.geometry?.coordinates?.[0];
    const lat = f.geometry?.coordinates?.[1];
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    const g = f.properties?.Genus?.trim();
    const s = f.properties?.Species?.trim();
    if (!g || !s) return null;
    return {
      externalId: String(f.properties?.OBJECTID ?? f.properties?.Asset_ID ?? `${(lng as number).toFixed(6)},${(lat as number).toFixed(6)}`),
      scientificName: `${g} ${s}`,
      commonName: f.properties?.Common_Name,
      lng: lng as number,
      lat: lat as number,
      raw: f
    };
  }
};

runImport(config).catch((err) => {
  console.error('Charlottesville trees import failed:', err);
  process.exit(1);
});
