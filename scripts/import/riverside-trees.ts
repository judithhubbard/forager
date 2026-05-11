// City of Riverside, CA — three ArcGIS feature layers pooled into one
// source. Owner=Fu2oOWg1Aw7azh41 (City of Riverside).
//
//   - Street_Trees           (~127,750)
//   - Trees_Along_Utility_Lines (~49,020)
//   - Miscellaneous_Trees     (~686)
//
// All three layers share BotanicalName / CommonName / DBH schema and
// land in the same 'Riverside public' region. We prefix the external
// ID with the layer tag (e.g. "street:12597096", "utility:10710571",
// "misc:10165091") so the idempotent upsert key stays globally unique
// across the three layers.
//
// Source page: https://riversideca.gov/utilities/
// REST APIs:   services.arcgis.com/Fu2oOWg1Aw7azh41/.../Street_Trees, …/Trees_Along_Utility_Lines, …/Miscellaneous_Trees
// License:     City of Riverside Open Data (permissive, attribution)
// Refresh:     2026-05-10 verified counts = 127,750 + 49,020 + 686 = 177,456
//
// Run: npm run import:riverside-trees
// Pre-req: a 'Riverside public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'riverside-trees';
const REGION_NAME = 'Riverside public';

interface RivFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    SysID?: number;
    BotanicalName?: string;
    CommonName?: string;
    ActualDBH?: number;
    _layer?: 'street' | 'utility' | 'misc';
  };
}

const LAYERS: Array<{ tag: 'street' | 'utility' | 'misc'; url: string; estRows: number; label: string }> = [
  {
    tag: 'street',
    url: 'https://services.arcgis.com/Fu2oOWg1Aw7azh41/arcgis/rest/services/Street_Trees/FeatureServer/0/query',
    estRows: 127_750,
    label: 'Riverside Street Trees'
  },
  {
    tag: 'utility',
    url: 'https://services.arcgis.com/Fu2oOWg1Aw7azh41/arcgis/rest/services/Trees_Along_Utility_Lines/FeatureServer/0/query',
    estRows: 49_020,
    label: 'Riverside Trees Along Utility Lines'
  },
  {
    tag: 'misc',
    url: 'https://services.arcgis.com/Fu2oOWg1Aw7azh41/arcgis/rest/services/Miscellaneous_Trees/FeatureServer/0/query',
    estRows: 686,
    label: 'Riverside Miscellaneous Trees'
  }
];

/** Riverside metro bbox (~30km around city center). City sits around
 *  33.95 N, -117.40 W. */
function inRiversideBbox(lng: number, lat: number): boolean {
  return lat >= 33.75 && lat <= 34.15 && lng >= -117.65 && lng <= -117.10;
}

const config: ImportConfig<RivFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Riverside, CA Public Trees',
  // Pick the largest layer as the canonical sourceUrl; the description
  // lists all three.
  sourceUrl:
    'https://services.arcgis.com/Fu2oOWg1Aw7azh41/arcgis/rest/services',
  sourceDescription:
    'City of Riverside, CA public tree inventory — three pooled ' +
    'ArcGIS feature layers: Street Trees (~127.7k), Trees Along ' +
    'Utility Lines (~49k), and Miscellaneous Trees (~0.7k). All ' +
    'share BotanicalName/CommonName/DBH schema. City of Riverside ' +
    'Open Data (permissive, attribution).',
  regionName: REGION_NAME,
  license: 'City of Riverside Open Data',
  async fetchAll() {
    const all: RivFeature[] = [];
    for (const layer of LAYERS) {
      console.log(`Fetching Riverside layer "${layer.label}" (est ${layer.estRows.toLocaleString()})`);
      const feats = (await fetchArcGisLayer({
        url: layer.url,
        where: "BotanicalName IS NOT NULL AND BotanicalName <> ''"
      })) as RivFeature[];
      // Use a plain for-loop instead of spread — `all.push(...feats)`
      // overflows the call stack when feats is >100k items on the
      // street-trees layer.
      for (const f of feats) {
        if (f.properties) f.properties._layer = layer.tag;
        all.push(f);
      }
    }
    console.log(`Total Riverside features across three layers: ${all.length}`);
    return all;
  },
  mapFeature(f): ImportRecord | null {
    const c = f.geometry?.coordinates;
    const lng = Number(c?.[0]);
    const lat = Number(c?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng === 0 || lat === 0) return null;
    if (!inRiversideBbox(lng, lat)) return null;
    const latin = f.properties?.BotanicalName?.trim();
    if (!latin) return null;
    // CommonName is uppercase (e.g. "MEXICAN FAN PALM"). Lowercase
    // before passing to matchSpecies — case-folding is done by the
    // matcher anyway but logs read better.
    const common = f.properties?.CommonName?.trim().toLowerCase() || undefined;
    const layer = f.properties?._layer ?? 'misc';
    const localId = String(
      f.properties?.SysID ??
        f.properties?.OBJECTID ??
        `${lng.toFixed(6)},${lat.toFixed(6)}`
    );
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
  console.error('Riverside trees import failed:', err);
  process.exit(1);
});
