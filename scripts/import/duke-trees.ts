// Duke University — Campus Tree Inventory.
// ~17.8k trees across the Duke University campus (West, East, and
// Central campuses + the Sarah P. Duke Gardens). Maintained by Duke
// Facilities Management Department / Grounds Services and published
// as a public hosted feature service on a private user AGOL account
// (owner=ganspach_2).
//
// Source page: https://www.arcgis.com/home/item.html?id=d05c1911f5b44041b0868ebcd8b509a9
// REST API:    services.arcgis.com/Z9V9PNBciAi0yKNx/.../Duke_Tree_Inventory/FeatureServer/1
// License:     No explicit Creative Commons license on the AGOL item.
//              Publicly queryable hosted feature service. Treat as
//              public-with-attribution per Duke University publication.
// Refresh:     2026-05-11 verified count = 17,805.
//
// Schema notes:
//   - GenSpe is the full Latin binomial ("Quercus alba", "Acer rubrum").
//   - genus and species fields hold the components separately; GenSpe
//     is the simplest and we use it primarily.
//   - ComName is the common name.
//   - iTreeCode is the iTree species code (carried in raw).
//   - TreeRemoved is a flag we filter ('No' kept, 'Yes' dropped).
//
// Run: npm run import:duke-trees
// Pre-req: a 'Durham NC public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'duke-university-trees';
const LAYER_URL =
  'https://services.arcgis.com/Z9V9PNBciAi0yKNx/arcgis/rest/services/Duke_Tree_Inventory/FeatureServer/1';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Durham NC public';

interface DukeFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    Treeid?: number;
    TreeRemoved?: string;
    Verify_Date?: number;
    dbh1?: number;
    ComName?: string;
    iTreeCode?: string;
    GenSpe?: string;
    genus?: string;
    species?: string;
    otherSpec?: string;
    CondClass?: string;
    AgeClass?: string;
  };
}

/** Duke University campus bbox. Duke's three campuses sit at roughly
 *  35.97–36.03 N and -78.96 – -78.91 W. Sarah P. Duke Gardens are at
 *  35.998 N, -78.929 W. Pad to catch adjacent forest properties. */
function inDukeBbox(lng: number, lat: number): boolean {
  return lat >= 35.93 && lat <= 36.07 && lng >= -79.00 && lng <= -78.85;
}

const config: ImportConfig<DukeFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Duke University Campus Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'Duke University campus tree inventory (~17.8k trees) covering ' +
    'West, East, and Central campuses plus the Sarah P. Duke Gardens. ' +
    'Maintained by Duke Facilities Management Department / Grounds ' +
    'Services. Source publishes GenSpe (Latin binomial), ComName ' +
    '(common name), genus/species split, iTreeCode, dbh1 (DBH), ' +
    'CondClass, AgeClass, and TreeRemoved flag. We filter ' +
    'TreeRemoved=\'Yes\' to keep only live trees. AGOL item has no ' +
    'explicit CC license — treated as public-with-attribution per ' +
    'Duke University publication.',
  regionName: REGION_NAME,
  license: 'Public (Duke University Facilities; no explicit CC license)',
  async fetchAll() {
    // Drop rows explicitly flagged Removed.
    const where = "TreeRemoved <> 'Yes' OR TreeRemoved IS NULL";
    return fetchArcGisLayer({ url: ENDPOINT, where }) as Promise<DukeFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inDukeBbox(lng, lat)) return null;

    let latin = (f.properties?.GenSpe ?? '').trim();
    if (!latin) {
      const genus = (f.properties?.genus ?? '').trim();
      const species = (f.properties?.species ?? '').trim();
      if (genus && species) latin = `${genus} ${species}`;
      else if (genus) latin = genus;
    }
    const common = (f.properties?.ComName ?? '').trim();
    if (!latin && !common) return null;

    return {
      externalId: String(
        f.properties?.OBJECTID ??
          f.properties?.Treeid ??
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
  console.error('Duke trees import failed:', err);
  process.exit(1);
});
