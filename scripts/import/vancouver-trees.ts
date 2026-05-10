// City of Vancouver BC — Public Trees inventory. Hosted on the
// Vancouver Open Data Opendatasoft portal.
//
// Source: https://opendata.vancouver.ca/explore/dataset/public-trees/
// REST API: opendata.vancouver.ca/api/explore/v2.1/catalog/datasets/public-trees/records
// License: Open Government License — Vancouver (permissive, attribution).
//
// ~186k trees citywide. Fills zone 8b/9a maritime PNW hole — pairs
// with Seattle and Portland for the Pacific NW coverage.
//
// Schema: separate genus_name + species_name + cultivar_name fields,
// plus common_name. Combine genus + species for Latin binomial.
// Drop "PLANTING SITE" rows where genus_name='PLANTING' (placeholders
// for vacant tree slots — no actual tree to forage from).
//
// Run: npm run import:vancouver-trees
// Pre-req: a 'Vancouver public' region row.

import { fetchOpendatasoftRecords, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'vancouver-public-trees';
const ENDPOINT = 'https://opendata.vancouver.ca/api/explore/v2.1/catalog/datasets/public-trees/records';
const REGION_NAME = 'Vancouver public';

interface VanRecord {
  asset_id?: number;
  common_name?: string;
  genus_name?: string;
  species_name?: string;
  cultivar_name?: string;
  geom?: { geometry?: { coordinates?: [number, number] } } | null;
  geo_point_2d?: { lon?: number; lat?: number } | null;
}

const config: ImportConfig<VanRecord> = {
  sourceId: SOURCE_ID,
  sourceName: 'Vancouver Public Trees',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of Vancouver BC public tree inventory (~186k trees). ' +
    'Open Government License — Vancouver. Genus + species fields ' +
    'separate; combined for Latin binomial in mapFeature.',
  regionName: REGION_NAME,
  license: 'Open Government License — Vancouver',
  async fetchAll() {
    // 186k rows; far past the anonymous 10k offset cap. Use cursor
    // pagination on asset_id (numeric, monotonic).
    return fetchOpendatasoftRecords({ url: ENDPOINT, cursorField: 'asset_id' }) as Promise<VanRecord[]>;
  },
  mapFeature(r): ImportRecord | null {
    const lng = r.geo_point_2d?.lon ?? r.geom?.geometry?.coordinates?.[0];
    const lat = r.geo_point_2d?.lat ?? r.geom?.geometry?.coordinates?.[1];
    if (!Number.isFinite(Number(lng)) || !Number.isFinite(Number(lat))) return null;
    const genus = (r.genus_name ?? '').trim();
    const species = (r.species_name ?? '').trim();
    if (!genus || genus === 'PLANTING') return null;  // vacant slots
    // Combine. e.g., "ACER" + "PLATANOIDES" → "Acer platanoides".
    // Lowercase the species half (specific epithet is always lowercase).
    const latin = species
      ? `${genus[0]}${genus.slice(1).toLowerCase()} ${species.toLowerCase()}`
      : `${genus[0]}${genus.slice(1).toLowerCase()}`;
    return {
      externalId: String(r.asset_id ?? `${Number(lng).toFixed(6)},${Number(lat).toFixed(6)}`),
      scientificName: latin,
      commonName: r.common_name,
      lng: Number(lng),
      lat: Number(lat),
      raw: r as unknown as Record<string, unknown>
    };
  }
};

runImport(config).catch((err) => {
  console.error('Vancouver trees import failed:', err);
  process.exit(1);
});
