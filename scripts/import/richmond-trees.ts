// City of Richmond, VA — Public Urban Forestry tree inventory.
// ~121k inventoried sites (live trees + vacant planting sites + stumps);
// we filter to ~75k live trees with usable Latin binomial species.
// Maintained by Richmond DPW Urban Forestry; published as the
// "TreeInventoryLive_ViewUFWebPage" feature service on the City's
// AGOL hosted org (owner=brad.duplantis@rva.gov_cor, org=cor).
//
// Source page: City of Richmond Urban Forestry GIS Web App (no public
//   landing page; layer accessed via AGOL Hosted Feature Server).
// REST API:    services1.arcgis.com/k3vhq11XkBNeeOfM/.../FeatureServer/0
// License:     No explicit CC string on the AGOL item; the layer is
//              publicly queryable and openly published by the City of
//              Richmond Department of Public Works. Treat as public-
//              with-attribution per City of Richmond publication.
// Refresh:     2026-05-11 verified count = 121,645 total rows;
//              ~75,769 after filtering Status='In Service' and
//              dropping Vacant/Stump/Unknown/Grass/Bamboo/Cactus rows.
//
// Schema notes:
//   - SPP is the canonical species field, a coded-value domain that
//     mostly holds clean Latin binomials ("Quercus phellos",
//     "Acer rubrum") but also embeds cultivar info in a few rows
//     ("Magnolia x soulangiana", "Ginkgo biloba 'Goldspire'",
//     "Betula nigra 'Multi-stem'"). The framework's
//     normalizeSpeciesName() strips the quoted-cultivar and hybrid
//     marker so it falls through to the binomial match.
//   - CULTIVAR is a separate string field, mostly " " (single space)
//     placeholder; we don't currently use it for matching.
//   - Status enum codes: "In Service" (live tree at this location),
//     plus other codes for removed / archived sites.
//   - AddrLabl is a human-readable address (e.g. "3315 Chimborazo Park"),
//     AREA is the neighborhood (e.g. "Chimborazo"), C_DIST/P_DIST are
//     council/planning district codes — none used for matching but
//     all carried into the raw record by the framework.
//   - Spatial reference is Virginia State Plane South (wkid 102747).
//     We request f=geojson which auto-projects to WGS84 lng/lat;
//     verified with sample features that returned (-77.4, 37.5).
//
// Run: npm run import:richmond-trees
// Pre-req: a 'Richmond public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'richmond-urban-forestry-trees';
const LAYER_URL =
  'https://services1.arcgis.com/k3vhq11XkBNeeOfM/arcgis/rest/services/TreeInventoryLive_ViewUFWebPage/FeatureServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Richmond public';

interface RvaFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    SPP?: string;
    DBH?: number;
    COND?: string;
    UTILITIES?: string;
    TRUNKS?: number;
    AREA?: string;
    P_DIST?: string;
    C_DIST?: string;
    CULTIVAR?: string;
    AddrLabl?: string;
    AssetID?: string;
    GlobalID?: string;
    Status?: string;
  };
}

/** Richmond, VA city limits. The city itself spans roughly
 *  37.43–37.61 N and -77.60 – -77.38 W. Pad slightly to catch trees
 *  managed at the edge. The AGOL extent declared on the layer is
 *  in Virginia State Plane South; sample WGS84 features confirmed
 *  this range. */
function inRichmondBbox(lng: number, lat: number): boolean {
  return lat >= 37.40 && lat <= 37.65 && lng >= -77.65 && lng <= -77.30;
}

/** Reject SPP values that aren't real Latin binomials. The Richmond
 *  inventory has clean Latin in the canonical case, but the SQL
 *  filter is best-effort — strip out any placeholder values that
 *  slip past the WHERE clause. */
const NON_TREE_PREFIXES = ['Vacant', 'Unknown', 'Stump', 'Grass', 'Bamboo', 'Cactus'];
function looksLikeLatin(s: string): boolean {
  if (!s) return false;
  const trimmed = s.trim();
  if (!trimmed) return false;
  // Common-name overrides like "Crimson Spire Columnar Oak", "Fruitless
  // Sweetgum", "Princeton Sentry Ginkgo" are present in the coded-value
  // domain — they won't match by Latin but might by common name.
  for (const p of NON_TREE_PREFIXES) {
    if (trimmed.startsWith(p)) return false;
  }
  // First word must be Capitalized Genus.
  if (!/^[A-Z][a-z]+/.test(trimmed)) return false;
  return true;
}

const config: ImportConfig<RvaFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'City of Richmond, VA Urban Forestry Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of Richmond, VA Department of Public Works Urban Forestry ' +
    'tree inventory (~121k inventoried sites). Source publishes SPP ' +
    '(coded-value Latin binomial), CULTIVAR, Status, COND, DBH, ' +
    'AddrLabl (full address), AREA (neighborhood), and planning/council ' +
    'district codes. We filter to Status=\'In Service\' and exclude ' +
    'vacant-site / stump / unknown / grass / bamboo / cactus rows to ' +
    'keep only live trees. AGOL item carries no explicit license string ' +
    '— treated as public-with-attribution per City of Richmond ' +
    'publication. Spatial reference is Virginia State Plane South ' +
    '(wkid 102747); we request f=geojson which auto-projects to WGS84.',
  regionName: REGION_NAME,
  license: 'Public (City of Richmond, VA; no explicit CC license)',
  async fetchAll() {
    // Filter to live trees only — drops Vacant sites, Stumps, and
    // taxonomically-unhelpful placeholders. The remaining ~75k rows
    // are inventory points with a usable species value.
    const where =
      "Status='In Service' " +
      "AND SPP NOT LIKE 'Vacant%' " +
      "AND SPP NOT IN ('Stump','Unknown tree','Unknown shrub','Grass spp.','Bamboo sp.','Cactus sp.')";
    return fetchArcGisLayer({ url: ENDPOINT, where }) as Promise<RvaFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inRichmondBbox(lng, lat)) return null;

    const rawSpp = (f.properties?.SPP ?? '').trim();
    if (!rawSpp) return null;
    const latin = looksLikeLatin(rawSpp) ? rawSpp : '';
    // For non-Latin coded-value entries (e.g. "Princeton Sentry Ginkgo",
    // "Crimson Spire Columnar Oak"), fall back to common-name match.
    const common = !latin ? rawSpp : undefined;
    if (!latin && !common) return null;

    return {
      externalId: String(
        f.properties?.OBJECTID ??
          f.properties?.GlobalID ??
          f.properties?.AssetID ??
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
  console.error('Richmond trees import failed:', err);
  process.exit(1);
});
