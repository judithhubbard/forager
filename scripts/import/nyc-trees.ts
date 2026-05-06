// NYC Street Tree Census 2015 — public dataset of every street tree
// in NYC with species + location. ~600k trees; only a small fraction
// are forageable, but the framework filters by species match so what
// lands in the public layer is just the apple/pear/mulberry/cherry
// subset.
//
// Source: https://data.cityofnewyork.us/Environment/2015-Street-Tree-Census-Tree-Data/uvpi-gqnh
// License: public domain (NYC OpenData TOS)
//
// Run with:
//   npm run import:nyc-trees
//
// Requires: SUPABASE_DB_URL + FORAGER_DEV_USER_ID env vars (same
// setup as the other importers). The destination region must exist —
// create one via /welcome (admin) and use its name in REGION_NAME.

import {
  fetchOpenDataApiJson,
  runImport,
  type ImportConfig
} from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'nyc-trees-2015';
const ENDPOINT = 'https://data.cityofnewyork.us/resource/uvpi-gqnh.json';
// Region the public NYC pins land in. Provision this via the admin
// portal before running the script.
const REGION_NAME = 'NYC public';

interface NycTree {
  tree_id?: string;
  spc_latin?: string;     // 'Pyrus calleryana', 'Acer rubrum', …
  spc_common?: string;    // 'Callery pear'
  status?: string;        // 'Alive', 'Stump', 'Dead'
  health?: string;
  latitude?: string;
  longitude?: string;
  the_geom?: { type: 'Point'; coordinates: [number, number] };
}

const config: ImportConfig<NycTree> = {
  sourceId: SOURCE_ID,
  sourceName: 'NYC Street Tree Census (2015)',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'NYC Department of Parks & Recreation street tree inventory, ' +
    'collected by volunteers in 2015. Public domain via NYC OpenData.',
  regionName: REGION_NAME,
  license: 'NYC OpenData TOS (public domain)',
  async fetchAll() {
    // Filter at the API tier so we only download alive trees with a
    // latin name. Cuts payload roughly in half.
    return fetchOpenDataApiJson({
      url: ENDPOINT,
      where: "status = 'Alive' AND spc_latin IS NOT NULL"
    }) as Promise<NycTree[]>;
  },
  mapFeature(t): ImportRecord | null {
    const lng = t.the_geom?.coordinates?.[0] ?? Number(t.longitude);
    const lat = t.the_geom?.coordinates?.[1] ?? Number(t.latitude);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return {
      externalId: t.tree_id ?? `${lng.toFixed(6)},${lat.toFixed(6)}`,
      scientificName: t.spc_latin,
      commonName: t.spc_common,
      lng: Number(lng),
      lat: Number(lat),
      raw: t
    };
  }
};

runImport(config).catch((err) => {
  console.error('NYC trees import failed:', err);
  process.exit(1);
});
