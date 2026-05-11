// Trees Atlanta — public plant inventory (non-profit; their data is
// labeled as "the public tree inventory map viewable on the TA
// website"). ~121k trees, every tree they have planted since 1985,
// owner=Data_TA, set to AGOL Public access.
//
// Source page: https://www.treesatlanta.org/resources/tree-inventory/
// REST API:    services6.arcgis.com/BZn8g8tzu5WfMokL/.../Trees_Atlanta_Plant_Inventory_Public_View/FeatureServer/0
// License:     Trees Atlanta public data (AGOL public, attribution to TA)
// Refresh:     2026-05-10 verified count = 121,316
//
// Schema notes: source has separate Genus and Species (epithet) fields
// — we concatenate to build the binomial ("Chionanthus" + "retusus" →
// "Chionanthus retusus"). Cultivar is its own field and is dropped by
// normalizeSpeciesName upstream. This existing 'dryad-trees-atlanta'
// covers Atlanta partially (7.6k in bbox); Trees Atlanta is the full
// city-wide neighborhood-tree dataset.
//
// Run: npm run import:atlanta-trees
// Pre-req: an 'Atlanta public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'trees-atlanta-plant-inventory';
const LAYER_URL =
  'https://services6.arcgis.com/BZn8g8tzu5WfMokL/arcgis/rest/services/Trees_Atlanta_Plant_Inventory_Public_View/FeatureServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Atlanta public';

interface AtlFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    GlobalID?: string;
    PlantingSeason?: string;
    Genus?: string;
    Species?: string;    // epithet only, e.g. "retusus"
    Cultivar?: string;
    Neighborhood?: string;
    StreetPark?: string;
    Status?: string;     // "Alive", "Dead", "Removed"
  };
}

/** Atlanta metro bbox (~30km around city center). City sits around
 *  33.75 N, -84.39 W; covers Buckhead through south Atlanta. */
function inAtlantaBbox(lng: number, lat: number): boolean {
  return lat >= 33.65 && lat <= 33.89 && lng >= -84.55 && lng <= -84.28;
}

const config: ImportConfig<AtlFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Trees Atlanta Public Plant Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'Trees Atlanta non-profit plant inventory (~121k trees planted ' +
    'since 1985). Source publishes Genus and Species as separate ' +
    'fields — we concatenate to build the Latin binomial. Cultivar ' +
    'is stripped upstream by normalizeSpeciesName. AGOL Public ' +
    '(attribution: Trees Atlanta).',
  regionName: REGION_NAME,
  license: 'Trees Atlanta public data',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      // Only Alive trees. Trees Atlanta marks dead/removed via Status.
      where: "Genus IS NOT NULL AND Genus <> '' AND Species IS NOT NULL AND Species <> '' AND (Status IS NULL OR Status = 'Alive' OR Status = '')"
    }) as Promise<AtlFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inAtlantaBbox(lng, lat)) return null;
    const genus = f.properties?.Genus?.trim();
    const species = f.properties?.Species?.trim();
    if (!genus) return null;
    // Build binomial. If species is missing, fall back to genus only —
    // matchSpecies's genus fallback handles "Acer species"-style records
    // for safe-fallback genera.
    const latin = species ? `${genus} ${species}` : `${genus} species`;
    return {
      externalId: String(
        f.properties?.OBJECTID ??
          f.properties?.GlobalID ??
          `${lng.toFixed(6)},${lat.toFixed(6)}`
      ),
      scientificName: latin,
      lng,
      lat,
      raw: f as unknown as Record<string, unknown>
    };
  }
};

runImport(config).catch((err) => {
  console.error('Atlanta (Trees Atlanta) import failed:', err);
  process.exit(1);
});
