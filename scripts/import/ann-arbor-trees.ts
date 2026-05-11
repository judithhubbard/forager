// City of Ann Arbor, MI — Forestry tree inventory. ~60k trees managed
// by Ann Arbor Public Services Forestry & Natural Resources Unit, with
// a public-facing dashboard ("Forestry Pruning Program Areas"). Hosted
// on the City's ArcGIS Server farm (a2mapscw.a2gov.org) and indexed on
// ArcGIS Online (owner: ERoggow@a2gov.org_A2_MI, item
// ea2d448f87044e56b3d709b1953eeb16).
//
// Source page: https://www.a2gov.org/services/Pages/Forestry.aspx
// REST API:    a2mapscw.a2gov.org/.../Cityworks/CWSForestry/MapServer/1
// License:     None declared on the AGOL item; "access" is public.
//              Ann Arbor's GIS team publishes city base data without
//              an explicit license string — treat as public-with-
//              attribution per City of Ann Arbor MI publication.
// Refresh:     2026-05-11 verified count = 59,887
//
// Schema notes: BOTANICAL is the Latin binomial (occasionally with
// cultivar appended, e.g. "Acer rubrum 'Red Sunset'"), CULTIVAR holds
// the bare cultivar separately, COMMONNAME is in "common, modifier"
// form ("Maple, Norway", "Oak, Red"). Some rows have BOTANICAL =
// "vacant site large" / "stump" — we filter those by checking for a
// space-and-lowercase-second-word pattern that doesn't look like a
// Latin epithet. The normalizeSpeciesName pass in the framework
// strips the cultivar from BOTANICAL before matchSpecies sees it.
//
// Run: npm run import:ann-arbor-trees
// Pre-req: an 'Ann Arbor public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'ann-arbor-forestry-trees';
const LAYER_URL =
  'https://a2mapscw.a2gov.org/a2arcgis/rest/services/Cityworks/CWSForestry/MapServer/1';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Ann Arbor public';

interface A2Feature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    FACILITYID?: string;
    LEGACYID?: string;
    COMMONGENUS?: string;
    COMMONNAME?: string;
    BOTANICALGENUS?: string;
    BOTANICAL?: string;
    CULTIVAR?: string;
    OWNERSHIP?: string;
    CONDITION?: string;
    DBH?: string;
    ONSTREET?: string;
    ADDRESSNUMBER?: number;
    STREET?: string;
  };
}

/** Ann Arbor bbox. City sits ~42.28 N, -83.74 W. AGOL extent declared
 *  42.2248–42.3323 / -83.8181 – -83.6666; pad slightly for the
 *  airport corridor. */
function inAnnArborBbox(lng: number, lat: number): boolean {
  return lat >= 42.18 && lat <= 42.36 && lng >= -83.85 && lng <= -83.62;
}

/** Reorder "maple, norway" → "norway maple" so common-name path lines
 *  up with our natural-order catalog entries. matchSpecies handles
 *  whitespace/case normalisation. */
function reorderCommon(name: string): string {
  const idx = name.indexOf(',');
  if (idx < 0) return name.trim();
  const head = name.slice(0, idx).trim();
  const tail = name.slice(idx + 1).trim();
  if (!tail) return head;
  return `${tail} ${head}`;
}

/** Reject BOTANICAL values that aren't real Latin — Ann Arbor's
 *  inventory uses BOTANICAL='vacant site large', 'stump', 'unknown'
 *  as placeholder strings. Real Latin binomials always start with a
 *  capitalised genus; lowercase-leading strings are placeholders. */
function looksLikeLatin(s: string): boolean {
  if (!s) return false;
  if (!/^[A-Z][a-z]+/.test(s)) return false;
  // Reject "Unknown", "Stump", "Vacant" single-token capitalised strings.
  const PLACEHOLDERS = new Set(['Unknown', 'Stump', 'Vacant', 'Other', 'None']);
  if (PLACEHOLDERS.has(s.split(/\s+/)[0])) return false;
  return true;
}

const config: ImportConfig<A2Feature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Ann Arbor Forestry Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of Ann Arbor, MI Public Services Forestry tree inventory ' +
    '(~60k trees) managed by the Forestry & Natural Resources Unit. ' +
    'Source publishes BOTANICAL (Latin, occasional cultivar suffix), ' +
    'CULTIVAR, and a comma-modifier COMMONNAME. Filters placeholder ' +
    'rows where BOTANICAL = "vacant site large", "stump", etc. ' +
    'AGOL item carries no explicit license; treated as public-with-' +
    'attribution per City of Ann Arbor publication.',
  regionName: REGION_NAME,
  license: 'Public (City of Ann Arbor; no explicit CC license)',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      // Filter to rows with a probable Latin binomial. The
      // looksLikeLatin() check inside mapFeature is the actual gate;
      // server-side we just drop empties.
      where: "BOTANICAL IS NOT NULL AND BOTANICAL <> ''"
    }) as Promise<A2Feature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inAnnArborBbox(lng, lat)) return null;

    const botanical = (f.properties?.BOTANICAL ?? '').trim();
    const commonRaw = (f.properties?.COMMONNAME ?? '').trim();
    const latin = looksLikeLatin(botanical) ? botanical : '';
    const common = commonRaw ? reorderCommon(commonRaw) : undefined;
    if (!latin && !common) return null;

    return {
      externalId: String(
        f.properties?.OBJECTID ??
          f.properties?.FACILITYID ??
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
  console.error('Ann Arbor trees import failed:', err);
  process.exit(1);
});
