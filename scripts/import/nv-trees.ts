// Nevada Division of Forestry (NDF) — partial-state aggregator.
// NDF owns three project inventories on AGOL (owner=ndfadmin); two of
// them are large enough to be useful as a forageable-pin source:
//
//   - UNLV Tree Inventory             (~3,227 trees, UNLV campus)
//   - Clark County Schools Tree Inv.  (~30,938 trees, CCSD properties)
//
// Both layers share the same schema (BOTANICAL + COMMON + LOCATION +
// ID + lat/lng in geometry). We pool them into a single import
// source ("nv-ndf-trees") rather than splitting per-layer because:
//   - They share owner, license, and schema.
//   - They both land in 'Nevada public'.
//   - Layer-suffixed external IDs (UNLV-123, CCSD-456) keep the
//     idempotent upsert key globally unique.
//
// Source page: https://forestry.nv.gov/ (Nevada Division of Forestry)
// REST APIs:   services2.arcgis.com/.../UNLV_Tree_Inventory/0
//              services2.arcgis.com/.../Clark_County_Schools_Tree_Inventory/0
// License:     Nevada open data (permissive; attribution to NDF)
// Refresh:     2026-05-10 verified counts = 3,227 + 30,938
//
// Run: npm run import:nv-trees
// Pre-req: a 'Nevada public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'nv-ndf-trees';
const REGION_NAME = 'Nevada public';

interface NdfFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    ID?: number;
    UNIQUEID?: string;
    GlobalID?: string;
    LOCATION?: string;
    BOTANICAL?: string;
    COMMON?: string;
    CULTIVAR?: string;
    COND?: string;
    _layer?: 'unlv' | 'ccsd';   // injected at fetch time
  };
}

const LAYERS: Array<{ tag: 'unlv' | 'ccsd'; url: string; estRows: number; label: string }> = [
  {
    tag: 'unlv',
    url: 'https://services2.arcgis.com/bDmJlFHtkbwdyhN7/arcgis/rest/services/UNLV_Tree_Inventory/FeatureServer/0/query',
    estRows: 3_227,
    label: 'UNLV Tree Inventory'
  },
  {
    tag: 'ccsd',
    url: 'https://services2.arcgis.com/bDmJlFHtkbwdyhN7/arcgis/rest/services/Clark_County_Schools_Tree_Inventory/FeatureServer/0/query',
    estRows: 30_938,
    label: 'Clark County Schools Tree Inventory'
  }
];

/** Nevada rough bbox. Clark County (Las Vegas / UNLV / CCSD) sits in
 *  the southern tip; this bbox covers the whole state. */
function inNevadaBbox(lng: number, lat: number): boolean {
  return lat >= 35.0 && lat <= 42.1 && lng >= -120.1 && lng <= -114.0;
}

const config: ImportConfig<NdfFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Nevada Division of Forestry Trees',
  // Display the parent NDF AGOL org page rather than one of the two
  // layer URLs — both layers are recorded in the description below.
  sourceUrl: 'https://services2.arcgis.com/bDmJlFHtkbwdyhN7/arcgis/rest/services',
  sourceDescription:
    'Nevada Division of Forestry (owner=ndfadmin) tree inventories — ' +
    'two AGOL feature layers pooled into one source: UNLV Tree ' +
    'Inventory (~3,227) and Clark County Schools Tree Inventory ' +
    '(~30,938). Both layers share schema and license. Nevada open data.',
  regionName: REGION_NAME,
  license: 'Nevada open data',
  async fetchAll() {
    const all: NdfFeature[] = [];
    for (const layer of LAYERS) {
      console.log(`Fetching NV layer "${layer.label}" (est ${layer.estRows.toLocaleString()})`);
      const feats = (await fetchArcGisLayer({
        url: layer.url,
        where: "BOTANICAL IS NOT NULL AND BOTANICAL <> ''"
      })) as NdfFeature[];
      // Tag each feature so the external-id namespace stays disjoint.
      for (const f of feats) {
        if (f.properties) f.properties._layer = layer.tag;
      }
      all.push(...feats);
    }
    console.log(`Total NV features across both layers: ${all.length}`);
    return all;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inNevadaBbox(lng, lat)) return null;
    const latin = f.properties?.BOTANICAL?.trim();
    if (!latin) return null;
    const common = f.properties?.COMMON?.trim() || undefined;
    const layer = f.properties?._layer ?? 'ndf';
    const localId = f.properties?.UNIQUEID?.trim() ||
      String(f.properties?.ID ?? f.properties?.OBJECTID ?? `${lng.toFixed(6)},${lat.toFixed(6)}`);
    return {
      externalId: `${layer}:${localId}`,
      scientificName: latin,
      commonName: common,
      lng,
      lat,
      raw: f as unknown as Record<string, unknown>
    };
  }
};

runImport(config).catch((err) => {
  console.error('Nevada trees import failed:', err);
  process.exit(1);
});
