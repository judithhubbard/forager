// City of Lawrence, KS — Tree Viewer.
// ~16.7k inventoried trees on city-managed land (parks, ROW, town
// facilities). ~12.2k have a populated speciesid; ~4.5k are
// unidentified placeholder rows. Published as the public Tree Viewer
// hosted feature service on Lawrence KS AGOL (owner=gis_lawrenceks).
//
// Source page: https://www.arcgis.com/home/item.html?id=abbd516a4b664153ad5c14be1ccc377d
// REST API:    services.arcgis.com/8O9UlSTnqjKptoda/.../Tree_Viewer1/FeatureServer/0
// License:     City of Lawrence, KS public open data; no explicit CC
//              license string. Treated as public-with-attribution.
// Refresh:     2026-05-11 verified count = 16,720 total; 12,159 with
//              non-null speciesid.
//
// Schema notes:
//   - speciesid is a coded-value string ("SPP-1", "SPP-2", ...) whose
//     coded-value domain on the field carries the common name
//     (sometimes with cultivar in single quotes, e.g.
//     "Maple, Red 'Redpointe'"; we strip the cultivar). No Latin
//     binomials are exposed — we match on common name only.
//   - We resolve the code → common-name map at startup, then map each
//     row through it. Rows with null speciesid or codes missing from
//     the domain are skipped.
//
// Run: npm run import:lawrence-ks-trees
// Pre-req: a 'Lawrence KS public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'lawrence-ks-trees';
const LAYER_URL =
  'https://services.arcgis.com/8O9UlSTnqjKptoda/arcgis/rest/services/Tree_Viewer1/FeatureServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Lawrence KS public';

interface LawFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    assetid?: string;
    speciesid?: string;
    address?: string;
    lifecyclestatus?: number;
    diameter?: number;
    height?: number;
    condition?: number;
  };
}

/** Reorder "Maple, Red" → "Red Maple". Also strips quoted cultivars
 *  like "Maple, Red 'Redpointe'" → "Red Maple". */
function reorderCommon(name: string): string {
  // Drop quoted cultivar.
  let s = name.replace(/['‘’"][^'‘’"]+['‘’"]/g, '').trim();
  const idx = s.indexOf(',');
  if (idx < 0) return s;
  const head = s.slice(0, idx).trim();
  const tail = s.slice(idx + 1).trim();
  if (!tail) return head;
  return `${tail} ${head}`;
}

async function loadCodeMap(): Promise<Map<string, string>> {
  const res = await fetch(`${LAYER_URL}?f=json`);
  if (!res.ok) throw new Error(`Lawrence layer metadata fetch ${res.status}`);
  const d = (await res.json()) as { fields?: Array<{ name: string; domain?: { codedValues?: Array<{ code: string; name: string }> } }> };
  const f = (d.fields ?? []).find((x) => x.name === 'speciesid');
  const cv = f?.domain?.codedValues ?? [];
  const map = new Map<string, string>();
  for (const c of cv) {
    map.set(c.code, reorderCommon(c.name ?? ''));
  }
  console.log(`  Lawrence speciesid domain: ${map.size} entries`);
  return map;
}

/** Lawrence, KS bbox. City sits roughly 38.92–39.02 N / -95.32 – -95.18 W. */
function inLawrenceKsBbox(lng: number, lat: number): boolean {
  return lat >= 38.88 && lat <= 39.06 && lng >= -95.40 && lng <= -95.12;
}

let codeMap: Map<string, string> | null = null;

const config: ImportConfig<LawFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'City of Lawrence, KS Tree Viewer Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of Lawrence, KS tree inventory (~16.7k trees; ~12.2k with ' +
    'identified species) published as the public Tree Viewer. The ' +
    'speciesid field is a coded-value code (SPP-1, SPP-2, ...); the ' +
    'field domain carries common names (with optional cultivar in ' +
    'single quotes which we strip) but no Latin binomials. We resolve ' +
    'codes at import time and match on common name only. AGOL item ' +
    'has no explicit CC license — treated as public-with-attribution.',
  regionName: REGION_NAME,
  license: 'Public (City of Lawrence, KS; no explicit CC license)',
  async fetchAll() {
    codeMap = await loadCodeMap();
    const where = 'speciesid IS NOT NULL';
    return fetchArcGisLayer({ url: ENDPOINT, where }) as Promise<LawFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inLawrenceKsBbox(lng, lat)) return null;

    const code = (f.properties?.speciesid ?? '').trim();
    if (!code) return null;
    const common = codeMap?.get(code);
    if (!common) return null;

    return {
      externalId: String(
        f.properties?.OBJECTID ??
          f.properties?.assetid ??
          `${lng.toFixed(6)},${lat.toFixed(6)}`
      ),
      commonName: common,
      lng,
      lat,
      raw: f as unknown as Record<string, unknown>
    };
  }
};

runImport(config).catch((err) => {
  console.error('Lawrence KS trees import failed:', err);
  process.exit(1);
});
