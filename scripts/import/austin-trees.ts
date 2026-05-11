// City of Austin, TX — Parks & Recreation Department (PARD) tree
// inventory. ~51k mature trees on Austin parkland (parks, greenbelts,
// trails, recreation facilities). Owned by City of Austin PARD GIS;
// published as a public-view hosted feature layer on the Austin
// AGOL org (owner=PARD.Administrator2).
//
// This is the Parks-only inventory, not Austin's downtown street-tree
// inventory (which is a separate 7.3k row historical snapshot under
// owner=ACAR.Administrator and would require separate effort). The
// PARD layer is the largest current Austin tree-point dataset.
//
// Source page: https://www.arcgis.com/home/item.html?id=fcde6a46536f4fbdbf9bcad588d38917
// REST API:    services.arcgis.com/0L95CJ0VTaxqcmED/.../Public_PARD_Tree_Inventory_View/FeatureServer/0
// License:     City of Austin Open Data Terms of Use apply (open data
//              under CC-attribution-style terms — see data.austintexas.gov
//              footer). The hosted-feature item has no explicit CC string
//              but is published as a public view layer. Treat as public-
//              with-attribution per City of Austin PARD publication.
// Refresh:     2026-05-11 verified count = 51,079.
//
// Schema notes:
//   - SCIENTIFIC_NAME is the canonical Latin binomial ("Quercus
//     macrocarpa", "Juniperus virginiana"). Clean and consistent.
//   - SPECIES_NAME holds the common name ("Bur oak", "Eastern red cedar").
//   - TREE_CODE is the iTree species code (4-5 chars). Not used by our
//     matchSpecies but carried in the raw record.
//   - LOCATION_NAME is the park / facility name.
//
// Run: npm run import:austin-trees
// Pre-req: an 'Austin public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'austin-pard-trees';
const LAYER_URL =
  'https://services.arcgis.com/0L95CJ0VTaxqcmED/arcgis/rest/services/Public_PARD_Tree_Inventory_View/FeatureServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Austin public';

interface AusFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    LOCATION_NAME?: string;
    TAG_NUMBER?: string;
    SPECIES_NAME?: string;
    SCIENTIFIC_NAME?: string;
    TREE_CODE?: string;
    DBH?: number;
    GlobalID?: string;
  };
}

/** Austin, TX bbox. City spans roughly 30.10–30.52 N and -97.92 –
 *  -97.55 W. Pad slightly to catch PARD trees in adjacent county
 *  parkland. */
function inAustinBbox(lng: number, lat: number): boolean {
  return lat >= 30.05 && lat <= 30.60 && lng >= -98.00 && lng <= -97.50;
}

const config: ImportConfig<AusFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'City of Austin, TX PARD Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of Austin, TX Parks & Recreation Department (PARD) tree ' +
    'inventory (~51k trees) covering city parkland, greenbelts, ' +
    'trails, and recreation facilities. Source publishes ' +
    'SCIENTIFIC_NAME (Latin binomial), SPECIES_NAME (common name), ' +
    'TREE_CODE (iTree species code), LOCATION_NAME (park/facility), ' +
    'and DBH. This is the largest current public Austin tree-point ' +
    'dataset; a separate ~7k downtown street-tree historical snapshot ' +
    'exists under a different owner but is not included here. ' +
    'AGOL item has no explicit CC string but is published as a ' +
    'public-view layer; treat as public-with-attribution under City ' +
    'of Austin Open Data Terms of Use.',
  regionName: REGION_NAME,
  license: 'Public (City of Austin PARD; Open Data Terms of Use, attribution required)',
  async fetchAll() {
    return fetchArcGisLayer({ url: ENDPOINT }) as Promise<AusFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inAustinBbox(lng, lat)) return null;

    const latin = (f.properties?.SCIENTIFIC_NAME ?? '').trim();
    const common = (f.properties?.SPECIES_NAME ?? '').trim();
    if (!latin && !common) return null;

    return {
      externalId: String(
        f.properties?.OBJECTID ??
          f.properties?.GlobalID ??
          f.properties?.TAG_NUMBER ??
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
  console.error('Austin PARD trees import failed:', err);
  process.exit(1);
});
