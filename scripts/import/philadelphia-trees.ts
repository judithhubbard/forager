// City of Philadelphia — Parks & Recreation tree inventory (PPR
// 2025 vintage). Hosted on the Philly maps.phl.data ArcGIS Online
// instance.
//
// Source: https://opendataphilly.org/datasets/philadelphia-tree-inventory/
// REST API: services.arcgis.com/fLeGjb7u4uXqeF9q/.../ppr_tree_inventory_2025/FeatureServer/0/query
// License: City of Philadelphia Open Data Terms (permissive).
//
// ~125k street trees citywide. Fills zone 7a hole in current public coverage.
//
// Quirks: species is encoded in a single `tree_name` field as
// "LATIN - COMMON" (e.g. "ACER PALMATUM - JAPANESE MAPLE"). Splits
// on " - " in mapFeature.
//
// Run: npm run import:philadelphia-trees
// Pre-req: a 'Philadelphia public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'philly-ppr-trees';
const ENDPOINT =
  'https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/ppr_tree_inventory_2025/FeatureServer/0/query';
const REGION_NAME = 'Philadelphia public';

interface ArcGisFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    objectid?: number;
    tree_name?: string;   // "LATIN - COMMON"
  };
}

function splitTreeName(s: string | undefined): { latin?: string; common?: string } {
  if (!s) return {};
  const idx = s.indexOf(' - ');
  if (idx < 0) return { latin: s.trim() };
  return { latin: s.slice(0, idx).trim(), common: s.slice(idx + 3).trim() };
}

const config: ImportConfig<ArcGisFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Philadelphia PPR Trees (2025)',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of Philadelphia Parks & Recreation tree inventory, 2025 vintage. ' +
    'Permissive City of Philadelphia Open Data terms. Species encoded as ' +
    '"LATIN - COMMON" in a single tree_name field.',
  regionName: REGION_NAME,
  license: 'City of Philadelphia Open Data Terms',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      // Drop UNKNOWN rows server-side. Sampling shows ~5% are
      // "UNKNOWN UNKNOWN - UNKNOWN" — un-IDable, no point in
      // bandwidth or matcher time.
      where: "tree_name IS NOT NULL AND tree_name NOT LIKE 'UNKNOWN%'"
    }) as Promise<ArcGisFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const lng = Number(f.geometry?.coordinates?.[0]);
    const lat = Number(f.geometry?.coordinates?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    const { latin, common } = splitTreeName(f.properties?.tree_name);
    if (!latin) return null;
    return {
      externalId: String(f.properties?.objectid ?? `${lng.toFixed(6)},${lat.toFixed(6)}`),
      scientificName: latin,
      commonName: common,
      lng,
      lat,
      raw: f
    };
  }
};

runImport(config).catch((err) => {
  console.error('Philadelphia trees import failed:', err);
  process.exit(1);
});
