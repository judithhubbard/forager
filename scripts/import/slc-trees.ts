// Salt Lake City — Urban Forestry Inventory. ~110k public trees
// (street + parks), maintained by SLC Public Lands Urban Forestry.
// Owner=brandon.fleming_slcgov, AGOL Public.
//
// Source page: https://www.slc.gov/parks/urban-forestry/
// REST API:    services.arcgis.com/mMBpeYj0vPFotzbe/.../Urban_Forestry_Inventory/FeatureServer/0
// License:     Salt Lake City open data (permissive, attribution)
// Refresh:     2026-05-10 verified count = 110,292
//
// Schema notes: source has SPP (full Latin binomial — "Zelkova
// serrata"), DBH, ADDRESS, STREET. No common name. Some cultivars
// are appended in single quotes ("Acer rubrum 'Autumn Flame'") and
// stripped by normalizeSpeciesName upstream.
//
// Note: UT FFSL Urban Tree Inventory (state-level aggregator) already
// has 798 SLC pins (~8% of expected) — keeping it as a low-yield
// source since the city's own feed is much more complete (10x more
// trees) and authoritative.
//
// Run: npm run import:slc-trees
// Pre-req: a 'Salt Lake City public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'slc-urban-forestry-inventory';
const LAYER_URL =
  'https://services.arcgis.com/mMBpeYj0vPFotzbe/arcgis/rest/services/Urban_Forestry_Inventory/FeatureServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Salt Lake City public';

interface SlcFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    FID?: number;
    SPP?: string;       // "Zelkova serrata"
    DBH?: string;
    ADDRESS?: number;
    STREET?: string;
    SIDE?: string;
    SITE?: number;
    Vacant?: string;
  };
}

/** Salt Lake City bbox (~20km, narrow due to mountains east/north).
 *  City sits around 40.76 N, -111.89 W. */
function inSLCBbox(lng: number, lat: number): boolean {
  return lat >= 40.62 && lat <= 40.86 && lng >= -112.00 && lng <= -111.75;
}

const config: ImportConfig<SlcFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Salt Lake City Urban Forestry Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'Salt Lake City Public Lands Urban Forestry tree inventory ' +
    '(~110k street + park trees) with full Latin binomial in SPP, ' +
    'DBH, and street address. Cultivars in quotes are stripped ' +
    'upstream. Salt Lake City open data (permissive, attribution).',
  regionName: REGION_NAME,
  license: 'Salt Lake City open data',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      // Skip vacant planting sites — they have SPP populated as
      // "Vacant" in some rows. The Vacant field is also set.
      where: "SPP IS NOT NULL AND SPP <> '' AND (Vacant IS NULL OR Vacant = '' OR Vacant = 'N')"
    }) as Promise<SlcFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inSLCBbox(lng, lat)) return null;
    const spp = f.properties?.SPP?.trim();
    if (!spp) return null;
    // Skip vacant / stump / removed sentinel values.
    const upper = spp.toUpperCase();
    if (
      upper === 'VACANT' ||
      upper === 'STUMP' ||
      upper === 'REMOVED' ||
      upper === 'UNKNOWN' ||
      upper === 'OTHER'
    ) {
      return null;
    }
    return {
      // FID is the OBJECTID equivalent for this layer.
      externalId: String(
        f.properties?.FID ??
          `${lng.toFixed(6)},${lat.toFixed(6)}`
      ),
      scientificName: spp,
      lng,
      lat,
      raw: f as unknown as Record<string, unknown>
    };
  }
};

runImport(config).catch((err) => {
  console.error('Salt Lake City trees import failed:', err);
  process.exit(1);
});
