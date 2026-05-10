// Stiles la-trees — LA-County street trees for the *non-LA-city*
// municipalities. Repo: https://github.com/stiles/la-trees
//
// Top-level repo license: MIT. The README states the underlying
// records were "collected from municipalities via the California
// Public Records Act or official open-data portals" — i.e. either
// public-records-act outputs (free for any use under CA law) or
// re-publication of municipal open-data feeds. We map the cities
// where the upstream is a known permissively-licensed open-data
// portal *and* the schema is clean enough to extract Latin name +
// lat/lng without ambiguity. Cities whose source license needs
// independent verification are listed in the LICENSE-PENDING block
// below and skipped; they can be enabled per-city as we audit them.
//
// We deliberately exclude:
//   - los-angeles-city  (already imported via the BSS TreeKeeper
//                        feed, ~720k pins — see la-trees.ts).
//   - los-angeles-county (unincorporated areas; licensing is via
//                        LA County DPW which doesn't publish a
//                        clean open-data terms doc — audit pending).
//
// Each enabled city becomes its own import_source ("stiles-<slug>")
// and lands in its own region ("<City Name> public"). The pre-req
// regions list at the bottom of this comment block tells you what
// to create before running.
//
// Run: npm run import:stiles-la-county-trees
//
// Pre-req regions (create these in `regions` before running):
//   - Beverly Hills public
//   - Pasadena public
//   - Santa Monica public
//   - Long Beach public
//   - Glendale public
//   - Burbank public
//   - Culver City public
//   - West Hollywood public
//
// Skipping a single city is supported via the CITY_SLUG env var:
//   CITY_SLUG=pasadena npm run import:stiles-la-county-trees

import {
  fetchGeoJsonUrl,
  normalizeSpeciesName,
  type ImportConfig
} from './lib/framework';
import {
  registerImportSource,
  startImportRun,
  finishImportRun,
  loadSpecies,
  matchSpecies,
  bulkUpsertImportedPins,
  type ImportRecord,
  type ImportRow,
  type ImportRunSummary
} from './lib/upsert';
import postgres from 'postgres';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: resolve(process.cwd(), '.env.local') });
loadEnv({ path: resolve(process.cwd(), '.env') });

const RAW_BASE = 'https://raw.githubusercontent.com/stiles/la-trees/main/data/municipalities';

/** Per-city manifest. The mapper extracts {latin, common, lng, lat}
 *  from a single GeoJSON Feature — every city's schema is slightly
 *  different (Stiles preserved each upstream's column naming). */
interface CityDef {
  slug: string;                  // repo directory + filename stem
  cityName: string;              // human display
  regionName: string;            // must exist in `regions`
  geojsonFile: string;           // path under RAW_BASE/<slug>/
  estimatedRows: number;         // for the dashboard / logs
  upstreamLicenseNote: string;   // 1-line description of the source
  /** Return null to skip the feature. */
  mapper(f: Feature): {
    externalId: string;
    latin: string;
    common?: string;
    lng: number;
    lat: number;
  } | null;
}

type Feature = {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: Record<string, unknown> | null;
};

/** Helper: prefer attribute lat/lng when the geometry CRS isn't
 *  WGS84 (some cities — notably Santa Monica — encode geometry in
 *  EPSG:2229 California State Plane Zone V but include WGS84 lat/lon
 *  in properties). Returns null if neither is usable. */
function pickLngLat(f: Feature, latKey?: string, lonKey?: string): { lng: number; lat: number } | null {
  if (latKey && lonKey && f.properties) {
    const lat = Number(f.properties[latKey]);
    const lng = Number(f.properties[lonKey]);
    if (Number.isFinite(lat) && Number.isFinite(lng) &&
        Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lng, lat };
    }
  }
  const c = f.geometry?.coordinates;
  if (c) {
    const lng = Number(c[0]);
    const lat = Number(c[1]);
    if (Number.isFinite(lng) && Number.isFinite(lat) &&
        Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lng, lat };
    }
  }
  return null;
}

/** LA-County rough bbox sanity check (filters out (0,0) and other
 *  bogus coords without dropping valid edge cases). */
function inLaCountyBbox(lng: number, lat: number): boolean {
  return lat >= 33.5 && lat <= 35.0 && lng >= -119.0 && lng <= -117.5;
}

