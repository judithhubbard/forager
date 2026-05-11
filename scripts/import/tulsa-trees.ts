// City of Tulsa — TreesFieldEdits inventory, published via Esri
// FieldMaps on the City's MapServer (served through the public
// utility.arcgis.com proxy host). ~9.6k trees.
//
// Source page: https://www.cityoftulsa.org/government/departments/parks/
// REST API:    utility.arcgis.com/usrsvcs/servers/.../FieldMaps/TreesFieldEdits/MapServer/0
// License:     City of Tulsa public data (permissive, attribution)
// Refresh:     2026-05-10 verified count = 9,627
//
// Schema notes: Genus + Species are split fields (e.g. "Quercus" +
// "stellata"), CommonName is "Type, Modifier" form ("Oak, Post"). We
// combine Genus + Species into a sentence-case Latin binomial, drop
// the modifier from CommonName, and let matchSpecies do the rest.
//
// Run: npm run import:tulsa-trees
// Pre-req: a 'Tulsa public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'tulsa-fieldmaps-trees';
const LAYER_URL =
  'https://utility.arcgis.com/usrsvcs/servers/7ef20f8a5add4adcb61b95fdf630984d/rest/services/FieldMaps/TreesFieldEdits/MapServer/0';
const ENDPOINT = `${LAYER_URL}/query`;
const REGION_NAME = 'Tulsa public';

interface TulsaFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    ParkName?: string;
    TreeID?: string;
    Genus?: string;
    Species?: string;
    CommonName?: string;
    DBH?: number;
    GlobalID?: string;
  };
}

/** Tulsa metro bbox (~30km around city center). City sits around
 *  36.15 N, -95.99 W; Owen Park samples to -96.00, 36.16. */
function inTulsaBbox(lng: number, lat: number): boolean {
  return lat >= 35.95 && lat <= 36.40 && lng >= -96.25 && lng <= -95.70;
}

/** Combine Genus + Species into "Genus species" (genus capitalized).
 *  Returns null when genus is missing or placeholder. */
function buildLatin(genus?: string, species?: string): string | null {
  const g = (genus ?? '').trim();
  if (!g) return null;
  if (/^(unknown|none|vacant|n\/a)$/i.test(g)) return null;
  const genusCased = g[0].toUpperCase() + g.slice(1).toLowerCase();
  const s = (species ?? '').trim().toLowerCase();
  if (!s || /^(sp|spp|sp\.|spp\.|unknown|n\/a)$/.test(s)) return genusCased;
  return `${genusCased} ${s}`;
}

const config: ImportConfig<TulsaFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Tulsa FieldMaps Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of Tulsa TreesFieldEdits inventory (~9.6k trees), served ' +
    'through the public utility.arcgis.com FieldMaps proxy. Genus + ' +
    'Species split fields, CommonName in "Type, Modifier" form. ' +
    'City of Tulsa public data.',
  regionName: REGION_NAME,
  license: 'City of Tulsa public data',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      where: "Genus IS NOT NULL AND Genus <> ''"
    }) as Promise<TulsaFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inTulsaBbox(lng, lat)) return null;
    const latin = buildLatin(f.properties?.Genus, f.properties?.Species);
    if (!latin) return null;
    // CommonName is "Type, Modifier" (e.g. "Oak, Post"). Drop the
    // comma-prefixed modifier so matchSpecies sees just "Oak", which
    // it can fall through into the genus path if needed.
    const rawCommon = (f.properties?.CommonName ?? '').trim();
    const baseCommon = rawCommon.split(',')[0].trim() || undefined;
    return {
      externalId: String(
        f.properties?.TreeID ??
          f.properties?.OBJECTID ??
          `${lng.toFixed(6)},${lat.toFixed(6)}`
      ),
      scientificName: latin,
      commonName: baseCommon,
      lng,
      lat,
      raw: f as unknown as Record<string, unknown>
    };
  }
};

runImport(config).catch((err) => {
  console.error('Tulsa trees import failed:', err);
  process.exit(1);
});
