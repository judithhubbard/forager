// City of Los Angeles street tree inventory — Bureau of Street
// Services (BSS), TreeKeeper-managed, hosted on the LA GeoHub
// ArcGIS Online instance.
//
// Source page: https://geohub.lacity.org/datasets/266c6255b1fc4ae8b8f100d8696e1fa4_0
// REST API:    https://services5.arcgis.com/7nsPwEMP38bSkCjy/arcgis/rest/services/Trees_Data_Bureau_of_Street_Services/FeatureServer/0/query
// License:     City of LA Open Data Terms (permissive; attribution requested).
//
// ~720k street trees citywide, biggest single-city add to date and
// fills the zone-9b/10a hole in our public-tier coverage (current
// imports max out around 8a/8b).
//
// Run with:
//   npm run import:la-trees
//
// Requires a 'Los Angeles public' region row before running.

import {
  fetchArcGisLayer,
  runImport,
  type ImportConfig
} from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'la-bss-trees';
const ENDPOINT =
  'https://services5.arcgis.com/7nsPwEMP38bSkCjy/arcgis/rest/services/Trees_Data_Bureau_of_Street_Services/FeatureServer/0/query';
const REGION_NAME = 'Los Angeles public';

/** ArcGIS GeoJSON feature shape. LA BSS layer is unusual: species
 *  data is encoded in a single TOOLTIP string field rather than
 *  separate columns:
 *    "Tree ID: 224040\\nLocation: ...\\nSpecies: AUSTRALIAN WILLOW\\nBotanical Name: GEIJERA PARVIFLORA"
 *  Many rows say "Not Specified" — those get dropped server-side. */
interface ArcGisFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    TreeID?: number;
    TOOLTIP?: string;
  };
}

/** Parse "Tree ID: ...\nLocation: ...\nSpecies: COMMON\nBotanical Name: LATIN"
 *  into structured pieces. Returns null when species/botanical are
 *  missing or stub-valued ("Not Specified"). */
function parseTooltip(tt: string | undefined): { latin?: string; common?: string } | null {
  if (!tt) return null;
  // The tooltip contains literal "\n" characters (backslash-n), not
  // actual newlines, in some responses. Split on either.
  const parts = tt.split(/\\n|\n/);
  let latin: string | undefined;
  let common: string | undefined;
  for (const p of parts) {
    const m = p.match(/^\s*([^:]+):\s*(.*?)\s*$/);
    if (!m) continue;
    const key = m[1].trim().toLowerCase();
    const val = m[2].trim();
    if (val === 'Not Specified' || val === '') continue;
    if (key === 'botanical name') latin = val;
    else if (key === 'species') common = val;
  }
  if (!latin) return null;
  return { latin, common };
}

const config: ImportConfig<ArcGisFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Los Angeles BSS Trees',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of Los Angeles Bureau of Street Services tree inventory ' +
    '(~720k street trees citywide). Permissive City of LA Open Data ' +
    'terms; attribution requested.',
  regionName: REGION_NAME,
  license: 'City of LA Open Data Terms',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      // Server-side filter: drop rows where species is "Not Specified".
      // ~30%+ of LA's inventory is unidentified by inspection — paying
      // neither bandwidth nor matcher time on those.
      where: "TOOLTIP NOT LIKE '%Not Specified%'"
    }) as Promise<ArcGisFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const lng = Number(f.geometry?.coordinates?.[0]);
    const lat = Number(f.geometry?.coordinates?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    const parsed = parseTooltip(f.properties?.TOOLTIP);
    if (!parsed?.latin) return null;
    return {
      externalId: String(f.properties?.TreeID ?? f.properties?.OBJECTID ?? `${lng.toFixed(6)},${lat.toFixed(6)}`),
      scientificName: parsed.latin,
      commonName: parsed.common,
      lng,
      lat,
      raw: f
    };
  }
};

runImport(config).catch((err) => {
  console.error('LA trees import failed:', err);
  process.exit(1);
});
