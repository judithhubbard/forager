// City of Buffalo — "Tree Inventory" dataset on OpenData Buffalo.
//
// Source page: https://data.buffalony.gov/Quality-of-Life/Tree-Inventory/n4ni-uuec
// API:         https://data.buffalony.gov/resource/n4ni-uuec.json (Socrata)
// License:     Public Domain US Gov't (per the dataset's `rights`
//              field; attribution = "Department of Public Works,
//              Parks & Streets").
//
// Verified count (2026-05-10): 133,277 rows including ~13k VACANT
// planting sites which we filter at the SoQL layer. Schema is
// excellent: `botanical_name` (Latin), `common_name`, `latitude`,
// `longitude`, `address`, `street`, `council_district`, `site_id`
// (stable OID), plus an `ecosystem benefits` block (CO2 saved,
// stormwater gallons, kWh saved) we preserve in import_raw.
//
// This is the FEMC-private 58,105-row stub *grown* to 133k. Bureau
// of Forestry has been re-inventorying since 2018.
//
// Climate-zone significance: first dense Buffalo / Niagara
// lake-effect zone-6a/6b city, calibration-relevant for sour cherry,
// hawthorn, and serviceberry fruiting DOY.
//
// Run: npm run import:buffalo-trees
// Pre-req: a 'Buffalo public' region row.

import { fetchOpenDataApiJson, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'buffalo-tree-inventory';
const API_URL = 'https://data.buffalony.gov/resource/n4ni-uuec.json';
const REGION_NAME = 'Buffalo public';

interface BufRow extends Record<string, unknown> {
  site_id?: string;
  botanical_name?: string;     // Latin binomial, or "VACANT"
  common_name?: string;        // English common name
  latitude?: string;           // Socrata returns numbers as strings
  longitude?: string;
  dbh?: string;
  address?: string;
  street?: string;
  council_district?: string;
  park_name?: string;
}

const config: ImportConfig<BufRow> = {
  sourceId: SOURCE_ID,
  sourceName: 'Buffalo Tree Inventory',
  sourceUrl: 'https://data.buffalony.gov/Quality-of-Life/Tree-Inventory/n4ni-uuec',
  sourceDescription:
    'City of Buffalo Bureau of Forestry public tree inventory ' +
    '(~133k records citywide, hosted on Socrata). Public Domain ' +
    "US Gov't license per dataset metadata. Includes ecosystem-" +
    'benefit estimates (CO2, stormwater, energy) preserved in ' +
    'import_raw. First dense Great-Lakes lake-effect zone-6a city ' +
    'in the public tier.',
  regionName: REGION_NAME,
  license: 'Public Domain (US Government Works)',
  async fetchAll() {
    return fetchOpenDataApiJson({
      url: API_URL,
      // Filter at the API layer: skip VACANT and STUMP rows.
      // SoQL is case-sensitive on string literals.
      where: "botanical_name IS NOT NULL AND botanical_name <> 'VACANT' AND botanical_name <> 'STUMP'"
    }) as Promise<BufRow[]>;
  },
  mapFeature(r): ImportRecord | null {
    const lat = Number(r.latitude);
    const lng = Number(r.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    // Buffalo proper sits ~42.83–43.0N, -78.92 – -78.78W. Allow a
    // small margin for South Buffalo and the Niagara River edge.
    if (lat < 42.7 || lat > 43.1 || lng < -79.1 || lng > -78.6) return null;

    const latin = (r.botanical_name ?? '').toString().trim();
    if (!latin || latin === 'VACANT' || latin === 'STUMP') return null;

    const common = (r.common_name ?? '').toString().trim();

    return {
      externalId: String(r.site_id ?? `${lng.toFixed(6)},${lat.toFixed(6)}`),
      scientificName: latin,
      commonName: common || undefined,
      lng,
      lat,
      raw: r
    };
  }
};

runImport(config).catch((err) => {
  console.error('Buffalo trees import failed:', err);
  process.exit(1);
});
