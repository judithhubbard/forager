// City of Boulder, CO — Parks & Recreation tree inventory. ~50k trees
// published as part of Boulder's open-data program. Hosted on the
// City's own ArcGIS Server farm (gis.bouldercolorado.gov) and indexed
// on ArcGIS Online (owner: BoulderCO, item dbbae8bdb0a44d17934243b88e85ef2b).
//
// Source page: https://open-data.bouldercolorado.gov/
// REST API:    gis.bouldercolorado.gov/ags_svr2/.../TreesOpenData/MapServer/0
// License:     CC0 1.0 Public Domain Dedication (explicit on AGOL item)
// Refresh:     2026-05-11 verified count = 50,024
//
// Schema notes: source publishes both LATINNAME (binomial without
// cultivar) and a COMMONNAME in "common, modifier" form like Raleigh
// ("Ash, Green", "Maple, Sugar"). LATINNAME is the primary signal;
// the reorder fallback only fires when LATINNAME is missing/empty.
//
// Run: npm run import:boulder-trees
// Pre-req: a 'Boulder public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'boulder-parksrec-trees';
const LAYER_URL =
  'https://gis.bouldercolorado.gov/ags_svr2/rest/services/parks/TreesOpenData/MapServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Boulder public';

interface BldFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    FACILITYID?: string;
    LATINNAME?: string;
    GENUS?: string;
    CULTIVAR?: string;
    COMMONNAME?: string;
    SPECIESCD?: string;
    ADDRESS?: string;
    LOCTYPE?: string;
    SITETYPE?: string;
    GLOBALID?: string;
  };
}

/** Boulder bbox. City sits roughly 39.99 N, -105.27 W. AGOL extent
 *  declared as 39.96–40.09 / -105.34 – -105.18; we pad slightly for
 *  outlying open-space trees but stay tight enough to exclude bogus
 *  zeros or out-of-state coordinates. */
function inBoulderBbox(lng: number, lat: number): boolean {
  return lat >= 39.94 && lat <= 40.12 && lng >= -105.40 && lng <= -105.14;
}

/** Reorder "ash, green" → "green ash" so the common-name path can
 *  match our catalog (natural-order common names). matchSpecies
 *  normalises case. */
function reorderCommon(name: string): string {
  const idx = name.indexOf(',');
  if (idx < 0) return name.trim();
  const head = name.slice(0, idx).trim();
  const tail = name.slice(idx + 1).trim();
  if (!tail) return head;
  return `${tail} ${head}`;
}

const config: ImportConfig<BldFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Boulder Parks & Recreation Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of Boulder, CO Parks & Recreation tree inventory (~50k trees). ' +
    'Source publishes LATINNAME (binomial without cultivar) plus a ' +
    'comma-modifier COMMONNAME ("Ash, Green"); we use Latin as primary ' +
    'and reorder the common-name fallback. Licensed CC0 1.0 (public domain).',
  regionName: REGION_NAME,
  license: 'CC0 1.0',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      where: "LATINNAME IS NOT NULL AND LATINNAME <> ''"
    }) as Promise<BldFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inBoulderBbox(lng, lat)) return null;

    const latin = (f.properties?.LATINNAME ?? '').trim();
    const commonRaw = (f.properties?.COMMONNAME ?? '').trim();
    const common = commonRaw ? reorderCommon(commonRaw) : undefined;
    if (!latin && !common) return null;

    return {
      externalId: String(
        f.properties?.OBJECTID ??
          f.properties?.GLOBALID ??
          f.properties?.FACILITYID ??
          `${lng.toFixed(6)},${lat.toFixed(6)}`
      ),
      scientificName: latin || undefined,
      commonName: common,
      lng,
      lat,
      raw: f as unknown as Record<string, unknown>
    };
  }
};

runImport(config).catch((err) => {
  console.error('Boulder trees import failed:', err);
  process.exit(1);
});
