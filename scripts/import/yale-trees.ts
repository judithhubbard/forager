// Yale University — Tree Inventory (Public View).
// ~7.9k trees on the Yale University campus and Yale-owned properties
// in New Haven, CT. Maintained by Yale Office of Facilities and
// published as a public-view hosted feature service on the Yale
// Maps AGOL account (owner=mbs92_yalemaps).
//
// Source page: https://www.arcgis.com/home/item.html?id=66101b6042c8476d996c6f0e06a8dfa4
// REST API:    services1.arcgis.com/7uJv7I3kgh2y7Pe0/.../Yale_Tree_Inventory_Public_View/FeatureServer/0
// License:     Yale Office of Facilities public-view layer; no explicit
//              Creative Commons license string. Treated as public-with-
//              attribution per Yale University publication.
// Refresh:     2026-05-11 verified count = 7,944.
//
// Schema notes:
//   - tree_id_species is a coded-value string (USDA NRCS PLANTS-style
//     short code like "FAGR" for Fagus grandifolia, "PRSE2" for Prunus
//     serotina). The coded-value DOMAIN on the field carries the
//     resolution: `<common name> ( <latin name> )`, e.g.
//     "TIAM" = "American basswood ( tilia americana )". We fetch the
//     layer metadata at startup, parse the domain into a code → {latin,
//     common} map, and use that during mapFeature.
//   - "UNKN" and bare-genus codes ("AM" = "Apple spp ( malus )") fall
//     through to the framework's genus-only logic or get skipped.
//
// Run: npm run import:yale-trees
// Pre-req: a 'New Haven public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'yale-university-trees';
const LAYER_URL =
  'https://services1.arcgis.com/7uJv7I3kgh2y7Pe0/arcgis/rest/services/Yale_Tree_Inventory_Public_View/FeatureServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'New Haven public';

interface YaleFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    GlobalID?: string;
    tree_id_species?: string;
    tree_dbh?: number;
    tree_condition?: number;
    tree_tag_no?: number;
    site_addr_full?: string;
  };
}

interface DomainEntry { latin?: string; common?: string; }

/** Fetch the layer metadata once, extract the SPECIES coded-value
 *  domain, parse "<common> ( <latin> )" pairs into a lookup table. */
async function loadSpeciesDomain(): Promise<Map<string, DomainEntry>> {
  const res = await fetch(`${LAYER_URL}?f=json`);
  if (!res.ok) throw new Error(`Yale layer metadata fetch ${res.status}`);
  const d = (await res.json()) as { fields?: Array<{ name: string; domain?: { codedValues?: Array<{ code: string; name: string }> } }> };
  const f = (d.fields ?? []).find((x) => x.name === 'tree_id_species');
  const cv = f?.domain?.codedValues ?? [];
  const map = new Map<string, DomainEntry>();
  for (const c of cv) {
    const name = c.name ?? '';
    // Parse "American basswood ( tilia americana )" — paren-wrapped Latin.
    const m = /^(.*?)\s*\(\s*([^)]+)\s*\)\s*$/.exec(name);
    if (m) {
      // Strip trailing " spp"/etc from the common name.
      const common = m[1].trim().replace(/\s+spp\.?\s*$/, '').trim();
      const latin = m[2].trim();
      map.set(c.code, { latin: latin || undefined, common: common || undefined });
    } else {
      // Names like "Apple spp" without parens — keep as common only.
      map.set(c.code, { common: name.trim() || undefined });
    }
  }
  console.log(`  Yale species domain: ${map.size} entries`);
  return map;
}

/** Yale-area bbox (campus + adjacent Yale-owned properties in
 *  New Haven). Roughly 41.28–41.33 N / -72.99 – -72.91 W. Pad. */
function inYaleBbox(lng: number, lat: number): boolean {
  return lat >= 41.25 && lat <= 41.35 && lng >= -73.00 && lng <= -72.88;
}

let domain: Map<string, DomainEntry> | null = null;

const config: ImportConfig<YaleFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Yale University Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'Yale University campus tree inventory (~7.9k trees) maintained by ' +
    'Yale Office of Facilities. Species field uses USDA NRCS PLANTS-' +
    'style short codes; the field\'s coded-value domain carries ' +
    '"<common> ( <latin> )" resolution which we parse at import time. ' +
    'Source publishes tree_id_species, tree_dbh, tree_condition, ' +
    'tree_tag_no, and detailed condition observation flags. AGOL item ' +
    'has no explicit Creative Commons license — treated as public-' +
    'with-attribution per Yale University publication.',
  regionName: REGION_NAME,
  license: 'Public (Yale University Office of Facilities; no explicit CC license)',
  async fetchAll() {
    domain = await loadSpeciesDomain();
    return fetchArcGisLayer({ url: ENDPOINT }) as Promise<YaleFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inYaleBbox(lng, lat)) return null;

    const code = (f.properties?.tree_id_species ?? '').trim();
    if (!code || code === 'UNKN') return null;
    const entry = domain?.get(code);
    const latin = entry?.latin;
    const common = entry?.common;
    if (!latin && !common) return null;

    return {
      externalId: String(
        f.properties?.OBJECTID ??
          f.properties?.GlobalID ??
          f.properties?.tree_tag_no ??
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
  console.error('Yale trees import failed:', err);
  process.exit(1);
});
