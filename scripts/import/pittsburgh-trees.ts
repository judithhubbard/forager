// City of Pittsburgh trees (WPRDC City of Pittsburgh Trees dataset).
//
// Source: https://data.wprdc.org/dataset/city-trees
// API:    CKAN datastore (~45.7k rows)
// License: CC BY 4.0
// Schema: scientific_name, common_name, latitude, longitude.
// "Stump" entries skipped — they're tree pits, not living trees.
// Caveat: dataset is stale (last refreshed 2020). Includes i-Tree
// benefit columns we don't currently capture.
//
// Run with:
//   npm run import:pittsburgh-trees
//
// Requires a 'Pittsburgh public' region row before running.

import {
  fetchCkanDataStore,
  runImport,
  type ImportConfig
} from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'pittsburgh-city-trees';
const CKAN_BASE = 'https://data.wprdc.org';
const RESOURCE_ID = '1515a93c-73e3-4425-9b35-1cd11b2196da';
const REGION_NAME = 'Pittsburgh public';

interface PghRow extends Record<string, unknown> {
  _id?: number;
  id?: number | string;
  common_name?: string;
  scientific_name?: string;
  latitude?: number | string;
  longitude?: number | string;
}

const config: ImportConfig<PghRow> = {
  sourceId: SOURCE_ID,
  sourceName: 'City of Pittsburgh Trees (WPRDC)',
  sourceUrl: `${CKAN_BASE}/dataset/city-trees`,
  sourceDescription:
    'City of Pittsburgh urban tree inventory hosted by WPRDC. ' +
    'Includes i-Tree ecosystem-benefit columns (not currently ' +
    'captured by Forager). Last refreshed 2020 — stale.',
  regionName: REGION_NAME,
  license: 'CC BY 4.0',
  async fetchAll() {
    return fetchCkanDataStore({
      baseUrl: CKAN_BASE,
      resourceId: RESOURCE_ID
    }) as Promise<PghRow[]>;
  },
  mapFeature(r): ImportRecord | null {
    const sci = (r.scientific_name ?? '').toString().trim();
    if (!sci || sci.toLowerCase() === 'stump') return null;
    const lat = Number(r.latitude);
    const lng = Number(r.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      externalId: String(r._id ?? r.id ?? `${lng.toFixed(6)},${lat.toFixed(6)}`),
      scientificName: sci,
      commonName: (r.common_name ?? '').toString().trim() || undefined,
      lng,
      lat,
      raw: r
    };
  }
};

runImport(config).catch((err) => {
  console.error('Pittsburgh trees import failed:', err);
  process.exit(1);
});
