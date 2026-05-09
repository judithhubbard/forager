// Cambridge MA Street Tree Map — federated city + DCR + Harvard +
// MIT trees in one Socrata dataset (the city literally aggregates
// the surrounding institutional inventories into one map).
//
// Source: https://data.cambridgema.gov/Public-Works/Street-Trees/82zb-7qc9
// API:    Socrata
// License: City of Cambridge open data terms (permissive)
//
// Run with:
//   npm run import:cambridge-trees
//
// Requires a 'Cambridge public' region row before running.

import {
  fetchOpenDataApiJson,
  runImport,
  type ImportConfig
} from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'cambridge-street-trees';
const ENDPOINT = 'https://data.cambridgema.gov/resource/82zb-7qc9.json';
const REGION_NAME = 'Cambridge public';

interface SocrataRow extends Record<string, unknown> {
  treeid?: string;
  the_geom?: { type?: 'Point'; coordinates?: [number, number] };
  scientific?: string;
  commonname?: string;
  genus?: string;
  species?: string;
  speciessho?: string;
  ownership?: string;
  sitetype?: string;
}

const config: ImportConfig<SocrataRow> = {
  sourceId: SOURCE_ID,
  sourceName: 'Cambridge MA Street Trees (federated)',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'Cambridge MA street tree map: trees and planting sites owned, ' +
    'planted, or maintained by City of Cambridge, Mass. DCR, MIT, ' +
    'Harvard University. Single Socrata dataset federates all four.',
  regionName: REGION_NAME,
  license: 'City of Cambridge Open Data',
  async fetchAll() {
    return fetchOpenDataApiJson({
      url: ENDPOINT,
      // Filter at the API tier: skip retired sites + rows with no
      // scientific name. Socrata $where is field-name-sensitive.
      where: "scientific IS NOT NULL AND sitetype != 'Retired'"
    }) as Promise<SocrataRow[]>;
  },
  mapFeature(r): ImportRecord | null {
    const coords = r.the_geom?.coordinates;
    const lng = Number(coords?.[0]);
    const lat = Number(coords?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    const sci = r.scientific
      ?? (r.genus && r.species ? `${r.genus} ${r.species}` : undefined);
    if (!sci) return null;
    return {
      externalId: r.treeid ? String(r.treeid) : `${lng.toFixed(6)},${lat.toFixed(6)}`,
      scientificName: sci,
      commonName: r.commonname,
      lng,
      lat,
      raw: r
    };
  }
};

runImport(config).catch((err) => {
  console.error('Cambridge trees import failed:', err);
  process.exit(1);
});
