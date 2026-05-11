// Westchester County NY — Public Trees countywide. A volunteer /
// municipal inventory aggregated at the county level (smaller than
// the FEMC-private city-level stubs would suggest — 7,264 rows is the
// county's published subset, not all constituent cities' full
// inventories).
//
// Geographic coverage: Hudson Valley west bank zone 6a/7a, including
// Mamaroneck, New Rochelle, White Plains, Yonkers, etc. Complements
// NYC (zone 7b) just south.
//
// Source page: https://gis.westchestergov.com/
// REST API:    https://services.arcgis.com/0ofY9RQ0ZCO4aRRx/arcgis/rest/services/Westchester_Public_Trees/FeatureServer/0
// License:     Westchester GIS open data (permissive; no explicit CC,
//              treat as public-data attribution to "Westchester County GIS").
// Refresh:     2024 published version.
//
// Schema: LATIN_NAME + COMMON_NAME + VARIETY + DBH + ADDRESS +
// CONDITION + STRATUM (USDA hardiness code).
//
// Run: npm run import:westchester-county-trees
// Pre-req: a 'Westchester County public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'westchester-county-public-trees';
const ENDPOINT =
  'https://services.arcgis.com/0ofY9RQ0ZCO4aRRx/arcgis/rest/services/Westchester_Public_Trees/FeatureServer/0/query';
const REGION_NAME = 'Westchester County public';

interface WfFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    LATIN_NAME?: string;
    COMMON_NAME?: string;
    VARIETY?: string;
    ADDRESS?: string;
    CONDITION?: string;
  };
}

const config: ImportConfig<WfFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Westchester County NY Public Trees',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'Westchester County NY public trees — county-level aggregator ' +
    'covering Mamaroneck, New Rochelle, White Plains, Yonkers, and ' +
    'other constituent municipalities. ~7,264 trees. Westchester GIS ' +
    'open data, attribution to Westchester County GIS.',
  regionName: REGION_NAME,
  license: 'Westchester County GIS open data',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      where: 'LATIN_NAME IS NOT NULL'
    }) as Promise<WfFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const lng = Number(f.geometry?.coordinates?.[0]);
    const lat = Number(f.geometry?.coordinates?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    const latin = f.properties?.LATIN_NAME?.trim();
    if (!latin) return null;
    return {
      externalId: String(f.properties?.OBJECTID ?? `${lng.toFixed(6)},${lat.toFixed(6)}`),
      scientificName: latin,
      commonName: f.properties?.COMMON_NAME,
      lng,
      lat,
      raw: f as unknown as Record<string, unknown>
    };
  }
};

runImport(config).catch((err) => {
  console.error('Westchester County trees import failed:', err);
  process.exit(1);
});
