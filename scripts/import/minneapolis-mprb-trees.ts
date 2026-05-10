// Minneapolis Park & Recreation Board (MPRB) park trees — direct
// ArcGIS Online endpoint. Trees in city parks only (not boulevard
// street trees, which the city's main forestry inventory holds in a
// non-public Health Department layer — see progress doc).
//
// Source: ArcGIS Online item cca653c117e74c6e9eb6b3db4eb132e6
//   ("msvcMPRB_ParkTrees_PROD", owner: City_of_Minneapolis)
// REST root:
//   https://services.arcgis.com/afSMGVsC7QlRK1kZ/arcgis/rest/services/msvcMPRB_ParkTrees_PROD/FeatureServer
// Service is split into 6 layers by tree group, and we union them:
//   0 Conifer        ~1,091
//   1 Ash             ~910
//   2 Elm             ~709
//   3 Maple         ~1,183
//   4 Oak           ~1,480
//   5 Other Deciduous ~3,591   (this is where any forageable hits will live)
//   total           ~8,964 records as of May 2026
//
// Note on the source-doc estimate: the deep-crawl doc lists
// Minneapolis as "~210k MPRB direct" — that estimate appears to
// conflate city + MPRB and assume the Davey 2012 full-city inventory
// (~210k records, the source for the Dryad subset of ~47k forageable
// rows) is publicly republished. As of May 2026 it is not — the only
// public layer on Minneapolis's ArcGIS Online org with current data
// is this MPRB park-trees feed (~9k). The full city inventory lives
// at City_of_Minneaoplis_Health_Dept._view but requires a token. See
// docs/tree-imports-progress.md for the audit trail.
//
// Schema: SPP (Latin, includes cultivar quotes — e.g. "Platanus x
// acerifolia 'Bloodgood'"), Species (English common — "London
// Planetree"), TB_Species (i-Tree common, "Sycamore, American"-style
// reverse form), Genus_Cmn ("Sycamore - Planetree"), PARKNAME (which
// park the tree is in), DBH, COND, LandUse, OBJECTID.
//
// Run: npm run import:minneapolis-mprb-trees
// Pre-req: a 'Minneapolis MPRB public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'minneapolis-mprb-park-trees';
const REST_BASE =
  'https://services.arcgis.com/afSMGVsC7QlRK1kZ/arcgis/rest/services/msvcMPRB_ParkTrees_PROD/FeatureServer';
const REGION_NAME = 'Minneapolis MPRB public';

interface ArcGisFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    SPP?: string;        // "Platanus x acerifolia 'Bloodgood'"
    Species?: string;    // "London Planetree"
    TB_Species?: string; // "Sycamore, American"
    Genus_Cmn?: string;  // "Sycamore - Planetree"
    PARKNAME?: string;
    DBH?: number;
    COND?: string;
    /** Layer index 0..5 — added in fetchAll so externalId can stay
     *  unique across layers (OBJECTID alone is reused per-layer). */
    _layer?: number;
  };
}

const config: ImportConfig<ArcGisFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Minneapolis MPRB Park Trees',
  sourceUrl: REST_BASE,
  sourceDescription:
    'Minneapolis Park & Recreation Board live park-tree inventory ' +
    '(~9k trees in city parks across 6 sub-layers by tree group). ' +
    'Hosted on Minneapolis ArcGIS Online; permissive city open-data ' +
    'terms. Boulevard / street trees are managed separately in a ' +
    'non-public city layer and are NOT covered by this import.',
  regionName: REGION_NAME,
  license: 'Minneapolis Open Data terms',
  async fetchAll() {
    const all: ArcGisFeature[] = [];
    for (let layer = 0; layer < 6; layer++) {
      console.log(`  layer ${layer} …`);
      const feats = (await fetchArcGisLayer({
        url: `${REST_BASE}/${layer}/query`,
        where: 'SPP IS NOT NULL'
      })) as ArcGisFeature[];
      // Tag each feature with its source layer so externalId can
      // include it. OBJECTID values are not unique across the 6
      // sub-layers (each starts numbering from 1).
      for (const f of feats) {
        if (!f.properties) f.properties = {};
        f.properties._layer = layer;
      }
      all.push(...feats);
    }
    return all;
  },
  mapFeature(f): ImportRecord | null {
    const lng = Number(f.geometry?.coordinates?.[0]);
    const lat = Number(f.geometry?.coordinates?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

    const latin = (f.properties?.SPP ?? '').trim();
    if (!latin) return null;

    const layer = f.properties?._layer ?? 0;
    const oid = f.properties?.OBJECTID;

    return {
      externalId: oid != null
        ? `L${layer}-${oid}`
        : `${lng.toFixed(6)},${lat.toFixed(6)}`,
      scientificName: latin,
      commonName: (f.properties?.Species ?? '').trim() || undefined,
      lng,
      lat,
      raw: f
    };
  }
};

runImport(config).catch((err) => {
  console.error('Minneapolis MPRB trees import failed:', err);
  process.exit(1);
});
