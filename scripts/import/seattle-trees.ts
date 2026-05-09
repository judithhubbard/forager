// Seattle Combined Tree Point inventory (SDOT + Parks + utility +
// pest-marked + planting-unit feeds, unioned by the city).
//
// Source: https://data-seattlecitygis.opendata.arcgis.com/datasets/SeattleCityGIS::combined-tree-point
// API:    ArcGIS REST FeatureServer
// License: City of Seattle open-data terms — permissive, attribution
//          appreciated, accuracy disclaimed.
//
// (My initial guess at SDOT_TREES/FeatureServer/0 returned 400 —
// the canonical layer is Combined_Tree_Point, with SCIENTIFIC_NAME +
// COMMON_NAME columns.)
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

const SOURCE_ID = 'seattle-combined-trees';
const ENDPOINT =
  'https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/Combined_Tree_Point/FeatureServer/0/query';
const REGION_NAME = 'Seattle public';

interface ArcGisFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    SDOT_UNIT_ID?: string;
    SPR_UNIT_ID?: string;
    SCIENTIFIC_NAME?: string;
    COMMON_NAME?: string;
    SOURCE_DEPT?: string;
  };
}

const config: ImportConfig<ArcGisFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Seattle Combined Tree Point',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of Seattle combined tree-point inventory — union of SDOT, ' +
    'Parks, utility, and other city tree feeds.',
  regionName: REGION_NAME,
  license: 'City of Seattle Open Data Terms',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      where: 'SCIENTIFIC_NAME IS NOT NULL'
    }) as Promise<ArcGisFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const lng = f.geometry?.coordinates?.[0];
    const lat = f.geometry?.coordinates?.[1];
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    const latin = f.properties?.SCIENTIFIC_NAME;
    if (!latin) return null;
    return {
      externalId: String(
        f.properties?.OBJECTID ??
        f.properties?.SDOT_UNIT_ID ??
        f.properties?.SPR_UNIT_ID ??
        `${(lng as number).toFixed(6)},${(lat as number).toFixed(6)}`
      ),
      scientificName: latin,
      commonName: f.properties?.COMMON_NAME,
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
