// Ames (IA) city tree inventory — owned by City of Ames (Iowa State
// University town). Iowa DNR state aggregator only has ~540 pins
// inside Ames (vs. ~62k pop, ~3.1k expected); the city maintains its
// own ~23k inventory served from gis.cityofames.org.
//
// Source page: https://www.cityofames.org/government/departments-divisions-i-z/public-works/forestry
// REST API:    gis.cityofames.org/arcgis/rest/services/ames_basemap_ALL_read_only_V2/MapServer/76
// License:     City of Ames open data (permissive, attribution)
// Refresh:     2026-05-10 verified count = 23,064
//
// Schema notes: source stores only SPCODE (5-char code like ACRU,
// FRPE) — same coded-value scheme as the Iowa DNR aggregator. We
// fetch the SPCODE coded-value domain at startup and translate to a
// common name at map time, like ia-trees.ts. Coordinates confirmed
// inside Ames bbox (~42.03 N, -93.62 W). The source layer is a
// MapServer (not FeatureServer); fetchArcGisLayer handles both.
//
// Run: npm run import:ames-trees
// Pre-req: an 'Ames public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'ames-tree-inventory';
const LAYER_URL =
  'https://gis.cityofames.org/arcgis/rest/services/ames_basemap_ALL_read_only_V2/MapServer/76';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Ames public';

interface AmesFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    TREEID?: number;
    SPCODE?: string;
    DBH?: number;
    LAT?: number;
    LONG?: number;
    TreeRemoved?: string; // 'Yes' / 'No'
  };
}

/** Ames metro bbox (~15km around city center, 42.03 N, -93.62 W). */
function inAmesBbox(lng: number, lat: number): boolean {
  return lat >= 41.92 && lat <= 42.15 && lng >= -93.80 && lng <= -93.45;
}

/** Fetch SPCODE → common-name coded-value domain. Memoised. The Ames
 *  SPCODE scheme overlaps the Iowa DNR one but is hosted on the city
 *  ArcGIS server, so the domain comes from this layer. */
let spCodeMap: Map<string, string> | null = null;
async function loadSpCodeMap(): Promise<Map<string, string>> {
  if (spCodeMap) return spCodeMap;
  const res = await fetch(`${LAYER_URL}?f=json`);
  if (!res.ok) throw new Error(`Ames layer-description fetch ${res.status}`);
  const body = (await res.json()) as {
    fields?: Array<{
      name?: string;
      domain?: { codedValues?: Array<{ code?: string; name?: string }> };
    }>;
  };
  const field = body.fields?.find((f) => f.name === 'SPCODE');
  const cvs = field?.domain?.codedValues ?? [];
  const m = new Map<string, string>();
  for (const cv of cvs) {
    if (cv.code && cv.name) m.set(cv.code, cv.name);
  }
  if (m.size === 0) {
    throw new Error('Ames SPCODE domain came back empty — schema changed?');
  }
  spCodeMap = m;
  return m;
}

const config: ImportConfig<AmesFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Ames Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of Ames tree inventory (~23k trees) covering ROW and ' +
    'park trees. SPCODE-only source (same coded-value scheme as ' +
    'the Iowa DNR aggregator); resolved to common names via the ' +
    'layer\'s field domain. City of Ames open data (permissive, ' +
    'attribution).',
  regionName: REGION_NAME,
  license: 'City of Ames open data',
  async fetchAll() {
    await loadSpCodeMap();
    // Filter out removed trees and AVPS* placeholders server-side.
    return fetchArcGisLayer({
      url: ENDPOINT,
      where:
        "SPCODE IS NOT NULL AND SPCODE NOT IN ('AVPSL','AVPSM','AVPSS','UNKNOWN') AND (TreeRemoved IS NULL OR TreeRemoved <> 'Yes')"
    }) as Promise<AmesFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0] ?? f.properties?.LONG);
    const lat = Number(c?.[1] ?? f.properties?.LAT);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inAmesBbox(lng, lat)) return null;
    const code = f.properties?.SPCODE?.trim();
    if (!code) return null;
    const common = spCodeMap?.get(code);
    if (!common) return null;
    return {
      externalId: String(
        f.properties?.TREEID ?? f.properties?.OBJECTID ?? `${lng.toFixed(6)},${lat.toFixed(6)}`
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
  console.error('Ames trees import failed:', err);
  process.exit(1);
});
