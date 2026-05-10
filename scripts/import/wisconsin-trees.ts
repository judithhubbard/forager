// Wisconsin DNR Community Trees — STATE-LEVEL aggregator covering
// 200+ Wisconsin municipalities in one feed. The DNR's Community Tree
// Map publishes the pooled inventory as a public ArcGIS Feature Service.
//
// Source page: https://pg-cloud.com/Wisconsin/
// REST API:    services5.arcgis.com/.../WI_Municipal_Trees_10_8_24/FeatureServer/0
// License:     Wisconsin Open Data (permissive; attribution to WI DNR)
// Refresh:     2026-03-24 (updated periodically by WI DNR)
//
// ~1.13M trees across all participating WI municipalities. Single
// ingest replaces hundreds of individual city scrapes — covers zone
// 4a/4b/5a/5b upper Midwest gap (Madison, Milwaukee, Green Bay, etc.).
//
// Schema is clean: Latin_Name + Common_Name + Latitude + Longitude +
// Community (municipality name) + Cultivar. We use the attribute
// Latitude/Longitude (WGS84) instead of geometry because the feature
// service's geometry is Web Mercator and the extent metadata is
// inconsistent across records.
//
// Run: npm run import:wisconsin-trees
// Pre-req: a 'Wisconsin public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'wi-dnr-municipal-trees';
const ENDPOINT =
  'https://services5.arcgis.com/Ul9AyFFeFTjf08DW/arcgis/rest/services/WI_Municipal_Trees_10_8_24/FeatureServer/0/query';
const REGION_NAME = 'Wisconsin public';

interface WiFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    Primary_ID?: number;
    ObjectId?: number;
    Latin_Name?: string;
    Common_Name?: string;
    Cultivar?: string;
    Community?: string;
    Latitude?: number;
    Longitude?: number;
  };
}

const config: ImportConfig<WiFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Wisconsin DNR Community Trees',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'Wisconsin DNR Community Tree Map — pooled inventory across ' +
    '200+ WI municipalities (~1.13M trees). Single state-level ' +
    'aggregator feed. WI Open Data terms.',
  regionName: REGION_NAME,
  license: 'Wisconsin Open Data',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      where: 'Latin_Name IS NOT NULL'
    }) as Promise<WiFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    // Prefer attribute lat/lng (WGS84); geometry is Web Mercator and
    // less consistent across records.
    const lng = Number(f.properties?.Longitude);
    const lat = Number(f.properties?.Latitude);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;  // sentinel "no location" rows
    const latin = f.properties?.Latin_Name?.trim();
    if (!latin) return null;
    return {
      externalId: String(f.properties?.Primary_ID ?? f.properties?.ObjectId ?? `${lng.toFixed(6)},${lat.toFixed(6)}`),
      scientificName: latin,
      commonName: f.properties?.Common_Name,
      lng,
      lat,
      raw: f as unknown as Record<string, unknown>
    };
  }
};

runImport(config).catch((err) => {
  console.error('Wisconsin trees import failed:', err);
  process.exit(1);
});
