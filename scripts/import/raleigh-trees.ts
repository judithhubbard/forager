// City of Raleigh — Parks, Recreation & Cultural Resources (PRCR)
// Urban Forestry Tree Inventory. ~207k trees published on ArcGIS
// Online (owner v400IkDOw1ad7Yad = City of Raleigh).
//
// Source page: https://data-ral.opendata.arcgis.com/
// REST API:    services.arcgis.com/v400IkDOw1ad7Yad/.../PRCR_Urban_Forestry_Trees_Open_Data/FeatureServer/0
// License:     City of Raleigh Open Data (permissive, attribution)
// Refresh:     2026-05-10 verified count = 207,491
//
// Schema notes: source has NO Latin binomial — only a 4-5 char
// SPP_CODE ("ULAM", "ACRU") whose coded-value domain maps to a common
// name in "common, modifier" form (e.g. "apple, paradise", "ash, white").
// We fetch the SPP_CODE domain like ia-trees.ts and feed the resolved
// common name into matchSpecies's common-name path. The domain entries
// use comma-modifier ordering; matchSpecies handles whitespace/case
// normalization so e.g. "ash, white" matches our "White ash" species.
//
// Run: npm run import:raleigh-trees
// Pre-req: a 'Raleigh public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'raleigh-prcr-trees';
const LAYER_URL =
  'https://services.arcgis.com/v400IkDOw1ad7Yad/arcgis/rest/services/PRCR_Urban_Forestry_Trees_Open_Data/FeatureServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Raleigh public';

interface RalFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    STREET?: string;
    SPP_CODE?: string;
    DIAMETER?: number;
    GlobalID?: string;
    PARKID?: string;
  };
}

/** Raleigh metro bbox (~30km around city center). Filters (0,0) and
 *  any stray bogus coords without losing legitimate city points. */
function inRaleighBbox(lng: number, lat: number): boolean {
  return lat >= 35.55 && lat <= 36.05 && lng >= -78.95 && lng <= -78.35;
}

/** Convert "ash, white" → "white ash" so common-name matching has a
 *  fair shot at our species catalog (which stores natural-order
 *  common names like "White ash"). matchSpecies normalizes case
 *  internally, so we just reorder around the comma. */
function reorderCommon(name: string): string {
  const idx = name.indexOf(',');
  if (idx < 0) return name.trim();
  const head = name.slice(0, idx).trim();
  const tail = name.slice(idx + 1).trim();
  if (!tail) return head;
  return `${tail} ${head}`;
}

/** Fetch SPP_CODE → common-name coded-value domain. Memoised. */
let sppCodeMap: Map<string, string> | null = null;
async function loadSppCodeMap(): Promise<Map<string, string>> {
  if (sppCodeMap) return sppCodeMap;
  const res = await fetch(`${LAYER_URL}?f=json`);
  if (!res.ok) throw new Error(`Raleigh layer-description fetch ${res.status}`);
  const body = (await res.json()) as {
    fields?: Array<{
      name?: string;
      domain?: { codedValues?: Array<{ code?: string; name?: string }> };
    }>;
  };
  const field = body.fields?.find((f) => f.name === 'SPP_CODE');
  const cvs = field?.domain?.codedValues ?? [];
  const m = new Map<string, string>();
  for (const cv of cvs) {
    if (cv.code && cv.name) m.set(cv.code, reorderCommon(cv.name));
  }
  if (m.size === 0) {
    throw new Error('Raleigh SPP_CODE domain came back empty — schema changed?');
  }
  sppCodeMap = m;
  return m;
}

const config: ImportConfig<RalFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Raleigh PRCR Urban Forestry Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of Raleigh Parks, Recreation & Cultural Resources Urban ' +
    'Forestry tree inventory (~207k trees). Source publishes only ' +
    'SPP_CODE (no Latin binomial); we translate via the layer\'s ' +
    'coded-value domain into common names. City of Raleigh Open Data.',
  regionName: REGION_NAME,
  license: 'City of Raleigh Open Data',
  async fetchAll() {
    await loadSppCodeMap();
    return fetchArcGisLayer({
      url: ENDPOINT,
      where: "SPP_CODE IS NOT NULL AND SPP_CODE <> ''"
    }) as Promise<RalFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inRaleighBbox(lng, lat)) return null;
    const code = f.properties?.SPP_CODE?.trim();
    if (!code) return null;
    const common = sppCodeMap?.get(code);
    if (!common) return null;
    return {
      externalId: String(
        f.properties?.OBJECTID ??
          f.properties?.GlobalID ??
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
  console.error('Raleigh trees import failed:', err);
  process.exit(1);
});
