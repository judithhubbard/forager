// Toronto Street Tree Data — City of Toronto Parks, Forestry &
// Recreation tree inventory, exposed via the CKAN DataStore API
// at the city's open data portal. ~689k street trees with proper
// botanical (Latin) and common name fields.
//
// Source: https://open.toronto.ca/dataset/street-tree-data/
// API:    CKAN datastore_search at ckan0.cf.opendata.inter.prod-toronto.ca
// License: City of Toronto open data terms (treats data as
//   freely usable; no explicit CC license but commercial use allowed).
//
// Run with:
//   npm run import:toronto-trees
//
// Requires a 'Toronto public' region row before running.

import {
  fetchCkanDataStore,
  runImport,
  type ImportConfig
} from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'toronto-street-trees';
const CKAN_BASE = 'https://ckan0.cf.opendata.inter.prod-toronto.ca';
const RESOURCE_ID = '3dafa392-c6ab-4f37-9bf9-21ddf7308eaf';
const REGION_NAME = 'Toronto public';

interface TorontoTree {
  STRUCTID?: string;
  BOTANICAL_NAME?: string;
  COMMON_NAME?: string;
  /** CKAN's datastore_search returns geometry as a STRINGIFIED
   *  GeoJSON, not a parsed object — distinct from the GeoJSON-formatted
   *  feature responses elsewhere. We JSON.parse on the fly in
   *  mapFeature. Some rows can also have it pre-parsed depending
   *  on the CKAN deployment, so accept both. */
  geometry?:
    | string
    | { type?: 'Point'; coordinates?: [number, number] };
}

function parseGeometry(g: TorontoTree['geometry']): [number, number] | null {
  if (!g) return null;
  let obj: { coordinates?: [number, number] } | null = null;
  if (typeof g === 'string') {
    try {
      obj = JSON.parse(g) as { coordinates?: [number, number] };
    } catch {
      return null;
    }
  } else {
    obj = g;
  }
  const c = obj?.coordinates;
  if (!c || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) return null;
  return [c[0], c[1]];
}

const config: ImportConfig<TorontoTree> = {
  sourceId: SOURCE_ID,
  sourceName: 'Toronto Street Trees',
  sourceUrl:
    `${CKAN_BASE}/api/3/action/datastore_search?resource_id=${RESOURCE_ID}`,
  sourceDescription:
    'City of Toronto Parks, Forestry & Recreation street tree ' +
    'inventory. ~689k trees with botanical species names. ' +
    'Open data via the City of Toronto open data terms.',
  regionName: REGION_NAME,
  license: 'City of Toronto open data terms',
  async fetchAll() {
    return fetchCkanDataStore({
      baseUrl: CKAN_BASE,
      resourceId: RESOURCE_ID
    }) as Promise<TorontoTree[]>;
  },
  mapFeature(t): ImportRecord | null {
    const coords = parseGeometry(t.geometry);
    if (!coords) return null;
    if (!t.BOTANICAL_NAME) return null;
    const [lng, lat] = coords;
    return {
      externalId:
        t.STRUCTID ?? `${lng.toFixed(6)},${lat.toFixed(6)}`,
      scientificName: t.BOTANICAL_NAME,
      commonName: t.COMMON_NAME,
      lng,
      lat,
      raw: t
    };
  }
};

runImport(config).catch((err) => {
  console.error('Toronto trees import failed:', err);
  process.exit(1);
});
