// Iowa DNR Urban Tree Inventory — STATE-LEVEL aggregator. Owned by
// the Iowa Department of Natural Resources (Andy.Asell_iowadnr) on
// ArcGIS Online. ~336k trees across all participating IA
// municipalities — single ingest replaces dozens of city-level
// scrapes. Fills upper-Midwest zone 4b/5a/5b gap east of Wisconsin.
//
// Source page: https://www.iowadnr.gov/forestry (Urban & Community)
// REST API:    services2.arcgis.com/.../Iowa_DNR_Urban_Tree_Inventory_Public/FeatureServer/0
// License:     Iowa DNR public data (permissive, attribution to IA DNR)
// Refresh:     2026-05-10 verified count = 336,085
//
// Schema notes: the source ONLY stores a coded SPCODE field (5-char
// code like FRPE, ULAM, ACSA1). The layer's field metadata exposes a
// coded-value domain mapping each SPCODE to a common name
// ("FRPE" -> "Green ash", "ULAM" -> "American elm"). We fetch that
// domain at startup and translate SPCODE -> common name at map time;
// the species matcher handles the common-name match path. No latin
// binomial is published in the source.
//
// Run: npm run import:ia-trees
// Pre-req: an 'Iowa public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'ia-dnr-urban-tree-inventory';
const LAYER_URL =
  'https://services2.arcgis.com/r6iFVcMJeA4kB4GC/arcgis/rest/services/Iowa_DNR_Urban_Tree_Inventory_Public/FeatureServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Iowa public';

interface IaFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    TREEID?: number;
    SPCODE?: string;
    TOWN?: string;
    ESRIGNSS_LATITUDE?: number;
    ESRIGNSS_LONGITUDE?: number;
    Inventory_Status?: string;
  };
}

/** Iowa rough bbox sanity check (filters out (0,0) and stray bogus
 *  coordinates without losing any legitimate state points). */
function inIowaBbox(lng: number, lat: number): boolean {
  return lat >= 40.0 && lat <= 43.7 && lng >= -96.8 && lng <= -89.9;
}

/** Fetch the SPCODE → common-name coded-value domain from the layer's
 *  field metadata. Memoised so we hit the layer description once. */
let spCodeMap: Map<string, string> | null = null;
async function loadSpCodeMap(): Promise<Map<string, string>> {
  if (spCodeMap) return spCodeMap;
  const res = await fetch(`${LAYER_URL}?f=json`);
  if (!res.ok) throw new Error(`Iowa layer-description fetch ${res.status}`);
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
    throw new Error('Iowa SPCODE domain came back empty — schema changed?');
  }
  spCodeMap = m;
  return m;
}

const config: ImportConfig<IaFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Iowa DNR Urban Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'Iowa DNR Urban Tree Inventory — state-level aggregator across ' +
    'Iowa municipalities (~336k trees). Single ingest replaces ' +
    'dozens of city-level scrapes. Iowa DNR public data terms.',
  regionName: REGION_NAME,
  license: 'Iowa DNR public data',
  async fetchAll() {
    // Pre-load the SPCODE domain before we start streaming features so
    // every mapFeature() call can translate synchronously.
    await loadSpCodeMap();
    // Filter out coded "available planting site" placeholders and
    // category buckets server-side. AVPS{L,M,S} = empty planting site
    // (no tree); *_OTHER and UNKNOWN are non-species buckets.
    return fetchArcGisLayer({
      url: ENDPOINT,
      where:
        "SPCODE IS NOT NULL AND SPCODE NOT IN ('AVPSL','AVPSM','AVPSS','UNKNOWN','BDL OTHER','BDM OTHER','BDS OTHER','BEL OTHER','BEM OTHER','BES OTHER','CEL OTHER','CEM OTHER','CES OTHER')"
    }) as Promise<IaFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    // Prefer geometry coordinates (consistent WGS84) over the GNSS
    // attribute fields — both agree to 7 decimals but the geometry is
    // the canonical source.
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0] ?? f.properties?.ESRIGNSS_LONGITUDE);
    const lat = Number(c?.[1] ?? f.properties?.ESRIGNSS_LATITUDE);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inIowaBbox(lng, lat)) return null;
    const code = f.properties?.SPCODE?.trim();
    if (!code) return null;
    const common = spCodeMap?.get(code);
    if (!common) return null;
    return {
      externalId: String(f.properties?.TREEID ?? f.properties?.OBJECTID ?? `${lng.toFixed(6)},${lat.toFixed(6)}`),
      // No latin binomial in the source — common name is all we have.
      // matchSpecies's common-name path will resolve "Green ash" etc.
      commonName: common,
      lng,
      lat,
      raw: f as unknown as Record<string, unknown>
    };
  }
};

runImport(config).catch((err) => {
  console.error('Iowa trees import failed:', err);
  process.exit(1);
});
