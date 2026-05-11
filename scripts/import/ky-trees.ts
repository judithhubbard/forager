// Kentucky Statewide Tree Inventory — STATE-LEVEL aggregator owned
// by the Kentucky Division of Forestry (abe.nielsen_kygis on AGOL).
// ~9,945 trees on the layer "Tree_Inventory11" v1.1. licenseInfo on
// the service is "Public Access, data sharing encouraged".
//
// Source page: https://eec.ky.gov/Natural-Resources/Forestry/Pages/default.aspx
// REST API:    services.arcgis.com/.../Tree_Inventory11/FeatureServer/0
// License:     Kentucky public access — data sharing encouraged
// Refresh:     2026-05-10 verified count = 9,945
//
// Schema: Species (combined string "Acer rubrum - red maple" — latin
// hyphen common), Status, Quantity, DBH, Notes. We split Species on
// " - " to recover the latin binomial; everything before the dash is
// scientific name, everything after is common name. A handful of rows
// have only one half present — fall back to whichever is available.
//
// Run: npm run import:ky-trees
// Pre-req: a 'Kentucky public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'ky-statewide-tree-inventory';
const ENDPOINT =
  'https://services.arcgis.com/TosFUe3nXUAksqSj/arcgis/rest/services/Tree_Inventory11/FeatureServer/0/query';
const REGION_NAME = 'Kentucky public';

interface KyFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    GlobalID?: string;
    Status?: string;
    Quantity?: number;
    Species?: string;
  };
}

/** Kentucky rough bbox (also covers the Cincinnati-edge Boone County
 *  contributions that land just north of the state line). */
function inKentuckyBbox(lng: number, lat: number): boolean {
  return lat >= 36.4 && lat <= 39.2 && lng >= -89.7 && lng <= -81.9;
}

/** Split "Acer rubrum - red maple" into {latin, common}. Returns
 *  whichever half is non-empty — many rows have the full pair, but
 *  some rows in the inventory have just one half or different
 *  separators ("Acer rubrum", "red maple", or " : " in a few). */
function splitSpecies(raw: string): { latin?: string; common?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  // Most rows use " - " as separator. Also tolerate " – " (en-dash)
  // and " — " (em-dash) which appear in a small number of entries.
  const m = trimmed.split(/\s+[-–—:]\s+/);
  if (m.length >= 2) {
    const latin = m[0].trim();
    const common = m.slice(1).join(' - ').trim();
    return { latin: latin || undefined, common: common || undefined };
  }
  // Single-token entry — guess whether it's a latin binomial (lowercase
  // species epithet) or a common name (multi-word lowercase / unknown).
  if (/^[A-Z][a-z]+\s+[a-z]+/.test(trimmed)) {
    return { latin: trimmed };
  }
  return { common: trimmed };
}

const config: ImportConfig<KyFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Kentucky Statewide Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'Kentucky Division of Forestry statewide tree inventory ' +
    '(~9,945 trees). Public access, data sharing encouraged ' +
    '(licenseInfo on the source service).',
  regionName: REGION_NAME,
  license: 'Kentucky public access — data sharing encouraged',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      where: "Species IS NOT NULL AND Species <> ''"
    }) as Promise<KyFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inKentuckyBbox(lng, lat)) return null;

    const status = f.properties?.Status?.toLowerCase();
    // Skip stumps, dead, removed and other non-living statuses.
    if (status && /stump|dead|removed|gone|missing/.test(status)) return null;

    const species = f.properties?.Species;
    if (!species) return null;
    const { latin, common } = splitSpecies(species);
    if (!latin && !common) return null;

    return {
      externalId: String(f.properties?.OBJECTID ?? f.properties?.GlobalID ?? `${lng.toFixed(6)},${lat.toFixed(6)}`),
      scientificName: latin,
      commonName: common,
      lng,
      lat,
      raw: f as unknown as Record<string, unknown>
    };
  }
};

runImport(config).catch((err) => {
  console.error('Kentucky trees import failed:', err);
  process.exit(1);
});
