// City of Eugene, OR — Parks & Open Space tree inventory.
// ~88k mature trees (plus ~17k planting sites and ~5k stumps that we
// filter out). Maintained by City of Eugene Public Works PWE GIS;
// published as the "City of Eugene Urban Forest - Public" web app on
// the city's AGOL org (owner=City_of_Eugene).
//
// Note: this is a Parks & Open Space inventory, not a comprehensive
// street-tree inventory. Eugene does not appear to publish a public
// ROW street-tree inventory; the parks/open-space dataset is the
// closest public-tier feed and still represents most of the
// mappable mature tree canopy on city land.
//
// Source page: https://eugene-pwe.maps.arcgis.com/apps/webappviewer/index.html?id=8c2c6e0c1599456dabd1f18fbbf6676c
// REST API:    services3.arcgis.com/F7NiRLGNbA2hh7gE/arcgis/rest/services/Public_Trees_View_1/FeatureServer/0
// License:     "This Web Application is intended for public use" — no
//              explicit Creative Commons license, but openly published
//              by the City; treat as public-with-attribution per City
//              of Eugene Public Works publication.
// Refresh:     2026-05-11 verified count = 111,155 (all site types);
//              we filter site_typ='T' (live tree) which is ~88,575.
//
// Schema notes: Tree_species is a single string in
// "Genus species - common name" format (e.g. "Taxodium distichum -
// bald cypress"). We split on the first " - " into Latin and common.
//
// Run: npm run import:eugene-trees
// Pre-req: an 'Eugene public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'eugene-parks-trees';
const LAYER_URL =
  'https://services3.arcgis.com/F7NiRLGNbA2hh7gE/arcgis/rest/services/Public_Trees_View_1/FeatureServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Eugene public';

interface EugFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    site_id?: number;
    site_typ?: string; // 'T' tree, 'P' planting site, 'S' stump, 'H' historic
    park?: string;
    Tree_species?: string;
    diameter?: number;
    height?: number;
    GlobalID?: string;
  };
}

/** Eugene bbox. City sits ~44.05 N, -123.09 W; metro extent runs
 *  ~43.98–44.14 / -123.21 – -122.99. Pad slightly for outlying open
 *  space, but stay tight enough to flag any garbage coords. */
function inEugeneBbox(lng: number, lat: number): boolean {
  return lat >= 43.95 && lat <= 44.20 && lng >= -123.30 && lng <= -122.90;
}

/** Split "Taxodium distichum - bald cypress" → latin/common. The
 *  source uses " - " (space hyphen space) as separator; we also
 *  accept " — " (em-dash) for safety. Returns both parts when
 *  available; either may be empty. */
function splitSpecies(raw: string): { latin: string; common: string } {
  const s = raw.trim();
  if (!s) return { latin: '', common: '' };
  // Try " - " then " — " then " -" / "- "
  for (const sep of [' - ', ' — ', ' – ']) {
    const idx = s.indexOf(sep);
    if (idx >= 0) {
      return { latin: s.slice(0, idx).trim(), common: s.slice(idx + sep.length).trim() };
    }
  }
  // Looks like only one part — heuristic: if it has a capital + lowercase
  // species epithet, treat as Latin; else common.
  if (/^[A-Z][a-z]+\s+[a-z]+/.test(s)) return { latin: s, common: '' };
  return { latin: '', common: s };
}

/** Drop dvSPP-style placeholder rows. */
function looksLikeLatin(s: string): boolean {
  if (!s) return false;
  if (!/^[A-Z][a-z]+/.test(s)) return false;
  const lower = s.toLowerCase();
  const REJECTS = ['unknown', 'vacant', 'stump', 'other', 'empty', 'none', 'no tree', 'tbd'];
  for (const r of REJECTS) if (lower.startsWith(r)) return false;
  return true;
}

const config: ImportConfig<EugFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Eugene Parks & Open Space Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of Eugene, OR Parks & Open Space tree inventory (~88k live ' +
    'trees) published via the "City of Eugene Urban Forest - Public" ' +
    'web application. Source publishes a combined Tree_species field ' +
    'in "Genus species - common name" form; we split on the first ' +
    '" - " into separate Latin and common name handles. We filter to ' +
    'site_typ=\'T\' (live tree) and skip planting sites and stumps. ' +
    'No explicit license string; treated as public-with-attribution ' +
    'per City of Eugene Public Works publication.',
  regionName: REGION_NAME,
  license: 'Public (City of Eugene; no explicit CC license)',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      // Live trees only (T); skip planting sites (P), stumps (S),
      // historic sites (H). And require a Tree_species value.
      where:
        "site_typ = 'T' AND Tree_species IS NOT NULL AND Tree_species <> ''"
    }) as Promise<EugFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inEugeneBbox(lng, lat)) return null;

    const rawSpecies = (f.properties?.Tree_species ?? '').trim();
    if (!rawSpecies) return null;
    const { latin: rawLatin, common: rawCommon } = splitSpecies(rawSpecies);
    const latin = looksLikeLatin(rawLatin) ? rawLatin : '';
    const common = rawCommon || undefined;
    if (!latin && !common) return null;

    return {
      externalId: String(
        f.properties?.OBJECTID ??
          f.properties?.GlobalID ??
          f.properties?.site_id ??
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
  console.error('Eugene trees import failed:', err);
  process.exit(1);
});
