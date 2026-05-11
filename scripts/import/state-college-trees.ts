// State College Borough, PA — Public Works Forestry tree inventory.
// ~6.3k trees collected via Field Maps survey on borough property by
// the Public Works Department. Hosted on the borough's ArcGIS Online
// org (owner: tblose_scb / kcowher_scb; org urlKey scb = State
// College Borough).
//
// Source page: https://www.statecollegepa.us/175/Public-Works
// REST API:    services8.arcgis.com/5EsWsFkU1FzqtfTb/.../State_College_Trees_view/FeatureServer/0
// License:     None declared on AGOL item; "access" is public.
//              State College publishes borough-asset GIS data as
//              public-with-attribution. Flag for explicit confirmation.
// Refresh:     2026-05-11 verified count = 6,345
//
// Schema notes: Species_Co holds a common name in natural order
// ("northern red oak", "norway maple") — already in the form
// matchSpecies's common-name path expects. No Latin binomial in the
// source. Many auxiliary GNSS columns are present (esrignss_*) which
// we ignore. Three GlobalID columns (GlobalID / GlobalID_2) suggest
// schema-edit churn, so we lock externalId on OBJECTID which is the
// only stable ID across edits.
//
// Run: npm run import:state-college-trees
// Pre-req: a 'State College public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'state-college-borough-trees';
const LAYER_URL =
  'https://services8.arcgis.com/5EsWsFkU1FzqtfTb/arcgis/rest/services/State_College_Trees_view/FeatureServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'State College public';

interface ScFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    Address?: number;
    Street?: string;
    Site_Type?: string;
    Site_Size?: number;
    Species_Co?: string;
    DBH?: number;
    Tree_Condi?: string;
    GlobalID?: string;
    Status?: string;
  };
}

/** State College borough bbox. AGOL extent declared as
 *  40.7698–40.8053 / -77.8828 – -77.8333; pad slightly to catch
 *  borough-maintained trees just outside the bbox. */
function inStateCollegeBbox(lng: number, lat: number): boolean {
  return lat >= 40.74 && lat <= 40.83 && lng >= -77.90 && lng <= -77.80;
}

const config: ImportConfig<ScFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'State College Borough Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'State College Borough, PA Public Works tree inventory (~6.3k ' +
    'trees, Penn State adjacent). Source publishes Species_Co as a ' +
    'natural-order common name (e.g. "northern red oak"); no Latin ' +
    'binomial. AGOL item carries no explicit license; treated as ' +
    'public-with-attribution per State College Borough publication.',
  regionName: REGION_NAME,
  license: 'Public (State College Borough; no explicit CC license)',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      where: "Species_Co IS NOT NULL AND Species_Co <> ''"
    }) as Promise<ScFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inStateCollegeBbox(lng, lat)) return null;

    const common = (f.properties?.Species_Co ?? '').trim();
    if (!common) return null;
    // Filter placeholder strings.
    if (/^(no tree|unknown|empty|stump|vacant)/i.test(common)) return null;

    return {
      externalId: String(
        f.properties?.OBJECTID ?? `${lng.toFixed(6)},${lat.toFixed(6)}`
      ),
      commonName: common,
      lng,
      lat,
      raw: f as unknown as Record<string, unknown>
    };
  }
};

runImport(config).catch((err) => {
  console.error('State College trees import failed:', err);
  process.exit(1);
});
