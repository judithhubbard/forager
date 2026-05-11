// City of Tallahassee, FL — Cityworks tree inventory.
// ~57.9k inventoried trees on city-managed land, joint-hosted by the
// Tallahassee–Leon County GIS Office on the County's ArcGIS Server
// (`cotinter.leoncountyfl.gov`). The City uses Cityworks asset-
// management software, and the GIS office publishes a public read-
// only MapServer view.
//
// Source page: https://www.arcgis.com/home/item.html?id=e59ce5409c8e475e84ecbf9e9a7cbec7
// REST API:    cotinter.leoncountyfl.gov/.../COT_Cityworks_Trees_D_SP/MapServer/0
// License:     City of Tallahassee disclaimer states the data is
//              provided as-is for general reference; not Creative
//              Commons, but openly published. Treat as public-with-
//              attribution per City of Tallahassee + Tallahassee-Leon
//              County GIS Office publication.
// Refresh:     2026-05-11 verified count = 57,914. ~24.9k tagged
//              LIFECYCLE='Active' and ~33.0k null (older inventory rows
//              without a lifecycle field populated, but otherwise live
//              trees per RECMAINT — we keep both).
//
// Schema notes:
//   - BOTANICAL is the canonical Latin binomial ("Quercus virginiana",
//     "Pinus echinata"). Clean and consistent.
//   - COMMON is the common name ("Southern Live Oak", "Mockernut
//     Hickory").
//   - LIFECYCLE is 'Active' for newer rows and null for older inventory.
//     The latter still have meaningful RECMAINT entries and represent
//     real trees the City maintains; we keep both and only filter when
//     a row is explicitly flagged dead/removed (none seen in distinct-
//     values query as of 2026-05-11).
//   - Spatial reference is FL State Plane North (wkid 2883). We request
//     f=geojson which auto-projects to WGS84 lng/lat.
//
// Run: npm run import:tallahassee-trees
// Pre-req: a 'Tallahassee public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'tallahassee-cityworks-trees';
const LAYER_URL =
  'https://cotinter.leoncountyfl.gov/cotinter/rest/services/Vector/COT_Cityworks_Trees_D_SP/MapServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Tallahassee public';

interface TalFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    LIFECYCLE?: string | null;
    FACILITYID?: string;
    BOTANICAL?: string;
    COMMON?: string;
    DBH?: string;
    HEIGHT?: string;
    CONDITION?: string;
    RECMAINT?: string;
    ONSTREET?: string;
    PROPSTREET?: string;
    ZONE?: string;
  };
}

/** Tallahassee bbox. City sits at 30.4383 N, -84.2807 W; pad to catch
 *  trees in adjacent unincorporated Leon County still managed by COT. */
function inTallahasseeBbox(lng: number, lat: number): boolean {
  return lat >= 30.30 && lat <= 30.60 && lng >= -84.42 && lng <= -84.10;
}

const config: ImportConfig<TalFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'City of Tallahassee, FL Cityworks Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of Tallahassee, FL public tree inventory (~57.9k trees) ' +
    'maintained by City Operations via Cityworks asset management. ' +
    'Hosted by the Tallahassee–Leon County GIS Office on the County\'s ' +
    'ArcGIS Server. Source publishes BOTANICAL (Latin binomial), ' +
    'COMMON (common name), LIFECYCLE, RECMAINT, CONDITION, DBH, ' +
    'HEIGHT, and street-side address fields. We keep rows with ' +
    'LIFECYCLE=\'Active\' or null (both represent extant trees per ' +
    'RECMAINT). Spatial reference is FL State Plane North (wkid 2883); ' +
    'we request f=geojson which auto-projects to WGS84. AGOL item ' +
    'carries no explicit Creative Commons license — treated as public-' +
    'with-attribution per Tallahassee–Leon County GIS Office publication.',
  regionName: REGION_NAME,
  license: 'Public (City of Tallahassee + Tallahassee-Leon County GIS Office; no explicit CC license)',
  async fetchAll() {
    // No WHERE filter — both LIFECYCLE='Active' and null entries are
    // live trees per RECMAINT inspection cadence.
    return fetchArcGisLayer({ url: ENDPOINT }) as Promise<TalFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inTallahasseeBbox(lng, lat)) return null;

    const latin = (f.properties?.BOTANICAL ?? '').trim();
    const common = (f.properties?.COMMON ?? '').trim();
    if (!latin && !common) return null;

    return {
      externalId: String(
        f.properties?.OBJECTID ??
          f.properties?.FACILITYID ??
          `${lng.toFixed(6)},${lat.toFixed(6)}`
      ),
      scientificName: latin || undefined,
      commonName: common || undefined,
      lng,
      lat,
      raw: f as unknown as Record<string, unknown>
    };
  }
};

runImport(config).catch((err) => {
  console.error('Tallahassee trees import failed:', err);
  process.exit(1);
});
