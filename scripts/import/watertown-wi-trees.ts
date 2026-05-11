// City of Watertown, WI — Public Tree Maintenance inventory.
// ~11.3k inventoried trees on city-managed land, published as a public
// hosted feature service on the Watertown WI AGOL org
// (owner=bzirbes_WT). NOTE: this is Watertown, Wisconsin (population
// ~24k, on the Rock River between Madison and Milwaukee). Not to be
// confused with Watertown MA (Boston suburb, no public AGOL feed —
// uses commercial MapGeo viewer).
//
// Source page: https://www.arcgis.com/home/item.html?id=816c7ea3db9346a3bd8fb89a8439a5b0
// REST API:    services.arcgis.com/BIG5xreQwYg6s2kt/.../Tree_Maitenance_Join_1M/FeatureServer/0
// License:     City of Watertown, WI public open data; no explicit CC
//              license string. Treated as public-with-attribution.
// Refresh:     2026-05-11 verified count = 11,258.
//
// Schema notes:
//   - Genus + Species are separate fields.
//   - CommonName holds the common name.
//   - TreeStatus tracks lifecycle; we filter to live trees.
//
// Run: npm run import:watertown-ma-trees
// Pre-req: a 'Watertown WI public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'watertown-wi-tree-maintenance';
const LAYER_URL =
  'https://services.arcgis.com/BIG5xreQwYg6s2kt/arcgis/rest/services/Tree_Maitenance_Join_1M/FeatureServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Watertown WI public';

interface WatFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    Genus?: string;
    Species?: string;
    CommonName?: string;
    Variety?: string;
    YearPlanted?: number;
    YearRemoved?: number;
    TreeStatus?: string;
    Condition?: string;
    DBH?: number;
  };
}

/** Watertown, WI bbox. City sits at 43.1947 N, -88.7287 W on the
 *  Rock River between Madison and Milwaukee. Pad slightly. */
function inWatertownWiBbox(lng: number, lat: number): boolean {
  return lat >= 43.13 && lat <= 43.25 && lng >= -88.82 && lng <= -88.62;
}

const config: ImportConfig<WatFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'City of Watertown, WI Public Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of Watertown, WI Public Trees inventory (~11.3k trees) ' +
    'maintained by Watertown DPW. Source publishes Genus + Species ' +
    'separately, CommonName, Variety (cultivar), DBH, TreeStatus, ' +
    'and maintenance flags. We filter out rows with a non-null ' +
    'YearRemoved (live trees only). AGOL item has no explicit CC ' +
    'license — treated as public-with-attribution per City of ' +
    'Watertown WI publication. (Watertown WI is a small city ' +
    'between Madison and Milwaukee; not to be confused with ' +
    'Watertown MA, NY, SD, etc.)',
  regionName: REGION_NAME,
  license: 'Public (City of Watertown, WI; no explicit CC license)',
  async fetchAll() {
    const where = 'YearRemoved IS NULL';
    return fetchArcGisLayer({ url: ENDPOINT, where }) as Promise<WatFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inWatertownWiBbox(lng, lat)) return null;

    const genus = (f.properties?.Genus ?? '').trim();
    const species = (f.properties?.Species ?? '').trim();
    const latin = genus && species ? `${genus} ${species}` : genus;
    const common = (f.properties?.CommonName ?? '').trim();
    if (!latin && !common) return null;

    return {
      externalId: String(
        f.properties?.OBJECTID ??
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
  console.error('Watertown MA trees import failed:', err);
  process.exit(1);
});
