// City of Wichita, KS — Street Trees (Public).
// ~2.8k inventoried street trees on city-managed land, published as a
// public hosted feature service. The AGOL item is owned by a third-
// party Cityworks integrator (owner=rjlanzrath); spot-check of bbox
// places the data in Wichita, KS (~37.7 N, -97.1 W).
//
// Source page: https://www.arcgis.com/home/item.html?id=7a64fbc6d33d4e959629d3283bb64ab9
// REST API:    services3.arcgis.com/W4V2MNpny4Y5fqqM/.../Street_Trees_(Public)/FeatureServer/0
// License:     City of Wichita, KS public open data; no explicit CC
//              license string. Treated as public-with-attribution.
// Refresh:     2026-05-11 verified count = 2,844. NOTE: many rows have
//              null GENUS/SPECIES/NAME — only a fraction are fully
//              identified.
//
// Schema notes:
//   - GENUS + SPECIES are separate fields (often null).
//   - NAME holds the common name (e.g. "Honey-Locust").
//
// Run: npm run import:wichita-trees
// Pre-req: a 'Wichita public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'wichita-street-trees';
const LAYER_URL =
  'https://services3.arcgis.com/W4V2MNpny4Y5fqqM/arcgis/rest/services/Street_Trees_(Public)/FeatureServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Wichita public';

interface WichFeature {
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
    Asset_ID?: string;
  };
}

/** Wichita, KS bbox. City sits at 37.6872 N, -97.3375 W. Pad to
 *  cover the metro. */
function inWichitaBbox(lng: number, lat: number): boolean {
  return lat >= 37.50 && lat <= 37.90 && lng >= -97.55 && lng <= -97.00;
}

const config: ImportConfig<WichFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'City of Wichita, KS Street Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of Wichita, KS street tree inventory (~2.8k trees) maintained ' +
    'via Cityworks. Source publishes GENUS + SPECIES (separate; often ' +
    'null), NAME (common name like "Honey-Locust"), DIAMETER, and ' +
    'CONDITION. AGOL item has no explicit CC license — treated as ' +
    'public-with-attribution per City of Wichita publication. (Owner ' +
    'is a third-party Cityworks integrator AGOL account; bbox ' +
    'placement at ~37.7 N, -97.1 W confirms Wichita, KS.)',
  regionName: REGION_NAME,
  license: 'Public (City of Wichita, KS; no explicit CC license)',
  async fetchAll() {
    return fetchArcGisLayer({ url: ENDPOINT }) as Promise<WichFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inWichitaBbox(lng, lat)) return null;

    const genus = (f.properties?.GENUS ?? '').trim();
    const species = (f.properties?.SPECIES ?? '').trim();
    const latin = genus && species ? `${genus} ${species}` : genus;
    const common = (f.properties?.NAME ?? '').trim();
    if (!latin && !common) return null;

    return {
      externalId: String(
        f.properties?.OBJECTID ??
          f.properties?.FACILITYID ??
          f.properties?.Asset_ID ??
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
  console.error('Wichita trees import failed:', err);
  process.exit(1);
});
