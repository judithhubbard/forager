// Ville de Montréal — "Inventaire des arbres publics" (public trees
// citywide: streets + parks across all 19 boroughs).
//
// Source page: https://donnees.montreal.ca/dataset/arbres
// Resource:    arbres-publics.csv (consolidated)
// API:         CKAN datastore — donnees.montreal.ca/api/3/action/datastore_search
// License:     Creative Commons Attribution 4.0 International (CC BY 4.0)
//
// ~334k records. Quebec zone-5b/6a — sister to Ithaca's continental
// climate, fills the eastern-Canada gap between Toronto and the
// Atlantic provinces. Monthly refresh.
//
// Schema is rich: `Essence_latin` (Latin), `Essence_fr` (French
// common), `Essence_ang` (English common), `Latitude`, `Longitude`,
// `_id` (CKAN row id), `EMP_NO` (Montreal's tree-emplacement number,
// not unique across boroughs — INV_TYPE='R'/'H' + ARROND + EMP_NO is
// the natural key, but `_id` is stable and simpler).
//
// Note: a few records have non-binomial Essence_latin values like
// "Essence inconnue" ("unknown species") or "Aucun arbre" ("no
// tree" — vacant slot). The species matcher rejects these naturally
// (no Latin binomial = no match), so they fall into the
// "skipped: not in forageable list" bucket.
//
// Run: npm run import:montreal-trees
// Pre-req: a 'Montréal public' region row.

import { fetchCkanDataStore, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'montreal-public-trees';
const CKAN_BASE = 'https://donnees.montreal.ca';
const RESOURCE_ID = '64e28fe6-ef37-437a-972d-d1d3f1f7d891';
const REGION_NAME = 'Montréal public';

interface MtlRow extends Record<string, unknown> {
  _id?: number;
  INV_TYPE?: string;          // 'R' street, 'H' off-street (parks etc.)
  EMP_NO?: string;
  ARROND?: string;
  ARROND_NOM?: string;
  Essence_latin?: string;     // "Gleditsia triacanthos 'Skyline'"
  Essence_fr?: string;        // "Févier Skyline"
  Essence_ang?: string;       // "Skyline Honey-Locust"
  Latitude?: string;          // CKAN returns numbers as text
  Longitude?: string;
}

const config: ImportConfig<MtlRow> = {
  sourceId: SOURCE_ID,
  sourceName: 'Montréal Public Trees (Inventaire des arbres publics)',
  sourceUrl: `${CKAN_BASE}/dataset/arbres`,
  sourceDescription:
    'Ville de Montréal public tree inventory (streets + parks, ' +
    '~334k records across 19 boroughs). CC BY 4.0. Schema includes ' +
    'separate Latin, French, and English species names; a few rows ' +
    'use placeholder "Essence inconnue" / "Aucun arbre" markers ' +
    'which are filtered out at species-match time.',
  regionName: REGION_NAME,
  license: 'CC BY 4.0',
  async fetchAll() {
    return fetchCkanDataStore({
      baseUrl: CKAN_BASE,
      resourceId: RESOURCE_ID
    }) as Promise<MtlRow[]>;
  },
  mapFeature(r): ImportRecord | null {
    const lat = Number(r.Latitude);
    const lng = Number(r.Longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    // (0,0) sentinels and points outside the Montréal bounding box
    // (~45–46N, -74 – -73W) get dropped.
    if (lat < 44 || lat > 47 || lng < -75 || lng > -73) return null;

    const latin = (r.Essence_latin ?? '').toString().trim();
    if (!latin) return null;
    // French/English common name. Prefer English for matchSpecies
    // (forageable_species.json is English-keyed); keep French in
    // import_raw via the spread.
    const common = (r.Essence_ang ?? r.Essence_fr ?? '').toString().trim();

    return {
      externalId: String(r._id ?? `${lng.toFixed(6)},${lat.toFixed(6)}`),
      scientificName: latin,
      commonName: common || undefined,
      lng,
      lat,
      raw: r
    };
  }
};

runImport(config).catch((err) => {
  console.error('Montréal trees import failed:', err);
  process.exit(1);
});
