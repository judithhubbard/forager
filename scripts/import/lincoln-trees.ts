// City of Lincoln, NE — Parks/Trees MapServer. ~145k trees including
// street + park trees, served from the City's public ArcGIS Server
// (gis.lincoln.ne.gov; no token).
//
// Source page: https://lincoln.ne.gov/city/parks/
// REST API:    gis.lincoln.ne.gov/public/rest/services/Parks/Trees/MapServer/0
// License:     City of Lincoln public data (permissive, attribution)
// Refresh:     2026-05-10 verified count = 144,918
//
// Schema notes: ScientificName has the full binomial (often with
// cultivar appended, e.g. "Fraxinus pennsylvanica 'Patmore'"). The
// framework's normalizeSpeciesName() strips quoted cultivars before
// matching. CommonName is rich ("Patmore Ash"), iTreeCode is a
// 6-char code. Default ArcGIS output strips most fields — framework
// passes outFields=* so we get the full record.
//
// Run: npm run import:lincoln-trees
// Pre-req: a 'Lincoln public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'lincoln-parks-trees';
const LAYER_URL =
  'https://gis.lincoln.ne.gov/public/rest/services/Parks/Trees/MapServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Lincoln public';

interface LinFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    GlobalID?: string;
    TreeID?: string;
    TreeType?: string;
    CommonName?: string;
    ScientificName?: string;
    iTreeCode?: string;
    DBH?: number;
    SiteLocation?: string;
    LifeCycle?: string;
    Address?: string;
  };
}

/** Lincoln NE metro bbox (~30km around city center). Lincoln sits
 *  around 40.81 N, -96.70 W. */
function inLincolnBbox(lng: number, lat: number): boolean {
  return lat >= 40.60 && lat <= 41.05 && lng >= -97.00 && lng <= -96.40;
}

const config: ImportConfig<LinFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Lincoln NE Parks/Trees Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of Lincoln, NE Parks/Trees inventory (~145k trees, street + ' +
    'park) with full Latin binomial (ScientificName), common name, ' +
    'iTreeCode, DBH. Served from the City\'s public ArcGIS Server. ' +
    'City of Lincoln public data (permissive, attribution).',
  regionName: REGION_NAME,
  license: 'City of Lincoln public data',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      where:
        "ScientificName IS NOT NULL AND ScientificName <> '' AND " +
        "(LifeCycle IS NULL OR LifeCycle <> 'Removed')",
      // Lincoln's MapServer caps at 2000 rows/page.
      pageSize: 2000
    }) as Promise<LinFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inLincolnBbox(lng, lat)) return null;
    const latin = f.properties?.ScientificName?.trim();
    if (!latin) return null;
    const common = f.properties?.CommonName?.trim() || undefined;
    return {
      // OBJECTID first — TreeID has a small number of legitimate
      // duplicates in this layer (~3 per 2000 rows) which would
      // collide on ON CONFLICT DO UPDATE within a single batch.
      externalId: String(
        f.properties?.OBJECTID ??
          f.properties?.GlobalID ??
          f.properties?.TreeID ??
          `${lng.toFixed(6)},${lat.toFixed(6)}`
      ),
      scientificName: latin,
      commonName: common,
      lng,
      lat,
      raw: f as unknown as Record<string, unknown>
    };
  }
};

runImport(config).catch((err) => {
  console.error('Lincoln trees import failed:', err);
  process.exit(1);
});
