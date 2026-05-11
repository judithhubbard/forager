// Town of Brookline, MA — public tree inventory served from the
// town's ArcGIS Online org (owner: `Town-of-Brookline.MA`).
//
// REST API:    https://services1.arcgis.com/Oknk0tvfHOElpgGU/arcgis/rest/services/Brookline_Tree_Viewer_Web_WFL1/FeatureServer/0
// ArcGIS item: https://www.arcgis.com/home/item.html?id=4500c14f85d846d6924c7f8cb532763f
// License:     Public — Town of Brookline GIS (no explicit licenseInfo
//              on the FeatureServer; consistent with municipal OD
//              practice).
//
// Verified count (2026-05-10): 16,348 rows. Matches FEMC's 16,316
// private stub almost exactly — same dataset, now openly published
// by the town.
//
// Schema is exceptionally clean: `ScientificName` (Latin), `CommonName`,
// `Genus`, `Species`, `Cultivar`, `TreeCode` (4-letter species
// shorthand), `DBH`, `CONDITION` (coded), `STRNUM`+`STREETNAME`,
// `PARKTREE` (1=park, 0=street). The duplicate fields (`SpeciesCodeTxt`
// / `TreeCodeAbbrv` etc) are display variants — we use the canonical
// columns.
//
// Run: npm run import:brookline-trees
// Pre-req: a 'Brookline public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'brookline-trees';
const ENDPOINT =
  'https://services1.arcgis.com/Oknk0tvfHOElpgGU/arcgis/rest/services/Brookline_Tree_Viewer_Web_WFL1/FeatureServer/0/query';
const REGION_NAME = 'Brookline public';

interface BrkFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    TAG_ID?: number;
    ID?: string;                 // String per-tree id (e.g. "8838")
    ScientificName?: string;     // "Tilia cordata"
    CommonName?: string;         // "Littleleaf Linden"
    Genus?: string;
    Species?: string;
    Cultivar?: string;
    TreeCode?: string;
    DBH?: number;
    STRNUM?: number;
    STREETNAME?: string;
    PARKTREE?: number;           // 1 = park, 0 = street
    LOCATION?: number;           // pit/lawn/median/nat-area
    IsStump?: number | null;
  };
}

const config: ImportConfig<BrkFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Brookline Tree Inventory',
  sourceUrl:
    'https://www.arcgis.com/home/item.html?id=4500c14f85d846d6924c7f8cb532763f',
  sourceDescription:
    'Town of Brookline MA public tree inventory (~16k records, ' +
    'streets + parks). Town-of-Brookline.MA-owned ArcGIS Online ' +
    'feature service. No explicit licenseInfo; treat as Town GIS ' +
    'open data per municipal practice. Schema includes separate ' +
    'ScientificName / CommonName / Genus / Species / Cultivar ' +
    'columns and a PARKTREE flag.',
  regionName: REGION_NAME,
  license: 'Town of Brookline GIS (open)',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      // Drop stumps (rare) and rows with no scientific name.
      where: "ScientificName IS NOT NULL AND ScientificName <> ''"
    }) as Promise<BrkFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const lng = Number(f.geometry?.coordinates?.[0]);
    const lat = Number(f.geometry?.coordinates?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    // Brookline sits ~42.30–42.35N, -71.18 – -71.10W (immediately
    // SW of Boston).
    if (lat < 42.25 || lat > 42.40 || lng < -71.25 || lng > -71.05) return null;

    const latin = (f.properties?.ScientificName ?? '').trim();
    if (!latin) return null;
    const common = (f.properties?.CommonName ?? '').trim();

    return {
      externalId: f.properties?.ID
        ?? String(f.properties?.OBJECTID ?? `${lng.toFixed(6)},${lat.toFixed(6)}`),
      scientificName: latin,
      commonName: common || undefined,
      lng,
      lat,
      raw: f as unknown as Record<string, unknown>
    };
  }
};

runImport(config).catch((err) => {
  console.error('Brookline trees import failed:', err);
  process.exit(1);
});
