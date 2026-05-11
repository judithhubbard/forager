// Town of Tonawanda — public tree inventory served from the town's
// ArcGIS Server. Adjacent Buffalo suburb in Erie County NY.
//
// Source map app: https://gis1.tonawanda.ny.us/portal/apps/webappviewer/index.html?id=5b8ad4a79bfc445881b8408011a50836
// REST API:       https://gis1.tonawanda.ny.us/arcgis/rest/services/FacilitiesStreets/TonawandaTrees_FeatureService/FeatureServer/0
// License:        Public per town GIS practice; no explicit licenseInfo
//                 string on the FeatureServer.
//
// Verified count (2026-05-10): 33,145 rows. (FEMC's NO-LATLNG stub
// recorded 22,445 from a 2015–16 snapshot; the live town feed has
// since grown by 50%.)
//
// Schema gotcha: there is NO Latin-name column. The `SpeciesType`
// field stores common name in i-Tree "common, modifier" reverse
// form, e.g. "Maple, Silver" → silver maple = Acer saccharinum. We
// flip and lowercase, then let the framework's species matcher do a
// common-name lookup. Rows whose common name doesn't match a
// forageable species fall through naturally.
//
// Other useful fields: `DBH`, `Condition`, `SiteType` ("Existing
// Tree" / "Stump" / "Vacant Site" — we filter to Existing Tree),
// `AddressNo`, `Street`, `Side`, `OverheadLines`, `ManagedBy`.
//
// Run: npm run import:tonawanda-trees
// Pre-req: a 'Tonawanda public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'tonawanda-trees';
const ENDPOINT =
  'https://gis1.tonawanda.ny.us/arcgis/rest/services/FacilitiesStreets/TonawandaTrees_FeatureService/FeatureServer/0/query';
const REGION_NAME = 'Tonawanda public';

interface TonFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    GlobalID?: string;
    SpeciesType?: string;       // "Maple, Silver" — common, modifier
    SiteType?: string;          // "Existing Tree" / "Stump" / "Vacant Site"
    Side?: string;
    DBH?: number;
    TreeHeight?: string;
    CanopyWidth?: string;
    Condition?: string;
    AddressNo?: string;
    Street?: string;
    PlantingYear?: number;
    ManagedBy?: string;
  };
}

/** Flip "Maple, Silver" → "silver maple". Lowercase + trim. Genus-
 *  only entries like "Maple" (no comma) become "maple". Returns null
 *  for empty/whitespace. */
function flipCommonName(s: string | undefined): string | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  const idx = trimmed.indexOf(',');
  if (idx < 0) return trimmed.toLowerCase();
  const head = trimmed.slice(0, idx).trim();
  const tail = trimmed.slice(idx + 1).trim();
  return `${tail} ${head}`.toLowerCase();
}

const config: ImportConfig<TonFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Tonawanda Public Trees',
  sourceUrl:
    'https://gis1.tonawanda.ny.us/portal/apps/webappviewer/index.html?id=5b8ad4a79bfc445881b8408011a50836',
  sourceDescription:
    'Town of Tonawanda NY (Buffalo suburb) public tree inventory ' +
    '(~33k records). Hosted on town ArcGIS Server. Town-GIS open ' +
    'access; no explicit license string but consistent with municipal ' +
    'open-data practice. Schema has no Latin binomial — uses ' +
    '"common, modifier" reverse-form names; script flips them at ' +
    'import time and relies on common-name matching against ' +
    'forageable_species.',
  regionName: REGION_NAME,
  license: 'Town of Tonawanda GIS (open)',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      // Skip stumps / vacant sites — only living trees.
      where: "SiteType = 'Existing Tree'"
    }) as Promise<TonFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const lng = Number(f.geometry?.coordinates?.[0]);
    const lat = Number(f.geometry?.coordinates?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    // Town of Tonawanda + Kenmore village sit ~42.95–43.05N,
    // -78.90 – -78.82W (immediately N of Buffalo city).
    if (lat < 42.85 || lat > 43.1 || lng < -79.0 || lng > -78.7) return null;

    const common = flipCommonName(f.properties?.SpeciesType);
    if (!common) return null;

    // We don't have a Latin binomial. The framework's matchSpecies
    // step (upsert.ts:135) tries scientific name → common name →
    // alias in that order; with `scientificName` omitted it falls
    // through to common-name lookup against forageable_species.
    return {
      externalId: f.properties?.GlobalID
        ?? String(f.properties?.OBJECTID ?? `${lng.toFixed(6)},${lat.toFixed(6)}`),
      commonName: common,
      lng,
      lat,
      raw: f as unknown as Record<string, unknown>
    };
  }
};

runImport(config).catch((err) => {
  console.error('Tonawanda trees import failed:', err);
  process.exit(1);
});
