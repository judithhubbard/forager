// Iowa City (IA) Parks Tree Plotter inventory — owned by City of
// Iowa City Parks & Recreation. The Iowa DNR state aggregator only
// has 269 Iowa City pins (vs. ~75k pop = ~3.7k expected), so this
// city-owned feed fills the big gap.
//
// Source page: https://www.icgov.org/government/departments-and-divisions/parks-and-recreation
// REST API:    maps.iowa-city.org/server/rest/services/Parks/Parks_Tree_Plotter/FeatureServer/0
// License:     City of Iowa City open data (permissive, attribution)
// Refresh:     2026-05-10 verified count = 45,376
//
// Schema notes: layer exposes both LatinName (full binomial like
// "Gleditsia triacanthos") and CommonName ("Skyline Locust"). Sample
// rows have LatinName populated for street/park trees; we feed
// scientificName first and fall back to commonName for the matcher.
// Coordinates verified inside Iowa City bbox (~41.66 N, -91.52 W).
//
// Run: npm run import:iowa-city-trees
// Pre-req: an 'Iowa City public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'iowa-city-parks-trees';
const LAYER_URL =
  'https://maps.iowa-city.org/server/rest/services/Parks/Parks_Tree_Plotter/FeatureServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Iowa City public';

interface IcFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    PrimaryID?: number;
    Cartegraph_ID?: string;
    CommonName?: string;
    LatinName?: string;
    Genus?: string;
    Status?: string;     // 'Alive', 'Dead', 'Stump', etc.
    Archived?: string;   // 'No' / 'Yes'
    DBH?: number;
    Latitude?: number;
    Longitude?: number;
  };
}

/** Iowa City metro bbox (~20km around city center, 41.66 N, -91.52 W).
 *  Filters (0,0) and any stray bogus coords. */
function inIowaCityBbox(lng: number, lat: number): boolean {
  return lat >= 41.55 && lat <= 41.78 && lng >= -91.70 && lng <= -91.40;
}

const config: ImportConfig<IcFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Iowa City Parks Tree Plotter Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of Iowa City Parks & Recreation tree inventory (Tree ' +
    'Plotter, ~45k trees) covering city-owned ROW and parks. The ' +
    'Iowa DNR state aggregator only has ~270 pins inside Iowa City, ' +
    'so this fills the city-level coverage gap. ' +
    'City of Iowa City open data (permissive, attribution).',
  regionName: REGION_NAME,
  license: 'City of Iowa City open data',
  async fetchAll() {
    // Exclude archived/dead trees server-side. Empty LatinName rows
    // will still come through but get filtered below — matcher needs
    // a scientific or common name.
    return fetchArcGisLayer({
      url: ENDPOINT,
      where: "Archived <> 'Yes' AND Status <> 'Dead' AND Status <> 'Stump' AND Status <> 'Removed'"
    }) as Promise<IcFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0] ?? f.properties?.Longitude);
    const lat = Number(c?.[1] ?? f.properties?.Latitude);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inIowaCityBbox(lng, lat)) return null;
    const latin = f.properties?.LatinName?.trim();
    const common = f.properties?.CommonName?.trim();
    if (!latin && !common) return null;
    return {
      externalId: String(
        f.properties?.PrimaryID ??
          f.properties?.Cartegraph_ID ??
          f.properties?.OBJECTID ??
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
  console.error('Iowa City trees import failed:', err);
  process.exit(1);
});
