// Stanford University — Edible Trees campus inventory.
// ~1,489 trees specifically curated as the edible-fruit/-nut subset of
// the Stanford campus tree inventory (the parent `Stanford_Trees_All`
// item exists but is gated; the Edible view is publicly shared).
// This is a particularly high-signal dataset for a forager: every row
// is by definition an edible-yield species the campus already tracks.
//
// Source page: https://www.arcgis.com/home/item.html?id=026fccaa2a8c4834a2b3a8ca0584fa35
// REST API:    services.arcgis.com/7CRlmWNEbeCqEJ6a/.../Stanford_Trees_Edible/FeatureServer/0
// License:     Stanford University public-view layer; no explicit CC
//              string. Treat as public-with-attribution per Stanford
//              publication.
// Refresh:     2026-05-11 verified count = 1,489.
//
// Schema notes:
//   - BOTANICAL and SCIENTIFIC are both populated with the Latin
//     binomial (often identical; SCIENTIFIC may include cultivar). We
//     prefer SCIENTIFIC when both are present.
//   - COMMON holds the common name (often padded with a leading space,
//     e.g. " Carob"; we trim).
//   - TYPE distinguishes Evergreen / Deciduous.
//   - FRUIT_OR_N indicates "Fruit" or "Nut" yield category (carried in
//     raw record for downstream curation).
//
// Run: npm run import:stanford-edible-trees
// Pre-req: a 'Stanford public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'stanford-edible-trees';
const LAYER_URL =
  'https://services.arcgis.com/7CRlmWNEbeCqEJ6a/arcgis/rest/services/Stanford_Trees_Edible/FeatureServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Stanford public';

interface StanfordFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID_1?: number;
    OBJECTID?: number;
    BOTANICAL?: string;
    COMMON?: string;
    COMMON_NAM?: string;
    SCIENTIFIC?: string;
    FRUIT_OR_N?: string;
    FAMILY?: string;
    TYPE?: string;
    GlobalID?: string;
  };
}

/** Stanford campus bbox. Main campus sits ~37.43 N, -122.17 W. Pad to
 *  catch outlying trees on Stanford properties. */
function inStanfordBbox(lng: number, lat: number): boolean {
  return lat >= 37.40 && lat <= 37.45 && lng >= -122.20 && lng <= -122.14;
}

const config: ImportConfig<StanfordFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Stanford University Edible Trees Campus Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'Stanford University campus inventory of edible-yield (fruit or ' +
    'nut) trees (~1.5k rows). Pre-filtered subset of the full ' +
    'Stanford tree inventory; every record is a curated edible species. ' +
    'Source publishes BOTANICAL + SCIENTIFIC (Latin binomial, often ' +
    'duplicated, SCIENTIFIC sometimes includes cultivar), COMMON, ' +
    'FRUIT_OR_N (Fruit/Nut category), FAMILY, and TYPE (Evergreen/' +
    'Deciduous). AGOL item has no explicit CC license — treated as ' +
    'public-with-attribution per Stanford University publication.',
  regionName: REGION_NAME,
  license: 'Public (Stanford University; no explicit CC license)',
  async fetchAll() {
    return fetchArcGisLayer({ url: ENDPOINT }) as Promise<StanfordFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inStanfordBbox(lng, lat)) return null;

    // Prefer SCIENTIFIC (sometimes includes cultivar — normalized
    // by framework). Fall back to BOTANICAL.
    const sci = (f.properties?.SCIENTIFIC ?? '').trim();
    const bot = (f.properties?.BOTANICAL ?? '').trim();
    const latin = sci || bot;
    const common = (f.properties?.COMMON ?? '').trim() ||
      (f.properties?.COMMON_NAM ?? '').trim();
    if (!latin && !common) return null;

    return {
      externalId: String(
        f.properties?.OBJECTID_1 ??
          f.properties?.OBJECTID ??
          f.properties?.GlobalID ??
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
  console.error('Stanford edible trees import failed:', err);
  process.exit(1);
});
