// City of Houston — Houston Parks & Recreation Urban Forestry tree
// inventory (HPARD). ~275k trees published on ArcGIS Online (owner
// e127618_MyCity, Houston MyCity / Public Works).
//
// Source page: https://www.houstontx.gov/parks/
// REST API:    services.arcgis.com/NummVBqZSIJKUeVR/.../COH_UrbanForestry_Trees_VIEW_ONLY/FeatureServer/0
// License:     City of Houston open data (permissive, attribution)
// Refresh:     2026-05-10 verified count = 275,648
//
// Schema notes: source has NO Latin binomial — SPECIES field holds a
// natural-language common name in "common, modifier" form ("Raintree,
// Golden", "Oak, Live", "Crape Myrtle"). Some entries are bare common
// names with no comma. Like Raleigh we reorder around the comma so
// matchSpecies's common-name path can fire ("Live Oak" → matches
// our catalog).
//
// Run: npm run import:houston-trees
// Pre-req: a 'Houston public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'houston-hpard-trees';
const LAYER_URL =
  'https://services.arcgis.com/NummVBqZSIJKUeVR/arcgis/rest/services/COH_UrbanForestry_Trees_VIEW_ONLY/FeatureServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Houston public';

interface HouFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    SPECIES?: string;
    CONDITION?: string;
    DIAMETER?: string;
    LOCATION?: string;
    ADDRESS?: string;
    STREET_NAM?: string;
    STATUS?: string;
  };
}

/** Houston metro bbox (~30km around city center). City sits around
 *  29.76 N, -95.37 W. Wide enough for outlying neighborhoods and the
 *  airport corridor; tight enough to exclude stray-geometry rows in
 *  the Gulf or out of state. */
function inHoustonBbox(lng: number, lat: number): boolean {
  return lat >= 29.50 && lat <= 30.11 && lng >= -95.78 && lng <= -95.06;
}

/** Reorder "ash, white" → "white ash" so the common-name path matches
 *  our catalog (which stores natural-order common names). matchSpecies
 *  normalises case internally. */
function reorderCommon(name: string): string {
  const idx = name.indexOf(',');
  if (idx < 0) return name.trim();
  const head = name.slice(0, idx).trim();
  const tail = name.slice(idx + 1).trim();
  if (!tail) return head;
  return `${tail} ${head}`;
}

const config: ImportConfig<HouFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Houston HPARD Urban Forestry Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of Houston Parks & Recreation Department (HPARD) Urban ' +
    'Forestry tree inventory (~275k trees). Source publishes only ' +
    'SPECIES (common, modifier form — "Raintree, Golden") with no Latin ' +
    'binomial; we reorder around the comma so common-name matching ' +
    'fires. City of Houston open data (permissive, attribution).',
  regionName: REGION_NAME,
  license: 'City of Houston open data',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      where: "SPECIES IS NOT NULL AND SPECIES <> ''"
    }) as Promise<HouFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inHoustonBbox(lng, lat)) return null;
    const raw = f.properties?.SPECIES?.trim();
    if (!raw) return null;
    const common = reorderCommon(raw);
    if (!common) return null;
    return {
      // OBJECTID is the only field guaranteed unique on this layer.
      externalId: String(
        f.properties?.OBJECTID ??
          `${lng.toFixed(6)},${lat.toFixed(6)}`
      ),
      // No Latin binomial in the source — common name is all we have.
      commonName: common,
      lng,
      lat,
      raw: f as unknown as Record<string, unknown>
    };
  }
};

runImport(config).catch((err) => {
  console.error('Houston trees import failed:', err);
  process.exit(1);
});
