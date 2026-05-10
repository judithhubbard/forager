// Ville de Saguenay — "Inventaire des arbres répertoriés"
// (catalogued trees on municipal rights-of-way and city-owned land
// across Chicoutimi, Jonquière, and La Baie arrondissements).
//
// Source page: https://www.donneesquebec.ca/recherche/dataset/sag_inventaire-des-arbres-repertories
// API:         CKAN datastore_search on donneesquebec.ca
// License:     Creative Commons Attribution 4.0 (CC BY 4.0)
//
// Verified row count (2026-05-10): 28,241. Climate: USDA zone 3b/4a
// (boreal-margin continental) — *coldest* zone in our public tier
// to date, fills a major gap above the Montréal/Québec-City zone 5
// coverage.
//
// Schema confirmed live: essence_latin (Latin), essence_fr (French
// common), latitude, longitude (decimal degrees as strings),
// arrondissement (district), parc (when applicable), _id as OID.
// Note: field names are lowercase here unlike Québec City's
// uppercase — CKAN preserves the publisher's original casing.
//
// Run: npm run import:saguenay-trees
// Pre-req: a 'Saguenay public' region row.

import { fetchCkanDataStore, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'saguenay-arbres-repertories';
const CKAN_BASE = 'https://www.donneesquebec.ca/recherche';
const RESOURCE_ID = 'e529b48b-b17d-46e7-aaf2-6e408a38b6e8';
const REGION_NAME = 'Saguenay public';

interface SagRow extends Record<string, unknown> {
  _id?: number;
  id?: string;
  no_civique?: string;
  rue?: string;
  secteur?: string;
  arrondissement?: string;
  parc?: string | null;
  essence_fr?: string;
  essence_latin?: string;
  dhp?: string;
  latitude?: string;
  longitude?: string;
}

const config: ImportConfig<SagRow> = {
  sourceId: SOURCE_ID,
  sourceName: 'Saguenay Public Trees (Inventaire des arbres répertoriés)',
  sourceUrl: `${CKAN_BASE}/dataset/sag_inventaire-des-arbres-repertories`,
  sourceDescription:
    'Ville de Saguenay catalogued public tree inventory (~28k records ' +
    'across Chicoutimi, Jonquière, La Baie). CC BY 4.0. Fills the ' +
    'boreal-margin zone-3b/4a gap above existing Québec coverage.',
  regionName: REGION_NAME,
  license: 'CC BY 4.0',
  async fetchAll() {
    return fetchCkanDataStore({
      baseUrl: CKAN_BASE,
      resourceId: RESOURCE_ID
    }) as Promise<SagRow[]>;
  },
  mapFeature(r): ImportRecord | null {
    const lat = Number(r.latitude);
    const lng = Number(r.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    // Saguenay region ~48–49N, -72 – -70.5W.
    if (lat < 47.5 || lat > 49.5 || lng < -72.5 || lng > -70) return null;

    const latin = (r.essence_latin ?? '').toString().trim();
    if (!latin) return null;
    const common = (r.essence_fr ?? '').toString().trim();

    return {
      externalId: String(r._id ?? r.id ?? `${lng.toFixed(6)},${lat.toFixed(6)}`),
      scientificName: latin,
      commonName: common || undefined,
      lng,
      lat,
      raw: r
    };
  }
};

runImport(config).catch((err) => {
  console.error('Saguenay trees import failed:', err);
  process.exit(1);
});
