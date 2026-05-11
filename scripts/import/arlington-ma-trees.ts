// Town of Arlington, MA — Public Shade Trees inventory.
// ~11.3k inventoried trees on town-managed land, published as a public
// view feature service on the Arlington MA AGOL org
// (owner=ArlingtonMA_GIS).
//
// Source page: https://www.arcgis.com/home/item.html?id=179e7185b3d845c59eb0ae8f7391c714
// REST API:    services2.arcgis.com/s1Sh73K7qtP9JdrG/.../Public_Shade_Trees_view/FeatureServer/0
// License:     Town of Arlington, MA public open data; no explicit CC
//              license string. Treated as public-with-attribution.
// Refresh:     2026-05-11 verified count = 11,326.
//
// Schema notes:
//   - Genus + Species are separate fields.
//   - CommonName holds the common name.
//   - Cultivar is a separate field (carried in raw, not used for matching).
//
// Run: npm run import:arlington-ma-trees
// Pre-req: an 'Arlington MA public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'arlington-ma-public-shade-trees';
const LAYER_URL =
  'https://services2.arcgis.com/s1Sh73K7qtP9JdrG/arcgis/rest/services/Public_Shade_Trees_view/FeatureServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Arlington MA public';

interface ArlFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    AssetID?: string;
    AddrNum?: string;
    RoadName?: string;
    CommonName?: string;
    Genus?: string;
    Species?: string;
    Cultivar?: string;
    DBH?: number;
    SpaceStatus?: string;
    RemovedDate?: number;
  };
}

/** Arlington, MA bbox. Roughly 42.39–42.44 N / -71.20 – -71.13 W. */
function inArlingtonMaBbox(lng: number, lat: number): boolean {
  return lat >= 42.37 && lat <= 42.46 && lng >= -71.23 && lng <= -71.10;
}

const config: ImportConfig<ArlFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Town of Arlington, MA Public Shade Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'Town of Arlington, MA Public Shade Trees inventory (~11.3k trees) ' +
    'maintained by the Arlington Tree Warden / DPW. Source publishes ' +
    'Genus + Species separately, CommonName, Cultivar, DBH, and ' +
    'maintenance fields. We filter out rows with a non-null ' +
    'RemovedDate. AGOL item carries no explicit CC license — treated ' +
    'as public-with-attribution per Town of Arlington publication.',
  regionName: REGION_NAME,
  license: 'Public (Town of Arlington, MA; no explicit CC license)',
  async fetchAll() {
    // Drop rows with a populated RemovedDate (live trees only).
    const where = 'RemovedDate IS NULL';
    return fetchArcGisLayer({ url: ENDPOINT, where }) as Promise<ArlFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inArlingtonMaBbox(lng, lat)) return null;

    const genus = (f.properties?.Genus ?? '').trim();
    const species = (f.properties?.Species ?? '').trim();
    const latin = genus && species ? `${genus} ${species}` : genus;
    const common = (f.properties?.CommonName ?? '').trim();
    if (!latin && !common) return null;

    return {
      externalId: String(
        f.properties?.OBJECTID ??
          f.properties?.AssetID ??
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
  console.error('Arlington MA trees import failed:', err);
  process.exit(1);
});
