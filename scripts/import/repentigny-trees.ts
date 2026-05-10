// Ville de Repentigny — "Arbres" (city tree inventory on municipal
// rights-of-way; suburb on Montréal's North Shore).
//
// Source page: https://www.donneesquebec.ca/recherche/dataset/vrep-arbres
// API:         CKAN datastore_search on donneesquebec.ca
// License:     Creative Commons Attribution 4.0 (CC BY 4.0)
//
// Verified row count (2026-05-10): 164,116. Climate: USDA 5b — same
// zone as Montréal but distinct microclimate (further from the
// Saint Lawrence's marine moderation).
//
// Schema confirmed live: ESSENCE_LATIN (Latin binomial), ESSENCE_FR
// (French common), Latitude, Longitude (decimal degrees as strings,
// WGS84), DHP (diameter at breast height), ETAT (condition),
// PROPRIETE ('Terrain municipal'), _id as CKAN OID.
//
// Run: npm run import:repentigny-trees
// Pre-req: a 'Repentigny public' region row.

import { fetchCkanDataStore, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'repentigny-arbres';
const CKAN_BASE = 'https://www.donneesquebec.ca/recherche';
const RESOURCE_ID = '0ab4da5a-b470-4774-9f2a-4d9bb19763a5';
const REGION_NAME = 'Repentigny public';

interface RepRow extends Record<string, unknown> {
  _id?: number;
  ID?: string;
  NO_CIVIQUE?: string;
  RUE?: string;
  ESSENCE_FR?: string;
  ESSENCE_LATIN?: string;
  DHP?: string;
  ETAT?: string;
  PROPRIETE?: string;
  Latitude?: string;
  Longitude?: string;
}

const config: ImportConfig<RepRow> = {
  sourceId: SOURCE_ID,
  sourceName: 'Repentigny Public Trees (Arbres)',
  sourceUrl: `${CKAN_BASE}/dataset/vrep-arbres`,
  sourceDescription:
    'Ville de Repentigny public tree inventory (~164k records on ' +
    'municipal rights-of-way; Montréal North Shore suburb). ' +
    'CC BY 4.0.',
  regionName: REGION_NAME,
  license: 'CC BY 4.0',
  async fetchAll() {
    return fetchCkanDataStore({
      baseUrl: CKAN_BASE,
      resourceId: RESOURCE_ID
    }) as Promise<RepRow[]>;
  },
  mapFeature(r): ImportRecord | null {
    const lat = Number(r.Latitude);
    const lng = Number(r.Longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    // Repentigny ~45.7N, -73.5W; small footprint.
    if (lat < 45.5 || lat > 46.0 || lng < -73.7 || lng > -73.2) return null;

    const latin = (r.ESSENCE_LATIN ?? '').toString().trim();
    if (!latin) return null;
    const common = (r.ESSENCE_FR ?? '').toString().trim();

    return {
      externalId: String(r._id ?? r.ID ?? `${lng.toFixed(6)},${lat.toFixed(6)}`),
      scientificName: latin,
      commonName: common || undefined,
      lng,
      lat,
      raw: r
    };
  }
};

runImport(config).catch((err) => {
  console.error('Repentigny trees import failed:', err);
  process.exit(1);
});
