// Washington DC — DDOT Urban Forestry Division street tree
// inventory. Hosted on the DC GIS MapServer (note: MapServer, not
// FeatureServer — the framework's fetchArcGisLayer handles both).
//
// Source: https://opendata.dc.gov/datasets/urban-forestry-street-trees
// REST API: maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Urban_Tree_Canopy/MapServer/23/query
// License: DC Open Data terms (permissive; live feed updated weekly).
//
// ~175k street trees citywide. Fills zone 7b hole in current public coverage.
//
// Schema is clean: SCI_NM (Latin), CMMN_NM (common), GENUS_NAME, FACILITYID.
//
// Run: npm run import:dc-trees
// Pre-req: a 'Washington DC public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'dc-ddot-street-trees';
const ENDPOINT =
  'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Urban_Tree_Canopy/MapServer/23/query';
const REGION_NAME = 'Washington DC public';

interface ArcGisFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    FACILITYID?: string;
    SCI_NM?: string;
    CMMN_NM?: string;
    GENUS_NAME?: string;
  };
}

const config: ImportConfig<ArcGisFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Washington DC DDOT Street Trees',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'Washington DC Department of Transportation Urban Forestry ' +
    'Division street tree inventory. ~175k records, weekly updates. ' +
    'Permissive DC Open Data terms.',
  regionName: REGION_NAME,
  license: 'DC Open Data Terms',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      where: 'SCI_NM IS NOT NULL'
    }) as Promise<ArcGisFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const lng = Number(f.geometry?.coordinates?.[0]);
    const lat = Number(f.geometry?.coordinates?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    const latin = f.properties?.SCI_NM;
    if (!latin) return null;
    return {
      externalId: f.properties?.FACILITYID
        ?? String(f.properties?.OBJECTID ?? `${lng.toFixed(6)},${lat.toFixed(6)}`),
      scientificName: latin,
      commonName: f.properties?.CMMN_NM,
      lng,
      lat,
      raw: f
    };
  }
};

runImport(config).catch((err) => {
  console.error('DC trees import failed:', err);
  process.exit(1);
});
