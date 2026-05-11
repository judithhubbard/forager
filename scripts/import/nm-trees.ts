// New Mexico Community Data Collaborative — STATE-LEVEL aggregator
// export of the Tree Plotter NewMexico dataset (pg-cloud.com/NewMexico).
// ~12,431 trees as a static AGOL feature service. May-2019 snapshot;
// no newer public version found as of 2026-05-10.
//
// Source page: https://nmcdc.maps.arcgis.com/ (NMCDC AGOL org)
// REST API:    services.arcgis.com/.../NM_PublicTree_Map/FeatureServer/0
// License:     NMCDC public data (permissive; attribution to NMCDC)
// Refresh:     2026-05-10 verified count = 12,431
//
// Schema is clean: SPECIES_LA (latin binomial), SPECIES_01 (common
// name), CITY, LAT, LNG. Geometry coordinates match the LAT/LNG
// attributes to 7+ decimals — we use the geometry directly.
//
// Run: npm run import:nm-trees
// Pre-req: a 'New Mexico public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'nm-nmcdc-tree-plotter';
const ENDPOINT =
  'https://services.arcgis.com/LGtNQDlIZBdntoA9/arcgis/rest/services/NM_PublicTree_Map/FeatureServer/0/query';
const REGION_NAME = 'New Mexico public';

interface NmFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    CITY?: string;
    SPECIES_LA?: string;
    SPECIES_01?: string;
    LAT?: number;
    LNG?: number;
  };
}

/** New Mexico rough bbox. */
function inNewMexicoBbox(lng: number, lat: number): boolean {
  return lat >= 31.2 && lat <= 37.1 && lng >= -109.1 && lng <= -103.0;
}

const config: ImportConfig<NmFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'New Mexico Tree Plotter Export (NMCDC)',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'New Mexico Community Data Collaborative export of the ' +
    'pg-cloud.com/NewMexico Tree Plotter dataset (~12,431 trees, ' +
    'May 2019 snapshot). Public AGOL feature service.',
  regionName: REGION_NAME,
  license: 'NMCDC public data',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      where: "SPECIES_LA IS NOT NULL AND SPECIES_LA <> ''"
    }) as Promise<NmFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    // Geometry is the canonical source. Fall back to LAT/LNG attributes
    // only if geometry is missing.
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0] ?? f.properties?.LNG);
    const lat = Number(c?.[1] ?? f.properties?.LAT);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inNewMexicoBbox(lng, lat)) return null;
    const latin = f.properties?.SPECIES_LA?.trim();
    if (!latin) return null;
    return {
      externalId: String(f.properties?.OBJECTID ?? `${lng.toFixed(6)},${lat.toFixed(6)}`),
      scientificName: latin,
      commonName: f.properties?.SPECIES_01?.trim() || undefined,
      lng,
      lat,
      raw: f as unknown as Record<string, unknown>
    };
  }
};

runImport(config).catch((err) => {
  console.error('New Mexico trees import failed:', err);
  process.exit(1);
});
