// City of Rochester — "Trees Open Data - Live" inventory, maintained
// by the Forestry Division of the Department of Environmental Services
// and served from the city's own ArcGIS Server.
//
// Source page: https://data.cityofrochester.gov/datasets/3696b91914754d3d82e1dcab13cc5288
// REST API:    https://maps.cityofrochester.gov/server/rest/services/Open_Data/Trees_Open_Data/FeatureServer/0
// ArcGIS item: https://www.arcgis.com/home/item.html?id=4c209944e2984b4a908a14b0cbe48075
// License:     "DataROC Terms of Use" — Rochester's open-data terms.
//              Permissive city-OD style: redistribution + commercial
//              use allowed with attribution per the
//              data.cityofrochester.gov/pages/terms-of-use document.
//
// Verified count (2026-05-10): 64,520 rows. (FEMC's private stub was
// 82,192 in 2015–16; current snapshot is slightly smaller after
// inventory cleanup but still substantially larger than the 145-row
// older FEMC 2007 stub.)
//
// Spatial reference: the layer's native CRS is NY State Plane Central
// (EPSG:2262 — feet). The fetchArcGisLayer helper requests
// f=geojson which forces WGS84 transformation server-side, so the
// import doesn't need to project.
//
// Schema: `GENUS`, `SPECIES` (both UPPERCASE, e.g. "QUERCUS", "RUBRA"),
// `TREE_NAME_VAL` (common name "OAK - NORTHERN RED"), `PARKS_VAL`
// (park name or address), `STREET_NAME`, `DBH_VAL` ("28\""),
// `ASSETID` (stable per-tree id), `INV_DATE`. We concatenate
// `GENUS SPECIES` (capitalising) to build the Latin binomial.
//
// Climate: USDA 6a. Complements Syracuse (already public, ~48k via
// FEMC) on the western Finger Lakes corridor.
//
// Run: npm run import:rochester-trees
// Pre-req: a 'Rochester public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'rochester-trees';
const ENDPOINT =
  'https://maps.cityofrochester.gov/server/rest/services/Open_Data/Trees_Open_Data/FeatureServer/0/query';
const REGION_NAME = 'Rochester public';

interface RocFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    ASSETID?: number;
    PARKS_VAL?: string;
    STREET_NAME?: string;
    TREE_NUMBER?: number;
    DBH_VAL?: string;
    GENUS?: string;            // "QUERCUS"
    SPECIES?: string;          // "RUBRA"
    TREE_NAME_VAL?: string;    // "OAK - NORTHERN RED"
    INV_DATE?: number;
  };
}

/** "QUERCUS" + "RUBRA" → "Quercus rubra". Handles missing species
 *  (returns genus alone, which the species matcher will skip
 *  naturally since forageable_species.json is binomial-keyed). */
function buildLatin(genus: string | undefined, species: string | undefined): string {
  const g = (genus ?? '').trim();
  if (!g) return '';
  const s = (species ?? '').trim();
  const gC = g.charAt(0).toUpperCase() + g.slice(1).toLowerCase();
  if (!s) return gC;
  const sC = s.toLowerCase();
  return `${gC} ${sC}`;
}

const config: ImportConfig<RocFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Rochester Trees (DataROC)',
  sourceUrl: 'https://data.cityofrochester.gov/',
  sourceDescription:
    'City of Rochester NY public tree inventory (~64k records), ' +
    'maintained by the Forestry Division of the Department of ' +
    'Environmental Services. DataROC Terms of Use (permissive city ' +
    "open-data). Schema is split GENUS/SPECIES uppercase plus a " +
    'TREE_NAME_VAL display name — script lowercases and assembles ' +
    'the Latin binomial.',
  regionName: REGION_NAME,
  license: 'DataROC Terms of Use',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      // Skip rows with no genus (vacant pits, stumps).
      where: "GENUS IS NOT NULL AND GENUS <> ''"
    }) as Promise<RocFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const lng = Number(f.geometry?.coordinates?.[0]);
    const lat = Number(f.geometry?.coordinates?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    // Rochester sits ~43.10–43.25N, -77.75 – -77.55W.
    if (lat < 43.0 || lat > 43.35 || lng < -77.85 || lng > -77.45) return null;

    const latin = buildLatin(f.properties?.GENUS, f.properties?.SPECIES);
    if (!latin) return null;

    // Display common name. The "OAK - NORTHERN RED" form is hard to
    // match against forageable_species (which uses "Northern Red
    // Oak"). We leave it as-is and let the matcher try; the Latin
    // binomial does the heavy lifting.
    const common = (f.properties?.TREE_NAME_VAL ?? '').trim();

    return {
      externalId: String(
        f.properties?.ASSETID
          ?? f.properties?.OBJECTID
          ?? `${lng.toFixed(6)},${lat.toFixed(6)}`
      ),
      scientificName: latin,
      commonName: common || undefined,
      lng,
      lat,
      raw: f
    };
  }
};

runImport(config).catch((err) => {
  console.error('Rochester trees import failed:', err);
  process.exit(1);
});
