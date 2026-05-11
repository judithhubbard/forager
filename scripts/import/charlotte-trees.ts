// City of Charlotte — Landscape Management (LSM) tree inventory.
// ~192k trees published on Charlotte's own ArcGIS Server (not AGOL).
// Owner=CharlotteNC, snippet: "Landscape Management Active trees
// replicated from AMS." This is the per-tree city street + park
// inventory; canopy raster + ordinance permit polygons are separate
// layers we ignore.
//
// Source page: https://data.charlottenc.gov/
// REST API:    gis.charlottenc.gov/arcgis/rest/services/ENG/LSM_Trees/MapServer/0
// License:     City of Charlotte open data (permissive, attribution)
// Refresh:     2026-05-10 verified count = 191,909
//
// Schema notes: simple schema — Tree_ID, Common (e.g. "OAK: WILLOW"),
// DBH, Active, Location (street address). No Latin binomial. Common
// is stored in modifier-first form, with either a colon ("OAK:
// WILLOW") or a plain space ("OAK WILLOW", "CRAPEMYRTLE SPP")
// separator — we normalise, reorder, and (for "SPP") translate to
// "species" so matchSpecies's genus-fallback path fires.
//
// Note: this is a MapServer endpoint, not FeatureServer. The framework's
// fetchArcGisLayer handles both — the only difference is where the
// exceededTransferLimit flag lives (top-level vs nested in
// `properties`), and the helper already checks both.
//
// Run: npm run import:charlotte-trees
// Pre-req: a 'Charlotte public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'charlotte-lsm-trees';
const LAYER_URL =
  'https://gis.charlottenc.gov/arcgis/rest/services/ENG/LSM_Trees/MapServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Charlotte public';

interface ChaFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    Tree_ID?: number;
    Common?: string;
    DBH?: number;
    Active?: number;
    Location?: string;
  };
}

/** Charlotte metro bbox (~30km around city center). City sits around
 *  35.23 N, -80.84 W. */
function inCharlotteBbox(lng: number, lat: number): boolean {
  return lat >= 35.05 && lat <= 35.45 && lng >= -81.00 && lng <= -80.55;
}

/** Charlotte stores common names with modifier-first ordering and
 *  either a colon or a plain space separator: "OAK: WILLOW", "OAK
 *  WILLOW", "MAGNOLIA: SOUTHERN". The trailing "SPP" / "SPP." means
 *  "any species in this genus" — too vague to match meaningfully
 *  against our forageable catalog (we'd pick a random species in the
 *  genus), so we drop those entries entirely.
 *
 *  Returns "" for skip-this-row sentinels.
 */
function reorderModifierFirst(name: string): string {
  // Normalise separator: "oak: willow" → "oak willow".
  let s = name.trim().toLowerCase().replace(/:/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  if (!s) return '';

  const parts = s.split(' ');
  // "OAK SPP" / "HOLLY SPP." — vague-genus markers, skip.
  if (parts.length >= 2 && (parts[parts.length - 1] === 'spp' || parts[parts.length - 1] === 'spp.')) {
    return '';
  }
  // "CHERRY/PLUM/PEACH SPP" caught above; "FIRE/CHIMNEY/SHORTLEAF"-
  // style slashes are also too vague to match — skip.
  if (s.includes('/')) return '';

  // Heuristic: if first word is a known genus-style English common
  // name and we have exactly 2 words, swap to natural English order.
  const genusFirst = new Set([
    'oak', 'maple', 'magnolia', 'elm', 'ash', 'pine', 'cherry',
    'hickory', 'birch', 'holly', 'cedar', 'cypress', 'dogwood',
    'gum', 'locust', 'mulberry', 'pecan', 'poplar', 'sycamore',
    'willow', 'walnut', 'redbud', 'sweetgum', 'spruce', 'fir',
    'apple', 'plum', 'peach', 'pear', 'beech', 'cottonwood',
    'crabapple', 'elderberry', 'fringetree', 'hackberry',
    'hawthorn', 'hornbeam', 'mimosa', 'persimmon', 'redcedar',
    'tuliptree', 'arborvitae', 'crapemyrtle'
  ]);
  if (parts.length === 2 && genusFirst.has(parts[0])) {
    return `${parts[1]} ${parts[0]}`;
  }
  return s;
}

const config: ImportConfig<ChaFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Charlotte LSM Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of Charlotte Landscape Management (LSM) tree inventory ' +
    '(~192k trees, replicated from AMS). Source publishes only a ' +
    'Common-name field in modifier-first form ("OAK WILLOW"); we ' +
    'reorder to natural English order before common-name matching. ' +
    'City of Charlotte open data (permissive, attribution).',
  regionName: REGION_NAME,
  license: 'City of Charlotte open data',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      where: "Common IS NOT NULL AND Common <> ''"
    }) as Promise<ChaFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inCharlotteBbox(lng, lat)) return null;
    const raw = f.properties?.Common?.trim();
    if (!raw) return null;
    const common = reorderModifierFirst(raw);
    if (!common) return null;
    return {
      // OBJECTID is the only guaranteed-unique field. Tree_ID is
      // Charlotte's internal numbering but may repeat across active /
      // inactive records.
      externalId: String(
        f.properties?.OBJECTID ??
          f.properties?.Tree_ID ??
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
  console.error('Charlotte trees import failed:', err);
  process.exit(1);
});
