// City of Richardson, TX — Tree inventory (OpenData).
// ~4.5k inventoried trees on city-managed land, published on the
// City of Richardson's own ArcGIS Server (maps.cor.gov).
//
// Source page: https://www.arcgis.com/home/item.html?id=cd10a9e85354488dbdb697ce97ccb064
// REST API:    maps.cor.gov/arcgis/rest/services/OpenData/Trees/MapServer/0
// License:     City of Richardson public open data; no explicit CC
//              license string. Treated as public-with-attribution.
// Refresh:     2026-05-11 verified count = 4,533.
//
// Schema notes:
//   - GENUS + SPECIES are separate fields (SPECIES often null).
//   - NAME holds the common name ("Cedar Elm", "Live Oak").
//
// Run: npm run import:richardson-trees
// Pre-req: a 'Richardson public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'richardson-tx-trees';
const LAYER_URL =
  'https://maps.cor.gov/arcgis/rest/services/OpenData/Trees/MapServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Richardson public';

interface RichTxFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    FACILITYID?: string;
    NAME?: string;
    GENUS?: string;
    SPECIES?: string;
    DIAMETER?: number;
    CONDITION?: string;
  };
}

/** Richardson, TX bbox. City sits roughly 32.90–33.00 N / -96.80 – -96.65 W. */
function inRichardsonTxBbox(lng: number, lat: number): boolean {
  return lat >= 32.85 && lat <= 33.05 && lng >= -96.85 && lng <= -96.60;
}

const config: ImportConfig<RichTxFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'City of Richardson, TX Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of Richardson, TX tree inventory (~4.5k trees) on city-' +
    'managed land. Source publishes GENUS + SPECIES (separate; SPECIES ' +
    'often null), NAME (common name), DIAMETER, and CONDITION. ' +
    'Note: not to be confused with the Richardson, TX OpenTrees ' +
    'snapshot (already imported separately as opentrees-richardson). ' +
    'This is the current Cityworks-backed MapServer feed. AGOL item ' +
    'has no explicit CC license — treated as public-with-attribution.',
  regionName: REGION_NAME,
  license: 'Public (City of Richardson, TX; no explicit CC license)',
  async fetchAll() {
    return fetchArcGisLayer({ url: ENDPOINT }) as Promise<RichTxFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inRichardsonTxBbox(lng, lat)) return null;

    const genus = (f.properties?.GENUS ?? '').trim();
    const species = (f.properties?.SPECIES ?? '').trim();
    const latin = genus && species ? `${genus} ${species}` : genus;
    const common = (f.properties?.NAME ?? '').trim();
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
  console.error('Richardson TX trees import failed:', err);
  process.exit(1);
});
