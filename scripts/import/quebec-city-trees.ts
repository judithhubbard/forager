// Ville de Québec — "Arbres répertoriés" (the catalogued public trees
// of Québec City, distinct from `vque_31` "non-répertoriés" which is
// the discovery-pending layer and `vque_82` "potentiellement
// remarquables" which is a curated heritage subset).
//
// Source page: https://www.donneesquebec.ca/recherche/dataset/vque_26
// API:         CKAN datastore_search on donneesquebec.ca
// License:     Creative Commons Attribution 4.0 (CC BY 4.0)
//
// Verified row count (2026-05-10): 158,123. Climate: zone 4b/5a
// (continental humid). Complements Montréal (5b/6a) and the
// future Trois-Rivières / Sherbrooke imports.
//
// Schema confirmed live: NOM_LATIN (Latin binomial), NOM_FRANCAIS
// (French common), LATITUDE, LONGITUDE (decimal degrees, WGS84 as
// strings), TYPE_LIEU (Lieu public / parc / etc), NOM_TOPOGRAPHIE
// (park or street name), _id as CKAN OID.
//
// Run: npm run import:quebec-city-trees
// Pre-req: a 'Québec public' region row.

import { fetchCkanDataStore, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'quebec-city-arbres-repertories';
const CKAN_BASE = 'https://www.donneesquebec.ca/recherche';
const RESOURCE_ID = '13a51853-a5b5-4add-8791-02ccba5c1be7';
const REGION_NAME = 'Québec public';

interface QcRow extends Record<string, unknown> {
  _id?: number;
  ID?: string;
  TYPE_LIEU?: string;
  NOM_LATIN?: string;
  NOM_FRANCAIS?: string;
  TYPE_ARBRE?: string;
  DIAMETRE?: string;
  LATITUDE?: string;          // CKAN serves numerics as text
  LONGITUDE?: string;
  NOM_TOPOGRAPHIE?: string;
}

const config: ImportConfig<QcRow> = {
  sourceId: SOURCE_ID,
  sourceName: 'Québec City Public Trees (Arbres répertoriés)',
  sourceUrl: `${CKAN_BASE}/dataset/vque_26`,
  sourceDescription:
    'Ville de Québec catalogued public tree inventory (~158k records ' +
    'across public lands). CC BY 4.0. Schema includes Latin name, ' +
    'French common name, decimal-degree lat/lng, and topographic ' +
    'context (street or park name).',
  regionName: REGION_NAME,
  license: 'CC BY 4.0',
  async fetchAll() {
    return fetchCkanDataStore({
      baseUrl: CKAN_BASE,
      resourceId: RESOURCE_ID
    }) as Promise<QcRow[]>;
  },
  mapFeature(r): ImportRecord | null {
    const lat = Number(r.LATITUDE);
    const lng = Number(r.LONGITUDE);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    // Québec City sits ~46.8N, -71.2W; drop anything outside a
    // generous metro bounding box.
    if (lat < 46 || lat > 47.5 || lng < -72 || lng > -70.5) return null;

    const latin = (r.NOM_LATIN ?? '').toString().trim();
    if (!latin) return null;
    const common = (r.NOM_FRANCAIS ?? '').toString().trim();

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
  console.error('Québec City trees import failed:', err);
  process.exit(1);
});
