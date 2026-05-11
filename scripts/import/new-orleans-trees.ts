// City of New Orleans — NOLA TreeInventory (Parks & Parkways). ~107k
// trees published on ArcGIS Online (owner=StPsG80YRtvnlCJ8, City of
// New Orleans).
//
// Source page: https://nola.gov/parks-and-parkways/
// REST API:    services6.arcgis.com/.../NOLA_TreeInventory/FeatureServer/0
// License:     City of New Orleans Open Data (permissive, attribution)
// Refresh:     2026-05-10 verified count = 106,820
//
// Schema notes: BOTANICAL is the Latin binomial ("Taxodium distichum"),
// COMMON is the common name ("Bald Cypress"). TREE_ID is stable.
// LAT/LONG attribute fields agree with geometry coordinates — we
// prefer geometry per the project convention.
//
// Run: npm run import:new-orleans-trees
// Pre-req: a 'New Orleans public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'new-orleans-tree-inventory';
const LAYER_URL =
  'https://services6.arcgis.com/StPsG80YRtvnlCJ8/arcgis/rest/services/NOLA_TreeInventory/FeatureServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'New Orleans public';

interface NolaFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    OBJECTID_1?: number;
    TREE_ID?: string;
    COMMON?: string;
    BOTANICAL?: string;
    LAT?: number;
    LONG?: number;
  };
}

/** New Orleans metro bbox (~30km around city center). NOLA proper
 *  sits around 29.95 N, -90.07 W; bbox covers Algiers + East NO. */
function inNolaBbox(lng: number, lat: number): boolean {
  return lat >= 29.80 && lat <= 30.20 && lng >= -90.30 && lng <= -89.70;
}

const config: ImportConfig<NolaFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'New Orleans Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of New Orleans Parks & Parkways tree inventory (~107k ' +
    'trees) with full Latin binomial (BOTANICAL) and common name ' +
    '(COMMON). City of New Orleans Open Data (permissive, attribution).',
  regionName: REGION_NAME,
  license: 'City of New Orleans Open Data',
  async fetchAll() {
    const raw = (await fetchArcGisLayer({
      url: ENDPOINT,
      where: "BOTANICAL IS NOT NULL AND BOTANICAL <> ''"
    })) as NolaFeature[];
    // De-dup by TREE_ID: a handful of rows share the same TREE_ID in
    // the back half of the dataset. Keep the first occurrence so the
    // batch-level ON CONFLICT upsert never collides.
    const seen = new Set<string>();
    const deduped: NolaFeature[] = [];
    for (const f of raw) {
      const key = String(
        f.properties?.TREE_ID ??
          f.properties?.OBJECTID ??
          `${f.geometry?.coordinates?.[0]?.toFixed?.(6) ?? 'x'},${f.geometry?.coordinates?.[1]?.toFixed?.(6) ?? 'y'}`
      );
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(f);
    }
    if (deduped.length !== raw.length) {
      console.log(`  de-duplicated ${raw.length - deduped.length} TREE_ID collisions`);
    }
    return deduped;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0] ?? f.properties?.LONG);
    const lat = Number(c?.[1] ?? f.properties?.LAT);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inNolaBbox(lng, lat)) return null;
    const latin = f.properties?.BOTANICAL?.trim();
    if (!latin) return null;
    const common = f.properties?.COMMON?.trim() || undefined;
    return {
      // TREE_ID is the human-readable stable id from the source —
      // mostly unique but contains a small handful of duplicates in
      // the back half of the dataset. We de-dup matched rows in
      // fetchAll() (Map keyed by TREE_ID) so the ON CONFLICT batch
      // never sees a collision. Losing the ~few duplicate-TREE_ID
      // rows is acceptable; the canonical (region, source, TREE_ID)
      // tuple stays stable for idempotent re-runs.
      externalId: String(
        f.properties?.TREE_ID ??
          f.properties?.OBJECTID ??
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
  console.error('New Orleans trees import failed:', err);
  process.exit(1);
});
