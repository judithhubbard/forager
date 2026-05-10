// City of Sacramento — "City Maintained Trees" inventory, hosted on
// the Sacramento ArcGIS Online instance and re-published on the city
// open-data hub.
//
// Source page: https://data.cityofsacramento.org/datasets/b9b716e09b5048179ab648bb4518452b_0/about
// ArcGIS item: https://www.arcgis.com/home/item.html?id=b9b716e09b5048179ab648bb4518452b
// REST API:    https://services5.arcgis.com/54falWtcpty3V47Z/arcgis/rest/services/City_Maintained_Trees/FeatureServer/0
// License:     City of Sacramento Open Data terms (permissive; "all
//              information compiled is provided as a public service
//              and for general informational purposes only").
//
// ~107k street + park + city right-of-way trees. Sacramento is the
// first Mediterranean-climate (Cfa/Csa transition, USDA zone 9b) city
// in the public tier — distinct from coastal CA (San Francisco zone
// 10a) and inland-southern (LA zone 10a/10b).
//
// Schema is clean: BOTANICAL (Latin), SPECIES (common, lowercase
// "horsetail tree" / "oak, coast live" — note the "common, modifier"
// reverse form like Calgary), CULTIVAR, ASSET_ID (OID).
//
// Run: npm run import:sacramento-trees
// Pre-req: a 'Sacramento public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'sacramento-city-trees';
const ENDPOINT =
  'https://services5.arcgis.com/54falWtcpty3V47Z/arcgis/rest/services/City_Maintained_Trees/FeatureServer/0/query';
const REGION_NAME = 'Sacramento public';

interface ArcGisFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    ASSET_ID?: number;       // OID
    OBJECTID?: number;
    GISOBJID?: number;
    BOTANICAL?: string;      // "Casuarina equisetifolia"
    SPECIES?: string;        // "horsetail tree"  (city's "common, modifier" reverse form)
    CULTIVAR?: string;
    PLANTTYPE?: string;
  };
}

const config: ImportConfig<ArcGisFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Sacramento City Maintained Trees',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of Sacramento Urban Forestry / Department of Public Works ' +
    'maintained tree inventory (~107k street, park, and ROW trees). ' +
    'Permissive Sacramento Open Data terms. First Mediterranean-' +
    'climate city in the public tier (USDA zone 9b).',
  regionName: REGION_NAME,
  license: 'Sacramento Open Data Terms',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      // Filter to rows with a Latin binomial. ~3% of the inventory
      // is "VACANT SITE" / "STUMP" / null — no tree to forage.
      where: "BOTANICAL IS NOT NULL AND BOTANICAL <> ''"
    }) as Promise<ArcGisFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const lng = Number(f.geometry?.coordinates?.[0]);
    const lat = Number(f.geometry?.coordinates?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

    const latin = (f.properties?.BOTANICAL ?? '').trim();
    if (!latin) return null;

    // SPECIES uses the "common, modifier" form like Calgary, e.g.
    // "oak, coast live". Take the part before the comma as the base
    // common name; full string is preserved verbatim in import_raw.
    const rawCommon = (f.properties?.SPECIES ?? '').trim();
    const baseCommon = rawCommon.split(',')[0].trim();

    return {
      externalId: String(
        f.properties?.ASSET_ID
          ?? f.properties?.OBJECTID
          ?? `${lng.toFixed(6)},${lat.toFixed(6)}`
      ),
      scientificName: latin,
      commonName: baseCommon || undefined,
      lng,
      lat,
      raw: f
    };
  }
};

runImport(config).catch((err) => {
  console.error('Sacramento trees import failed:', err);
  process.exit(1);
});
