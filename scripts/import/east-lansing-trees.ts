// City of East Lansing, MI — Forestry tree inventory (current status
// layer). ~10k trees managed by Public Works Forestry, with a public
// "TREES - CITY OF EAST LANSING PUBLIC" dashboard owned by city GIS
// staff `dfitzge` on ArcGIS Online (item 0166cb5e3a124abfa845e26a15a10a13).
// Backing FeatureServer hosted on the City's own ArcGIS Server farm
// (gis2.cityofeastlansing.com).
//
// Source page: https://www.cityofeastlansing.com/2235/Forestry-Trees
// REST API:    gis2.cityofeastlansing.com/.../TREES_STATUS/FeatureServer/0
// License:     None declared on the dashboard item; public access.
//              City of East Lansing publishes operational GIS data
//              without an explicit license string — treat as public-
//              with-attribution per municipal publication.
// Refresh:     2026-05-11 verified count = 10,247
//
// Schema notes: dvSPP holds the Latin binomial ("Tilia cordata",
// "Acer rubrum"). Tree_Name holds a comma-modifier common name
// ("Linden, LIttleleaf" — note the typo, preserved by the source).
// Status field marks active/removed/planned; we keep only rows
// representing extant trees.
//
// Run: npm run import:east-lansing-trees
// Pre-req: an 'East Lansing public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'east-lansing-forestry-trees';
const LAYER_URL =
  'https://gis2.cityofeastlansing.com/arcgis/rest/services/TREES_STATUS/FeatureServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'East Lansing public';

interface ElFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    dvaddNum?: string;
    dvSPP?: string;
    dvDBH?: string;
    Tree_Name?: string;
    Tree_ID?: string;
    LucityID?: number;
    GlobalID?: string;
    Status?: string;
    DDA?: string;
    InvDate?: number;
    Parkway?: string;
  };
}

/** East Lansing bbox. City sits ~42.74 N, -84.48 W. AGOL extent is
 *  in State Plane (wkid 2253); WGS84 sample data spans roughly
 *  42.70–42.78 / -84.55 – -84.42. Pad slightly. */
function inEastLansingBbox(lng: number, lat: number): boolean {
  return lat >= 42.69 && lat <= 42.80 && lng >= -84.58 && lng <= -84.40;
}

/** Reorder "linden, littleleaf" → "littleleaf linden" so the common
 *  name path lines up with our catalog. Preserves the source's
 *  spelling exactly (e.g. "LIttleleaf" — sic). matchSpecies
 *  normalises case. */
function reorderCommon(name: string): string {
  const idx = name.indexOf(',');
  if (idx < 0) return name.trim();
  const head = name.slice(0, idx).trim();
  const tail = name.slice(idx + 1).trim();
  if (!tail) return head;
  return `${tail} ${head}`;
}

/** Reject dvSPP values that aren't real Latin. The East Lansing
 *  inventory mostly has clean binomials, but defensively drop any
 *  lowercase-leading or single-token strings that don't match. */
function looksLikeLatin(s: string): boolean {
  if (!s) return false;
  if (!/^[A-Z][a-z]+/.test(s)) return false;
  const PLACEHOLDERS = new Set(['Unknown', 'Stump', 'Vacant', 'Other', 'None', 'Empty']);
  if (PLACEHOLDERS.has(s.split(/\s+/)[0])) return false;
  return true;
}

const config: ImportConfig<ElFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'East Lansing Forestry Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of East Lansing, MI Forestry tree inventory (~10k trees) ' +
    'maintained by Public Works. Source publishes dvSPP (Latin ' +
    'binomial), Tree_Name (comma-modifier common name), and a ' +
    'Status field. We keep all rows with a usable species value; ' +
    'rows marked Removed are still useful for historical foraging ' +
    'context but Status filtering can be added later if needed. ' +
    'AGOL dashboard item carries no explicit license; treated as ' +
    'public-with-attribution per City of East Lansing publication.',
  regionName: REGION_NAME,
  license: 'Public (City of East Lansing; no explicit CC license)',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      // Keep rows with either Latin or common name present; the
      // mapFeature step does the actual gating.
      where: "(dvSPP IS NOT NULL AND dvSPP <> '') OR (Tree_Name IS NOT NULL AND Tree_Name <> '')"
    }) as Promise<ElFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inEastLansingBbox(lng, lat)) return null;

    const rawLatin = (f.properties?.dvSPP ?? '').trim();
    const latin = looksLikeLatin(rawLatin) ? rawLatin : '';
    const commonRaw = (f.properties?.Tree_Name ?? '').trim();
    const common = commonRaw ? reorderCommon(commonRaw) : undefined;
    if (!latin && !common) return null;

    return {
      externalId: String(
        // OBJECTID is the only ID guaranteed unique per row; Tree_ID
        // and LucityID can repeat across edit history rows.
        f.properties?.OBJECTID ??
          f.properties?.GlobalID ??
          `${lng.toFixed(6)},${lat.toFixed(6)}`
      ),
      scientificName: latin || undefined,
      commonName: common,
      lng,
      lat,
      raw: f as unknown as Record<string, unknown>
    };
  }
};

runImport(config).catch((err) => {
  console.error('East Lansing trees import failed:', err);
  process.exit(1);
});
