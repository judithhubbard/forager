// Sarasota County, FL — County Tree Inventory.
// ~60k inventoried trees on county-managed land (parks, ROW, county
// facilities) maintained by Sarasota County via Cityworks-style asset
// records. Hosted on the County's own ArcGIS Server (ags3.scgov.net).
//
// Source page: https://www.arcgis.com/home/item.html?id=d83796771ba64ea88f958c058ddcfa79
// REST API:    ags3.scgov.net/.../Hosted/TreeInventory/FeatureServer/0
// License:     Public, county-published asset inventory. No explicit
//              Creative Commons license string on the AGOL item;
//              treated as public-with-attribution per Sarasota County
//              Public Works publication.
// Refresh:     2026-05-11 verified count = 60,044 (existstatus IN
//              ('In Place', NULL); 1,929 'Removed' filtered out).
//
// Schema notes:
//   - genusname holds a title-cased Latin binomial ("Quercus Nigra",
//     "Pinus Palustris"). The framework's matchSpecies normalises case.
//     A small fraction are "Casuarina Spp" / similar genus-only — the
//     framework's genus-only fallback handles these where appropriate.
//   - commonname holds the common name ("Water Oak", "Cabbage Palm").
//   - existstatus has codes 'In Place', 'Removed', and null. We filter
//     out Removed; keep both 'In Place' and null (the null rows are
//     older inventory without a status flag set but are still mappable
//     trees per remaining condition/maintenance fields).
//
// Run: npm run import:sarasota-county-trees
// Pre-req: a 'Sarasota County public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'sarasota-county-tree-inventory';
const LAYER_URL =
  'https://ags3.scgov.net/server/rest/services/Hosted/TreeInventory/FeatureServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Sarasota County public';

interface SarFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    objectid?: number;
    treeid?: string;
    genusname?: string;
    commonname?: string;
    existstatus?: string | null;
    conditionrating?: string;
    facilityname?: string;
    facilitytype?: string;
    city?: string;
    zipcode?: string;
  };
}

/** Sarasota County, FL bbox. County spans roughly 26.85–27.45 N and
 *  -82.65 – -82.10 W (includes the city of Sarasota plus North Port,
 *  Venice, Englewood, etc). Pad slightly. */
function inSarasotaBbox(lng: number, lat: number): boolean {
  return lat >= 26.80 && lat <= 27.50 && lng >= -82.75 && lng <= -82.00;
}

const config: ImportConfig<SarFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Sarasota County, FL Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'Sarasota County, FL public tree inventory (~60k trees) maintained ' +
    'by Sarasota County Public Works on county-managed land (parks, ' +
    'rights-of-way, county facilities). Hosted on the County\'s own ' +
    'ArcGIS Server. Source publishes genusname (title-cased Latin ' +
    'binomial), commonname (common name), existstatus, conditionrating, ' +
    'facilityname/type, and other Cityworks-style asset fields. We ' +
    'filter out rows with existstatus=\'Removed\'; both \'In Place\' ' +
    'and null are kept. AGOL item carries no explicit Creative Commons ' +
    'license — treated as public-with-attribution per Sarasota County ' +
    'Public Works publication.',
  regionName: REGION_NAME,
  license: 'Public (Sarasota County, FL Public Works; no explicit CC license)',
  async fetchAll() {
    // Keep 'In Place' + null existstatus; exclude 'Removed' rows.
    const where = "existstatus = 'In Place' OR existstatus IS NULL";
    return fetchArcGisLayer({ url: ENDPOINT, where }) as Promise<SarFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inSarasotaBbox(lng, lat)) return null;

    const latinRaw = (f.properties?.genusname ?? '').trim();
    const common = (f.properties?.commonname ?? '').trim();
    if (!latinRaw && !common) return null;

    return {
      externalId: String(
        f.properties?.objectid ??
          f.properties?.treeid ??
          `${lng.toFixed(6)},${lat.toFixed(6)}`
      ),
      scientificName: latinRaw || undefined,
      commonName: common || undefined,
      lng,
      lat,
      raw: f as unknown as Record<string, unknown>
    };
  }
};

runImport(config).catch((err) => {
  console.error('Sarasota County trees import failed:', err);
  process.exit(1);
});