const CITIES: CityDef[] = [
  {
    slug: 'pasadena',
    cityName: 'Pasadena',
    regionName: 'Pasadena public',
    geojsonFile: 'pasadena.geojson',
    estimatedRows: 71_000,
    upstreamLicenseNote: 'City of Pasadena ArcGIS Hub (open data, attribution requested).',
    mapper(f) {
      const p = f.properties ?? {};
      const genus = String(p.Genus ?? '').trim();
      const species = String(p.Species ?? '').trim();
      if (!genus || !species) return null;
      // Repo stores genus/species in UPPER CASE; normalize to
      // "Genus species" so the species matcher's exact path hits.
      const latin = `${genus.charAt(0).toUpperCase()}${genus.slice(1).toLowerCase()} ${species.toLowerCase()}`;
      const common = String(p.Common_Name ?? '').trim() || undefined;
      const loc = pickLngLat(f);
      if (!loc || !inLaCountyBbox(loc.lng, loc.lat)) return null;
      const status = String(p.Status_Text ?? '').toLowerCase();
      if (status === 'removed' || status === 'inactive') return null;
      const eid = String(p.Tree_Rec ?? p.OBJECTID ?? `${loc.lng.toFixed(6)},${loc.lat.toFixed(6)}`);
      return { externalId: eid, latin, common, ...loc };
    }
  },
  {
    slug: 'beverly-hills',
    cityName: 'Beverly Hills',
    regionName: 'Beverly Hills public',
    geojsonFile: 'beverly-hills.geojson',
    estimatedRows: 29_000,
    upstreamLicenseNote: 'City of Beverly Hills Open Data Hub (permissive, attribution).',
    mapper(f) {
      const p = f.properties ?? {};
      const latin = String(p.BOTANICAL ?? '').trim();
      if (!latin) return null;
      const common = String(p.species ?? '').trim() || undefined;
      const loc = pickLngLat(f);
      if (!loc || !inLaCountyBbox(loc.lng, loc.lat)) return null;
      const eid = String(p.TREEID ?? p.OBJECTID ?? `${loc.lng.toFixed(6)},${loc.lat.toFixed(6)}`);
      return { externalId: eid, latin, common, ...loc };
    }
  },
  {
    slug: 'santa-monica',
    cityName: 'Santa Monica',
    regionName: 'Santa Monica public',
    geojsonFile: 'santa-monica.geojson',
    estimatedRows: 32_000,
    upstreamLicenseNote: 'City of Santa Monica GIS open data (permissive, attribution).',
    mapper(f) {
      const p = f.properties ?? {};
      const latin = String(p.BotanicalN ?? '').trim();
      if (!latin) return null;
      const common = String(p.species ?? '').trim() || undefined;
      // CRITICAL: Santa Monica geometry is EPSG:2229 (CA State Plane
      // Zone V) but property fields `lat`/`lon` are WGS84. Use those.
      const loc = pickLngLat(f, 'lat', 'lon');
      if (!loc || !inLaCountyBbox(loc.lng, loc.lat)) return null;
      const eid = String(p.Customer_T ?? p.OBJECTID ?? `${loc.lng.toFixed(6)},${loc.lat.toFixed(6)}`);
      return { externalId: eid, latin, common, ...loc };
    }
  },
  {
    slug: 'long-beach',
    cityName: 'Long Beach',
    regionName: 'Long Beach public',
    geojsonFile: 'long-beach.geojson',
    estimatedRows: 140_000,
    upstreamLicenseNote: 'data.longbeach.gov open data terms (permissive, attribution).',
    mapper(f) {
      const p = f.properties ?? {};
      const latin = String(p.BOTANICALN ?? '').trim();
      if (!latin) return null;
      const common = String(p.species ?? '').trim() || undefined;
      const loc = pickLngLat(f);
      if (!loc || !inLaCountyBbox(loc.lng, loc.lat)) return null;
      const eid = String(p.INVENTORYI ?? `${loc.lng.toFixed(6)},${loc.lat.toFixed(6)}`);
      return { externalId: eid, latin, common, ...loc };
    }
  },
  {
    slug: 'glendale',
    cityName: 'Glendale',
    regionName: 'Glendale public',
    geojsonFile: 'glendale.geojson',
    estimatedRows: 56_000,
    upstreamLicenseNote: 'City of Glendale GIS open data (permissive, attribution).',
    mapper(f) {
      const p = f.properties ?? {};
      const latin = String(p.botanical ?? '').trim();
      if (!latin) return null;
      const common = String(p.species ?? '').trim() || undefined;
      const loc = pickLngLat(f, 'lat', 'lon');
      if (!loc || !inLaCountyBbox(loc.lng, loc.lat)) return null;
      const valid = String(p.IsValid ?? '').trim().toLowerCase();
      if (valid && valid !== 'yes') return null;
      const eid = String(p.InventoryID ?? `${loc.lng.toFixed(6)},${loc.lat.toFixed(6)}`);
      return { externalId: eid, latin, common, ...loc };
    }
  },
  {
    slug: 'burbank',
    cityName: 'Burbank',
    regionName: 'Burbank public',
    geojsonFile: 'burbank.geojson',
    estimatedRows: 37_000,
    upstreamLicenseNote: 'City of Burbank GIS open data (permissive, attribution).',
    mapper(f) {
      const p = f.properties ?? {};
      const latin = String(p.SPP ?? '').trim();
      if (!latin) return null;
      const loc = pickLngLat(f, 'lat', 'lon');
      if (!loc || !inLaCountyBbox(loc.lng, loc.lat)) return null;
      const active = Number(p.ACTIVE);
      if (Number.isFinite(active) && active === 0) return null;
      const eid = String(p.UNIQUEID ?? p.ID ?? `${loc.lng.toFixed(6)},${loc.lat.toFixed(6)}`);
      return { externalId: eid, latin, ...loc };
    }
  },
  {
    slug: 'culver-city',
    cityName: 'Culver City',
    regionName: 'Culver City public',
    geojsonFile: 'culver-city.geojson',
    estimatedRows: 17_000,
    upstreamLicenseNote: 'City of Culver City GIS open data (permissive, attribution).',
    mapper(f) {
      const p = f.properties ?? {};
      const latin = String(p.BotanicalN ?? '').trim();
      if (!latin || latin.toLowerCase() === 'vacant site') return null;
      const common = String(p.species ?? '').trim() || undefined;
      const loc = pickLngLat(f, 'lat', 'lon');
      if (!loc || !inLaCountyBbox(loc.lng, loc.lat)) return null;
      // No stable per-row id field; address + side + tree-num is the
      // closest natural key.
      const eid = `${p.Address ?? '?'}-${p.Street ?? '?'}-${p.SideType ?? '?'}-${p.Tree ?? '?'}`;
      return { externalId: eid, latin, common, ...loc };
    }
  },
  {
    slug: 'west-hollywood',
    cityName: 'West Hollywood',
    regionName: 'West Hollywood public',
    geojsonFile: 'west-hollywood.geojson',
    estimatedRows: 9_000,
    upstreamLicenseNote: 'City of West Hollywood open data (permissive, attribution).',
    mapper(f) {
      const p = f.properties ?? {};
      const latin = String(p.BotName ?? '').trim();
      if (!latin || latin.toLowerCase() === 'vacant site') return null;
      const common = String(p.species ?? '').trim() || undefined;
      const loc = pickLngLat(f, 'Lat', 'Lon');
      if (!loc || !inLaCountyBbox(loc.lng, loc.lat)) return null;
      const eid = String(p.OID ?? p.ID ?? `${loc.lng.toFixed(6)},${loc.lat.toFixed(6)}`);
      return { externalId: eid, latin, common, ...loc };
    }
  }
];

