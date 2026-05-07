// Regenerate static/usda-zones.geojson with topology-aware
// simplification so adjacent zone polygons share their boundaries
// after simplification (no more criss-crossing edges at zone
// borders).
//
// Why mapshaper instead of PostGIS:
//   ST_SimplifyPreserveTopology is per-feature — it preserves
//   topology *within* a polygon but two adjacent polygons get
//   simplified independently and their shared boundary diverges.
//   PostGIS ST_CoverageSimplify (added in 3.5) would handle this,
//   but Supabase ships PostGIS 3.3. mapshaper's `-simplify` builds
//   a topology first (like TopoJSON) so all polygons sharing an
//   arc see the same simplified output.
//
// Source: 49 per-state OPHZ GeoJSONs from the kgjenkins/ophz repo.
// Dissolves by zone code first (so each zone is a single feature
// across all 49 states), then simplifies.
//
// Run:
//   npm run regen:usda-zones-static
//
// Idempotent — overwrites static/usda-zones.geojson.

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import mapshaperDefault from 'mapshaper';
// mapshaper has no published types; the runtime exposes applyCommands
// at the default export.
const mapshaper = mapshaperDefault as unknown as {
  applyCommands(cmd: string, inputs: Record<string, string | Buffer>): Promise<Record<string, Buffer | string>>;
};

const STATES = [
  'AL', 'AR', 'AZ', 'CA', 'CO', 'CT', 'DC', 'DE', 'FL', 'GA',
  'IA', 'ID', 'IL', 'IN', 'KS', 'KY', 'LA', 'MA', 'MD', 'ME',
  'MI', 'MN', 'MO', 'MS', 'MT', 'NC', 'ND', 'NE', 'NH', 'NJ',
  'NM', 'NV', 'NY', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD',
  'TN', 'TX', 'UT', 'VA', 'VT', 'WA', 'WI', 'WV', 'WY'
];
const URL_BASE = 'https://raw.githubusercontent.com/kgjenkins/ophz/master/geojson/ophz_';

interface Feature {
  type: 'Feature';
  properties: { ZONE?: string; STUSPS?: string; zone?: string };
  geometry: unknown;
}

async function fetchOne(state: string): Promise<Feature[]> {
  const res = await fetch(`${URL_BASE}${state}.geojson`);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${state}`);
  const fc = (await res.json()) as { features?: Feature[] };
  // Normalize ZONE → zone for mapshaper's case-sensitive dissolve key.
  for (const f of fc.features ?? []) {
    f.properties.zone = f.properties.ZONE ?? f.properties.zone;
  }
  return fc.features ?? [];
}

async function main(): Promise<void> {
  console.log('Fetching 49 state GeoJSONs from OPHZ …');
  const all: Feature[] = [];
  for (let i = 0; i < STATES.length; i += 8) {
    const batch = await Promise.all(STATES.slice(i, i + 8).map(fetchOne));
    for (const features of batch) all.push(...features);
    process.stdout.write(`  ${Math.min(i + 8, STATES.length)}/${STATES.length}\n`);
  }
  console.log(`Loaded ${all.length} polygons.`);

  const merged = JSON.stringify({ type: 'FeatureCollection', features: all });
  console.log(`Merged FeatureCollection: ${(merged.length / 1024 / 1024).toFixed(1)} MB`);

  // mapshaper pipeline:
  //   -i in.geojson           input
  //   -dissolve zone          merge polygons by zone code → one feature per zone
  //   -filter-fields zone     drop STATEFP/NAME/etc. (slimmer output)
  //   -simplify 5%            keep 5% of vertices, topology-aware so adjacent
  //                           polygons share simplified arcs
  //   -filter-islands min-area=0.5km2
  //                           drop tiny zone slivers
  //   -clean                  fix any remaining small intersections / overlaps
  //   -o out.geojson          write
  const cmd = [
    '-i in.geojson',
    // Dissolve adjacent same-zone polygons before simplification so
    // zone-internal seams disappear and the simplifier sees a clean
    // coverage of 17 zone features.
    '-dissolve zone',
    '-filter-fields zone',
    // Topology-aware Visvalingam simplify: shared boundaries between
    // adjacent zones use the same simplified arc, so no criss-crossing.
    // 3% keeps roughly the most informative ~30k vertices nationwide;
    // adequate at the city-overview zooms where this overlay is useful.
    '-simplify 3% keep-shapes',
    // Drop slivers under 50 sq km — these are zone islands too small
    // to read at any zoom users will see. Cuts payload meaningfully.
    '-filter-islands min-area=50km2',
    // Reconcile any topology hiccups introduced by the simplify step.
    '-clean',
    '-o format=geojson out.geojson'
  ].join(' ');
  console.log(`Running: mapshaper ${cmd}`);

  const out = await mapshaper.applyCommands(
    cmd,
    { 'in.geojson': merged }
  ) as Record<string, Buffer | string>;
  const result = out['out.geojson'];
  const json = typeof result === 'string' ? result : result.toString('utf8');

  const dest = resolve(process.cwd(), 'static/usda-zones.geojson');
  writeFileSync(dest, json);
  const sizeMB = json.length / 1024 / 1024;
  console.log(`Wrote ${dest} (${sizeMB.toFixed(2)} MB)`);

  // Quick sanity: count features in output
  const parsed = JSON.parse(json) as { features?: unknown[] };
  console.log(`Output feature count: ${parsed.features?.length ?? '?'}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
