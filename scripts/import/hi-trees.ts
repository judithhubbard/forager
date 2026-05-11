// Hawaii — USFS Region 5 Citizen Forester "Tree Inventory" layer.
// Partial-state coverage (Oahu); ~18,811 trees in a single AGOL
// feature service. Related to the pg-cloud.com/hawaii Tree Plotter
// portal but not gated. Not run by HI DOFAW directly — this is the
// USFS-hosted citizen-forester contribution layer that backs the
// public Hawaii Tree Map.
//
// Source page: https://www.fs.usda.gov/r5 (USFS Region 5)
// REST API:    services1.arcgis.com/.../Tree_Inventory/FeatureServer/0
// License:     USFS R5 public data (permissive; attribution to
//              USFS Region 5 / Hawaii Citizen Forester program)
// Refresh:     2026-05-10 verified count = 18,811
//
// Schema: Botanical (latin binomial), Common_Nam (common name —
// truncated 10-char field name from underlying shapefile), Primary_ID,
// Latitude, Longitude, DSH, Height, Condition. Geometry is WGS84.
//
// Run: npm run import:hi-trees
// Pre-req: a 'Hawaii public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'hi-usfs-r5-citizen-forester-trees';
const ENDPOINT =
  'https://services1.arcgis.com/gGHDlz6USftL5Pau/arcgis/rest/services/Tree_Inventory/FeatureServer/0/query';
const REGION_NAME = 'Hawaii public';

interface HiFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    FID?: number;
    Primary_ID?: number;
    Botanical?: string;
    Common_Nam?: string;
    Latitude?: number;
    Longitude?: number;
    Condition?: string;
  };
}

/** Hawaii rough bbox — spans the entire island chain incl Kauai west
 *  and the Big Island east. */
function inHawaiiBbox(lng: number, lat: number): boolean {
  return lat >= 18.5 && lat <= 22.5 && lng >= -160.5 && lng <= -154.5;
}

const config: ImportConfig<HiFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Hawaii USFS R5 Citizen Forester Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'USFS Region 5 / Hawaii Citizen Forester tree inventory ' +
    '(~18,811 trees, Oahu focus). Partial-state coverage; the ' +
    'public layer that backs the Hawaii Tree Map. USFS public data.',
  regionName: REGION_NAME,
  license: 'USFS Region 5 public data',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      where: "Botanical IS NOT NULL AND Botanical <> ''"
    }) as Promise<HiFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0] ?? f.properties?.Longitude);
    const lat = Number(c?.[1] ?? f.properties?.Latitude);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inHawaiiBbox(lng, lat)) return null;
    const latin = f.properties?.Botanical?.trim();
    if (!latin) return null;
    return {
      externalId: String(f.properties?.Primary_ID ?? f.properties?.FID ?? `${lng.toFixed(6)},${lat.toFixed(6)}`),
      scientificName: latin,
      commonName: f.properties?.Common_Nam?.trim() || undefined,
      lng,
      lat,
      raw: f as unknown as Record<string, unknown>
    };
  }
};

runImport(config).catch((err) => {
  console.error('Hawaii trees import failed:', err);
  process.exit(1);
});