// LICENSE-PENDING (NOT imported until per-city audit completes):
//   - los-angeles-city: duplicate of la-trees.ts (BSS feed).
//   - los-angeles-county: LA County DPW; need explicit OD terms.
//   - santa-clarita, lancaster, palmdale, downey, norwalk, carson,
//     inglewood, cerritos, alhambra, arcadia, el-monte, pomona,
//     redondo-beach, whittier, glendora, la-mirada, agoura-hills,
//     bell-gardens, bellflower, diamond-bar, duarte, el-segundo,
//     la-verne, lawndale, lomita, malibu, paramount, rancho-palos-
//     verdes, san-dimas, san-fernando, san-gabriel, san-marino,
//     south-gate, south-pasadena, temple-city, walnut, ventura-
//     county/simi-valley, artesia, commerce, covina, sante-fe-springs:
//     either CPRA-FOIA outputs (not necessarily redistributable),
//     or upstream open-data portals exist but need per-city license
//     verification. Re-enable individually after audit.

/** Standalone runner — registers each city as its own import_source,
 *  runs one source at a time so a single failure doesn't poison the
 *  others. Connections / advisory locks scoped per city. */
async function main(): Promise<void> {
  const dbUrl = process.env.SUPABASE_DB_URL;
  const userId = process.env.FORAGER_DEV_USER_ID;
  if (!dbUrl) throw new Error('SUPABASE_DB_URL missing.');
  if (!userId) throw new Error('FORAGER_DEV_USER_ID missing.');

  const onlySlug = process.env.CITY_SLUG?.trim();
  const targets = onlySlug
    ? CITIES.filter((c) => c.slug === onlySlug)
    : CITIES;
  if (targets.length === 0) {
    throw new Error(`No matching city for CITY_SLUG="${onlySlug}". Known: ${CITIES.map((c) => c.slug).join(', ')}`);
  }

  for (const city of targets) {
    console.log(`\n=== ${city.cityName} (${city.slug}) — est ${city.estimatedRows.toLocaleString()} rows ===`);
    try {
      await importOne(city, dbUrl, userId);
    } catch (err) {
      console.error(`  FAILED ${city.slug}:`, err instanceof Error ? err.message : err);
      // Continue with next city.
    }
  }
}

