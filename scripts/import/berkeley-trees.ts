// City of Berkeley, CA — Urban forest tree inventory maintained by
// Parks, Recreation & Waterfront (Parks Division) with contractor
// Arborwell. ~47k trees published on the City's hosted ArcGIS Online
// org (owner: berkeley, services1.arcgis.com/IYiCpZoSIq9lAxi8).
//
// The City exposes the canonical inventory as a WFS (item
// 466f801df34e4e85ae416dbf57906a99) but the queryable FeatureServer
// of the same name requires a token. The "Trees_Test" FeatureServer
// (item 5982db9c6ba84d60835e3f6a188cca9c) is the public, anonymously-
// queryable replica backed by the same data; despite the "_Test"
// suffix the City uses it as its working public endpoint (same row
// count, same bbox, same Arborwell metadata).
//
// Source page: https://www.cityofberkeley.info/Parks/Trees
// REST API:    services1.arcgis.com/IYiCpZoSIq9lAxi8/.../Trees_Test/FeatureServer/0
// License:     None declared on AGOL item. Berkeley's open-data
//              policy makes this public-with-attribution; flag for
//              explicit confirmation in the Forager About page.
// Refresh:     2026-05-11 verified count = 46,732
//
// Schema notes: source has no Latin binomial. TREE_NAME holds a
// common name ("Cherry plum", "Sweetgum"); iTREE_CODE is the i-Tree
// species code (PRCE = Prunus cerasifera, LIST = Liquidambar
// styraciflua). GENUS is mostly null. We feed TREE_NAME to the
// common-name path; the i-Tree-code → Latin mapping is omitted here
// for simplicity since the common names already match our catalog
// for the species foragers care about.
//
// Run: npm run import:berkeley-trees
// Pre-req: a 'Berkeley public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'berkeley-urban-forest-trees';
const LAYER_URL =
  'https://services1.arcgis.com/IYiCpZoSIq9lAxi8/arcgis/rest/services/Trees_Test/FeatureServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Berkeley public';

interface BerkFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    TREE_NAME?: string;
    GENUS?: string;
    iTREE_CODE?: string;
    iTREE_OTHER?: string;
    DIAMETER?: number;
    TRUNKDIAM?: number;
    TREE_HEIGHT?: number;
    STREET_NUMBER?: number;
    STREET_NAME?: string;
    STREET_ON?: string;
    LOCATION?: string;
    DATE_PLANTED?: number;
    CROWN_HEALTH?: string;
  };
}

/** Berkeley city bbox. AGOL extent declared as 37.8457–37.9049 /
 *  -122.3217 – -122.2340; pad slightly to catch the Berkeley Hills
 *  trees and Aquatic Park. */
function inBerkeleyBbox(lng: number, lat: number): boolean {
  return lat >= 37.83 && lat <= 37.91 && lng >= -122.34 && lng <= -122.22;
}

const config: ImportConfig<BerkFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Berkeley Urban Forest Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of Berkeley, CA Parks, Recreation & Waterfront urban forest ' +
    'tree inventory (~47k trees). Compiled with contractor Arborwell ' +
    'in 2013, periodically maintained. Source has TREE_NAME (common ' +
    'name) and iTREE_CODE; no Latin binomial. We feed the common name ' +
    'into matchSpecies\'s common-name path. AGOL item carries no ' +
    'explicit license; treated as public-with-attribution per City of ' +
    'Berkeley publication, pending confirmation in About page.',
  regionName: REGION_NAME,
  license: 'Public (City of Berkeley; no explicit CC license)',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      where: "TREE_NAME IS NOT NULL AND TREE_NAME <> ''"
    }) as Promise<BerkFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inBerkeleyBbox(lng, lat)) return null;

    const common = (f.properties?.TREE_NAME ?? '').trim();
    if (!common) return null;

    return {
      externalId: String(
        f.properties?.OBJECTID ?? `${lng.toFixed(6)},${lat.toFixed(6)}`
      ),
      commonName: common,
      lng,
      lat,
      raw: f as unknown as Record<string, unknown>
    };
  }
};

runImport(config).catch((err) => {
  console.error('Berkeley trees import failed:', err);
  process.exit(1);
});
