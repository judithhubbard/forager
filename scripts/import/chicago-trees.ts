// Chicago tree inventory — Department of Streets & Sanitation
// keeps a public dataset on the Chicago Data Portal (Socrata).
//
// Source: https://data.cityofchicago.org/Environment-Sustainable-Development/Tree-Inventory/8dyy-fbzx
// License: public domain (Chicago Data Portal TOS).
//
// Run with:
//   npm run import:chicago-trees

import {
  fetchOpenDataApiJson,
  runImport,
  type ImportConfig
} from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'chicago-trees';
const ENDPOINT = 'https://data.cityofchicago.org/resource/8dyy-fbzx.json';
const REGION_NAME = 'Chicago public';

interface ChicagoTree {
  inventory_id?: string;
  scientific_name?: string;
  common_name?: string;
  condition?: string;
  latitude?: string;
  longitude?: string;
  location?: { coordinates?: [number, number] };
}

const config: ImportConfig<ChicagoTree> = {
  sourceId: SOURCE_ID,
  sourceName: 'Chicago Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of Chicago Department of Streets & Sanitation tree inventory. ' +
    'Public domain via Chicago Data Portal.',
  regionName: REGION_NAME,
  license: 'Chicago Data Portal TOS (public domain)',
  async fetchAll() {
    return fetchOpenDataApiJson({
      url: ENDPOINT,
      where: "scientific_name IS NOT NULL"
    }) as Promise<ChicagoTree[]>;
  },
  mapFeature(t): ImportRecord | null {
    const lng = t.location?.coordinates?.[0] ?? Number(t.longitude);
    const lat = t.location?.coordinates?.[1] ?? Number(t.latitude);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return {
      externalId: t.inventory_id ?? `${lng.toFixed(6)},${lat.toFixed(6)}`,
      scientificName: t.scientific_name,
      commonName: t.common_name,
      lng: Number(lng),
      lat: Number(lat),
      raw: t
    };
  }
};

runImport(config).catch((err) => {
  console.error('Chicago trees import failed:', err);
  process.exit(1);
});
