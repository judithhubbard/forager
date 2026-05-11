// Vermont ANR Municipal Tree Inventory — STATE-LEVEL aggregator from
// the VT Urban & Community Forestry Program (owner=vtanrgis).
// ~31,904 trees across participating VT municipalities.
//
// Source page: https://vtcommunityforestry.org/tools-and-resources/community-tree-inventory-data
// REST API:    anrmaps.vermont.gov/.../OPENDATA_ANR_ECOLOGIC_SP_NOCACHE_v1/MapServer/40
// License:     Vermont open data (permissive; attribution to VT ANR)
// Refresh:     2026-05-10 verified count = 31,904
//
// Endpoint quirk: VT publishes this on its own ArcGIS Server
// (anrmaps.vermont.gov) as a *MapServer* layer rather than the
// AGOL-style FeatureServer most other states use. The /query endpoint
// shape is identical though, and our fetchArcGisLayer helper handles
// both top-level and properties-level exceededTransferLimit flags, so
// no special-casing is required.
//
// Schema: SPECIES (common name in ALL CAPS, e.g. "NORTHERN RED OAK"),
// TOWN, Diameter, ConditionID, Long, Lat. No latin binomial in the
// source — we rely on common-name matching via the species catalog.
// Lowercase the SPECIES at map time so matchSpecies's norm() lines up.
//
// Run: npm run import:vt-trees
// Pre-req: a 'Vermont public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'vt-anr-municipal-tree-inventory';
const ENDPOINT =
  'https://anrmaps.vermont.gov/arcgis/rest/services/Open_Data/OPENDATA_ANR_ECOLOGIC_SP_NOCACHE_v1/MapServer/40/query';
const REGION_NAME = 'Vermont public';

interface VtFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    Project?: string;
    TOWN?: string;
    TreeNum?: number;
    SPECIES?: string;
    Diameter?: string;
    ConditionID?: string;
    Lat?: number;
    Long?: number;
    GlobalID?: string;
    Remove?: string | null;
  };
}

/** Vermont rough bbox. */
function inVermontBbox(lng: number, lat: number): boolean {
  return lat >= 42.7 && lat <= 45.1 && lng >= -73.5 && lng <= -71.4;
}

/** Title-case "NORTHERN RED OAK" → "Northern red oak" so the species
 *  catalog common-name match (which lowercases both sides) finds it
 *  and we end up with a readable string in raw too. The matcher is
 *  case-insensitive, but we still want the import_raw to be human-
 *  readable when audited. */
function tidyCommon(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (!s) return undefined;
  // Already mixed case? Leave it alone.
  if (s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .replace(/(^|\s)\w/g, (m) => m.toUpperCase());
}

const config: ImportConfig<VtFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Vermont ANR Municipal Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'Vermont Agency of Natural Resources / Urban & Community ' +
    'Forestry Program municipal tree inventory (~31,904 trees ' +
    'across participating VT towns). Vermont open data.',
  regionName: REGION_NAME,
  license: 'Vermont open data',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      where: "SPECIES IS NOT NULL AND SPECIES <> ''"
    }) as Promise<VtFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0] ?? f.properties?.Long);
    const lat = Number(c?.[1] ?? f.properties?.Lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inVermontBbox(lng, lat)) return null;

    // Skip rows the maintainer flagged for removal.
    const remove = f.properties?.Remove?.toString().toLowerCase().trim();
    if (remove === 'yes' || remove === 'true' || remove === '1') return null;

    const common = tidyCommon(f.properties?.SPECIES);
    if (!common) return null;
    return {
      externalId: String(f.properties?.OBJECTID ?? f.properties?.GlobalID ?? `${lng.toFixed(6)},${lat.toFixed(6)}`),
      commonName: common,
      lng,
      lat,
      raw: f as unknown as Record<string, unknown>
    };
  }
};

runImport(config).catch((err) => {
  console.error('Vermont trees import failed:', err);
  process.exit(1);
});
