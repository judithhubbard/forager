// Smith College Botanic Garden — Arboretum Tree Collection.
// ~1,162 trees in the campus arboretum at Smith College in
// Northampton, MA. Published by the Botanic Garden's GIS staff
// (owner=garden_smithcollege) as a public hosted feature service.
//
// This is a curated, named-cultivar campus arboretum (similar to
// Cornell Botanic Gardens or Stanford). Each row is a research-quality
// accession with a TaxonName that often includes named cultivars in
// quotes ("Fagus sylvatica 'Riversii'") or hybrid markers ("Malus ×
// 'Centzam' Centurion ®"). The framework's normalizeSpeciesName
// strips the cultivar/registered-trademark cruft so it falls back to
// the binomial.
//
// Source page: https://www.arcgis.com/home/item.html?id=81b2ad5e0d0f43f3b53e1c310542b152
// REST API:    services.arcgis.com/aMv9lrl6jFsuGNu8/.../ArbTrees_NOV2019/FeatureServer/0
// License:     Smith College Botanic Garden — public collection inventory.
//              No explicit Creative Commons string; treat as public-with-
//              attribution per Smith College publication.
// Refresh:     2026-05-11 verified count = 1,162. Service name dates the
//              snapshot to November 2019; the data may be older than
//              the actual collection.
//
// Schema notes:
//   - TaxonName is the canonical Latin binomial + optional cultivar.
//   - ItemAccNoFull is the accession number (used as external ID).
//   - ItemLocationName is the on-campus location (e.g. "Field House").
//   - LifeForm distinguishes tree / shrub / vine — we keep only Tree.
//
// Run: npm run import:smith-college-trees
// Pre-req: a 'Northampton public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'smith-botanic-garden-arbtrees';
const LAYER_URL =
  'https://services.arcgis.com/aMv9lrl6jFsuGNu8/arcgis/rest/services/ArbTrees_NOV2019/FeatureServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Northampton public';

interface SmithFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    ItemAccNoFull?: string;
    TaxonName?: string;
    ItemLocationName?: string;
    ItemCoordY?: number;
    ItemCoordX?: number;
    LifeForm?: string;
    GlobalID?: string;
  };
}

/** Smith College campus bbox. Service declared extent is approximately
 *  42.31–42.32 N / -72.65 – -72.63 W. Pad slightly. */
function inSmithBbox(lng: number, lat: number): boolean {
  return lat >= 42.30 && lat <= 42.33 && lng >= -72.66 && lng <= -72.62;
}

const config: ImportConfig<SmithFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Smith College Botanic Garden Arboretum Tree Collection',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'Smith College Botanic Garden arboretum tree collection in ' +
    'Northampton, MA (~1.2k accessions). Curated by Smith College ' +
    'Botanic Garden GIS staff. Source publishes TaxonName (Latin ' +
    'binomial + optional cultivar), ItemAccNoFull (accession number), ' +
    'ItemLocationName (on-campus area), and LifeForm. We keep only ' +
    'LifeForm=\'Tree\' rows. Snapshot dated November 2019 per service ' +
    'name. AGOL item has no explicit CC license — treated as public-' +
    'with-attribution per Smith College Botanic Garden publication.',
  regionName: REGION_NAME,
  license: 'Public (Smith College Botanic Garden; no explicit CC license)',
  async fetchAll() {
    // Restrict to Tree LifeForm. The accession may include shrubs and
    // vines (~few hundred rows out of 1,162); we want only trees for
    // the public layer.
    const where = "LifeForm = 'Tree'";
    return fetchArcGisLayer({ url: ENDPOINT, where }) as Promise<SmithFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inSmithBbox(lng, lat)) return null;

    const latin = (f.properties?.TaxonName ?? '').trim();
    if (!latin) return null;

    return {
      externalId: String(
        f.properties?.ItemAccNoFull ??
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
  console.error('Smith College trees import failed:', err);
  process.exit(1);
});
