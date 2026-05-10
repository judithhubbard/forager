// Utah FFSL Urban Tree Inventory — STATE-LEVEL aggregator covering
// 248 Utah communities. Utah Forestry, Fire & State Lands maintains
// a single pooled inventory on a public ArcGIS Feature Service.
//
// Source page: https://ffsl.utah.gov/forestry/urban-and-community-forestry/utah-communities-urban-tree-inventory/
// REST API:    services.arcgis.com/.../UrbanTreeInventory/FeatureServer/0
// License:     Utah State Open Data (permissive; attribution to UT FFSL)
//
// ~99k trees across all participating UT communities (Salt Lake,
// Provo, Ogden, Logan, St. George, etc.). Fills intermountain west
// zone 5-7 gap. Single ingest replaces ~250 individual city scrapes.
//
// Schema: Species (Latin binomial as one string) + LAT/LON (WGS84
// attribute fields) + ESRIgenus + Community. Geometry projection is
// 26912 (UTM zone 12N NAD83); we use the attribute LAT/LON instead.
// The `removed` flag marks trees that have been physically removed —
// filter those out.
//
// Run: npm run import:utah-trees
// Pre-req: a 'Utah public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'ut-ffsl-urban-tree-inventory';
const ENDPOINT =
  'https://services.arcgis.com/ZzrwjTRez6FJiOq4/arcgis/rest/services/UrbanTreeInventory/FeatureServer/0/query';
const REGION_NAME = 'Utah public';

interface UtFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    GlobalID?: string;
    Species?: string;
    ESRIgenus?: string;
    Community?: string;
    LAT?: number;
    LON?: number;
    removed?: string;
  };
}

const config: ImportConfig<UtFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Utah FFSL Urban Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'Utah Forestry, Fire & State Lands urban tree inventory — pooled ' +
    'across 248 UT communities (~99k trees). Single state-level ' +
    'aggregator feed. Utah State Open Data terms.',
  regionName: REGION_NAME,
  license: 'Utah State Open Data',
  async fetchAll() {
    // Filter out removed trees server-side.
    return fetchArcGisLayer({
      url: ENDPOINT,
      where: "Species IS NOT NULL AND (removed IS NULL OR removed <> 'Yes')"
    }) as Promise<UtFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const lng = Number(f.properties?.LON);
    const lat = Number(f.properties?.LAT);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    const latin = f.properties?.Species?.trim();
    if (!latin) return null;
    return {
      externalId: String(f.properties?.OBJECTID ?? f.properties?.GlobalID ?? `${lng.toFixed(6)},${lat.toFixed(6)}`),
      scientificName: latin,
      lng,
      lat,
      raw: f as unknown as Record<string, unknown>
    };
  }
};

runImport(config).catch((err) => {
  console.error('Utah trees import failed:', err);
  process.exit(1);
});
