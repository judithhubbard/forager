// City of Calgary — Public Trees inventory (direct ArcGIS endpoint).
//
// Source: ArcGIS Online item dfdce03f6fe24bd693c67fc43a9ca7e9
//   ("Public Trees", owner: calgary.ca)
// Portal: https://data.calgary.ca/Environment/Public-Trees/tfs4-3wwa
// REST:   https://services1.arcgis.com/AVP60cs0Q9PEA8rH/arcgis/rest/services/Public_Trees/FeatureServer/0
// License: City of Calgary Open Data Terms of Use
//   https://data.calgary.ca/d/Open-Data-Terms/u45n-7awa  (permissive, attribution)
//
// ~580k total records, ~500k actual TREE rows. The remaining ~80k
// are STUMPs and planting sites — filtered server-side via
// ASSET_TYPE='TREE'. Calgary covers USDA zone 3b/4a — currently the
// coldest direct-municipal coverage in the public tier.
//
// Why direct vs. the Socrata mirror: the ArcGIS endpoint exposes
// separate GENUS / SPECIES / CULTIVAR / COMMON_NAME columns, while
// the Socrata `tfs4-3wwa.json` flattens these into one `comm_code`
// + `common_name` (uppercased "ELM, BRANDON" style). We get cleaner
// Latin binomials by combining GENUS + SPECIES from the direct feed.
//
// (The Dryad "63 cities" aggregator already covers Calgary at ~474k
// rows but with messier species fields; this import refreshes those
// pins idempotently with cleaner taxonomy.)
//
// Run: npm run import:calgary-trees
// Pre-req: a 'Calgary public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'calgary-public-trees';
const ENDPOINT =
  'https://services1.arcgis.com/AVP60cs0Q9PEA8rH/arcgis/rest/services/Public_Trees/FeatureServer/0/query';
const REGION_NAME = 'Calgary public';

interface ArcGisFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    WAM_ID?: string;        // stable cross-system tree id, e.g. "T-51024072"
    ASSET_CD?: string;
    ASSET_TYPE?: string;    // 'TREE' | 'STUMP' | 'PLANTING SITE' (we filter to TREE)
    GENUS?: string;         // "ULMUS"
    SPECIES?: string;       // "AMERICANA"  (note: uppercase in source)
    CULTIVAR?: string;      // "BRANDON"   (often null)
    COMMON_NAME?: string;   // "ELM, BRANDON"  (also uppercase, "common, modifier" form)
    HORT_CODE?: string;     // "ULAMBR"
  };
}

/** Combine GENUS + SPECIES into a sentence-case Latin binomial.
 *  e.g. "ULMUS" + "AMERICANA" → "Ulmus americana".
 *  Returns null when genus is missing or a non-taxonomic placeholder. */
function buildLatin(genus?: string, species?: string): string | null {
  const g = (genus ?? '').trim();
  if (!g) return null;
  // Calgary uses these for non-tree rows that slipped past the
  // ASSET_TYPE filter (some STUMP rows still tag a former genus,
  // some planting sites use 'UNKNOWN').
  if (g === 'UNKNOWN' || g === 'NONE' || g === 'VACANT') return null;
  const genusCased = g[0] + g.slice(1).toLowerCase();
  const s = (species ?? '').trim().toLowerCase();
  if (!s || s === 'sp' || s === 'spp' || s === 'sp.' || s === 'spp.' || s === 'unknown') {
    return genusCased;
  }
  return `${genusCased} ${s}`;
}

const config: ImportConfig<ArcGisFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Calgary Public Trees',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of Calgary Public Trees inventory (direct ArcGIS feed, ' +
    '~500k tree records once ASSET_TYPE=TREE filter is applied). ' +
    'City of Calgary Open Data Terms (permissive, attribution). ' +
    'Provides cleaner Latin binomials than the Socrata mirror by ' +
    'splitting GENUS + SPECIES + CULTIVAR.',
  regionName: REGION_NAME,
  license: 'City of Calgary Open Data Terms of Use',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      // Server-side filter: drop ~80k STUMP / PLANTING SITE rows.
      where: "ASSET_TYPE = 'TREE'"
    }) as Promise<ArcGisFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const lng = Number(f.geometry?.coordinates?.[0]);
    const lat = Number(f.geometry?.coordinates?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

    const latin = buildLatin(f.properties?.GENUS, f.properties?.SPECIES);
    if (!latin) return null;

    // COMMON_NAME is "GENUS, MODIFIER" (e.g. "ELM, BRANDON"). Drop
    // the modifier and lowercase: that's the form forageable_species
    // expects ("elm", "oak", etc.). Falls back to the full string if
    // there's no comma.
    const rawCommon = (f.properties?.COMMON_NAME ?? '').trim();
    const baseCommon = rawCommon.split(',')[0].trim().toLowerCase();

    return {
      externalId: String(
        f.properties?.WAM_ID
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
  console.error('Calgary trees import failed:', err);
  process.exit(1);
});
