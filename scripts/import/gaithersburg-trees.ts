// City of Gaithersburg, MD — Street Trees inventory.
// ~11.5k inventoried street trees on city-managed land, published as a
// public view feature service on the city's AGOL org (owner=
// ykim_GaithersburgMD).
//
// Source page: https://www.arcgis.com/home/item.html?id=8450e6c3992d4e8e9d0f3df4fd2722dd
// REST API:    services1.arcgis.com/oYaMaMY9WlGtyT0U/.../Street_Trees_View/FeatureServer/0
// License:     City of Gaithersburg public open data; no explicit CC
//              license string on the AGOL item. Treated as public-with-
//              attribution per City of Gaithersburg publication.
// Refresh:     2026-05-11 verified count = 11,469.
//
// Schema notes:
//   - Botanical_Name holds the canonical Latin binomial.
//   - Common_Name holds the common name.
//   - Tree_ID is the city's stable identifier.
//
// Run: npm run import:gaithersburg-trees
// Pre-req: a 'Gaithersburg public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'gaithersburg-street-trees';
const LAYER_URL =
  'https://services1.arcgis.com/oYaMaMY9WlGtyT0U/arcgis/rest/services/Street_Trees_View/FeatureServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Gaithersburg public';

interface GaiFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    Tree_ID?: number;
    Botanical_Name?: string;
    Common_Name?: string;
    Location?: string;
    DBH?: number;
    Condition?: string;
    GlobalID?: string;
  };
}

/** Gaithersburg, MD bbox. Roughly 39.10–39.21 N / -77.27 – -77.13 W. */
function inGaithersburgBbox(lng: number, lat: number): boolean {
  return lat >= 39.05 && lat <= 39.25 && lng >= -77.30 && lng <= -77.10;
}

const config: ImportConfig<GaiFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'City of Gaithersburg, MD Street Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of Gaithersburg, MD street tree inventory (~11.5k trees) ' +
    'maintained by City forestry staff. Source publishes Botanical_Name ' +
    '(Latin binomial), Common_Name, Location, DBH, and Condition. ' +
    'AGOL item carries no explicit Creative Commons license — treated ' +
    'as public-with-attribution per City of Gaithersburg publication.',
  regionName: REGION_NAME,
  license: 'Public (City of Gaithersburg, MD; no explicit CC license)',
  async fetchAll() {
    return fetchArcGisLayer({ url: ENDPOINT }) as Promise<GaiFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inGaithersburgBbox(lng, lat)) return null;

    const latin = (f.properties?.Botanical_Name ?? '').trim();
    const common = (f.properties?.Common_Name ?? '').trim();
    if (!latin && !common) return null;

    return {
      externalId: String(
        f.properties?.OBJECTID ??
          f.properties?.Tree_ID ??
          f.properties?.GlobalID ??
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
  console.error('Gaithersburg trees import failed:', err);
  process.exit(1);
});