async function importOne(city: CityDef, dbUrl: string, userId: string): Promise<void> {
  const sourceId = `stiles-${city.slug}`;
  const url = `${RAW_BASE}/${city.slug}/${city.geojsonFile}`;
  const sourceConfig: Omit<ImportConfig<Feature>, 'fetchAll' | 'mapFeature'> = {
    sourceId,
    sourceName: `${city.cityName} Trees (Stiles la-trees)`,
    sourceUrl: url,
    sourceDescription:
      `${city.cityName} street tree inventory via the stiles/la-trees ` +
      `repository (MIT-licensed aggregator). Upstream source: ` +
      city.upstreamLicenseNote +
      ` Estimated ~${city.estimatedRows.toLocaleString()} trees.`,
    regionName: city.regionName,
    license: `MIT (Stiles la-trees) + upstream: ${city.upstreamLicenseNote}`
  };

  const features = (await fetchGeoJsonUrl({
    url,
    label: `${city.slug}/${city.geojsonFile}`
  })) as Feature[];

  const sql = postgres(dbUrl, { ssl: 'require', onnotice: () => undefined });
  try {
    const { regionId } = await registerImportSource(sql, {
      sourceId: sourceConfig.sourceId,
      name: sourceConfig.sourceName,
      url: sourceConfig.sourceUrl,
      description: sourceConfig.sourceDescription,
      regionName: sourceConfig.regionName,
      license: sourceConfig.license
    });
    await sql`select pg_advisory_lock(hashtext(${`${regionId}:${sourceId}`}))`;
    const runId = await startImportRun(sql, sourceId, userId);
    const summary: ImportRunSummary = {
      pinsCreated: 0,
      pinsUpdated: 0,
      pinsSkippedUnmatched: 0,
      errors: []
    };

    const species = await loadSpecies(sql);
    const matched: ImportRow[] = [];
    for (const f of features) {
      const m = city.mapper(f);
      if (!m) continue;
      const rec: ImportRecord = {
        externalId: m.externalId,
        scientificName: normalizeSpeciesName(m.latin),
        commonName: m.common,
        lng: m.lng,
        lat: m.lat,
        raw: f
      };
      const sp = matchSpecies(species, rec);
      if (!sp) {
        summary.pinsSkippedUnmatched++;
        continue;
      }
      matched.push({
        externalId: rec.externalId,
        speciesId: sp.id,
        lng: rec.lng,
        lat: rec.lat,
        raw: rec.raw
      });
    }

    await sql`set session_replication_role = replica`;
    const BATCH = 500;
    for (let i = 0; i < matched.length; i += BATCH) {
      const slice = matched.slice(i, i + BATCH);
      try {
        const r = await bulkUpsertImportedPins(sql, {
          regionId,
          sourceId,
          userId,
          rows: slice
        });
        summary.pinsCreated += r.created;
        summary.pinsUpdated += r.updated;
        process.stdout.write(`  batch ${Math.floor(i / BATCH) + 1}: +${r.created} new, ${r.updated} updated\n`);
      } catch (err) {
        summary.errors.push({
          externalId: `batch-${i}`,
          message: err instanceof Error ? err.message : String(err)
        });
      }
    }
    await sql`set session_replication_role = origin`;

    await finishImportRun(sql, runId, summary);
    await sql`select pg_advisory_unlock(hashtext(${`${regionId}:${sourceId}`}))`;

    if (summary.pinsCreated > 0 || summary.pinsUpdated > 0) {
      try {
        await sql`select public.refresh_pin_density()`;
      } catch (err) {
        console.warn('  refresh_pin_density failed (non-fatal):',
          err instanceof Error ? err.message : err);
      }
    }

    console.log(`  ${city.slug}: created=${summary.pinsCreated} updated=${summary.pinsUpdated} skipped=${summary.pinsSkippedUnmatched} errors=${summary.errors.length}`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('Stiles LA-County trees import failed:', err);
  process.exit(1);
});
