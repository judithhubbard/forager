// Generic municipal-tree-inventory importer driven by per-source
// schema detection. Works on any of the OpenTrees-discovered
// USA + Canada sources downloaded to data/raw/opentrees/.
//
// Output region: "OpenTrees municipal (US/Canada)" (created if
// missing). One import_source row per city, IDed as
// "opentrees-<city-id>".
//
// Reuses the same schema heuristics as data/exploration/dry-run-
// import.cjs: try standard sci/common column candidates, then
// disambiguate the ambiguous "species" column by sampling values,
// then fall back to a POINT (WKT) column if no lat/lng pair is
// found.
//
// Idempotent. Safe to re-run.

const postgres = require('postgres');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { config: loadEnv } = require('dotenv');

loadEnv({ path: path.resolve(__dirname, '../..', '.env.local') });

const DOWNLOADS = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, '../../data/exploration/download-results.json'),
    'utf8'
  )
);

const REGION_NAME = 'OpenTrees municipal (US/Canada)';

/** Hardcoded city centroids per OpenTrees source id. Used for the
 *  post-extraction outlier check: any pin >CENTROID_RADIUS_KM from
 *  the city's center is rejected. Catches three classes of source-
 *  side data corruption that look fine row-by-row:
 *    - Lat/lng columns inverted (Nichols Arboretum: lat-stored value
 *      is actually a longitude). Each row is in valid WGS84 range
 *      but plots in the south Atlantic.
 *    - Sign-flipped longitudes (Sioux Falls had 3 such rows).
 *    - Wrong-city CSVs accidentally renamed.
 *  Sources without a centroid here are imported without the check.
 *  When adding a new source, look up the city's lat/lng on Wikipedia
 *  or OSM and add an entry. */
const CITY_CENTROIDS = {
  edmonton:           { lat: 53.5461,  lng: -113.4938 },
  calgary:            { lat: 51.0447,  lng: -114.0719 },
  vancouver:          { lat: 49.2827,  lng: -123.1207 },
  surrey:             { lat: 49.1913,  lng: -122.8490 },
  winnipeg:           { lat: 49.8951,  lng: -97.1384  },
  regina:             { lat: 50.4452,  lng: -104.6189 },
  strathcona:         { lat: 53.6311,  lng: -113.4209 },
  ottawa:             { lat: 45.4215,  lng: -75.6972  },
  moncton:            { lat: 46.0878,  lng: -64.7782  },
  providence:         { lat: 41.8240,  lng: -71.4128  },
  cupertino:          { lat: 37.3230,  lng: -122.0322 },
  oxnard:             { lat: 34.1975,  lng: -119.1771 },
  three_rivers:       { lat: 44.9619,  lng: -93.4619  }, // Three Rivers Park District, MN
  mountain_view:      { lat: 37.3861,  lng: -122.0839 },
  richardson:         { lat: 32.9483,  lng: -96.7299  },
  sioux_falls:        { lat: 43.5446,  lng: -96.7311  },
  charlottesville_nc: { lat: 35.5982,  lng: -82.5515  }, // labelled NC but src is Charlottesville VA
  weston_fl:          { lat: 26.1003,  lng: -80.3997  },
  west_chester_pa:    { lat: 39.9601,  lng: -75.6058  },
  champaign_il:       { lat: 40.1164,  lng: -88.2434  },
  st_augustine_fl:    { lat: 29.8946,  lng: -81.3145  },
  bozeman_mt:         { lat: 45.6770,  lng: -111.0429 },
  nichols_arboretum:  { lat: 42.2770,  lng: -83.7191  }, // Ann Arbor
  unt:                { lat: 33.2148,  lng: -97.1331  }, // U North Texas, Denton
  westerville_oh:     { lat: 40.1262,  lng: -82.9290  },
  escondido_ca:       { lat: 33.1192,  lng: -117.0864 },
  auburn_me:          { lat: 44.0979,  lng: -70.2312  },
  cape_coral_fl:      { lat: 26.5629,  lng: -81.9495  },
  naperville_il:      { lat: 41.7508,  lng: -88.1535  }
};
/** Radius (km) within which a pin must fall to count as inside the
 *  source's expected city. 50km is generous enough for sprawling
 *  metros (LA, Houston ~30km radius) without admitting cross-state
 *  outliers. Same threshold the Dryad cleanup migration used. */
const CENTROID_RADIUS_KM = 50;

/** Haversine distance in km between two WGS84 points. */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const SCI_KEYS = [
  'botanical_name', 'botanic_name', 'botanical', 'botanic',
  'scientific_name', 'scientific', 'sciname',
  'species_name', 'latin_name', 'latin', 'genus_species',
  'spp_bot', 'spp_bot_', 'binomial', 'science', 'binom'
];
const COM_KEYS = [
  'common_name', 'common', 'commonname', 'name_common',
  'species_common', 'species_co', 'name_eng', 'commonname_',
  'spp_com', 'commonnam'
];
const AMBIG_SPECIES_KEYS = ['species', 'spp', 'specie', 'spec'];
const GENUS_KEYS = ['genus'];
const LAT_KEYS = ['lat', 'latitude', 'y', 'lat_dd', 'point_y'];
const LNG_KEYS = ['lng', 'lon', 'long', 'longitude', 'x', 'lng_dd', 'point_x'];
const ID_KEYS = ['objectid', 'object_id', 'tree_id', 'treeid', 'fid', 'id', 'inventoryid', 'plant_id', 'feature_id'];
const POINT_KEYS = ['point', 'the_geom', 'geom', 'geometry', 'shape'];

const norm = (s) => String(s).toLowerCase().trim().replace(/\s+/g, ' ');

function normalizeSpeciesName(raw) {
  if (!raw) return '';
  let s = String(raw).trim();
  s = s.replace(/['‘’"][^'‘’"]+['‘’"]/g, '');
  s = s.replace(/\([^)]*\)/g, '');
  s = s.replace(/\b(?:subsp|ssp|var|f|cv)\.[^,]*$/i, '');
  s = s.replace(/\bx\s+/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  const tokens = s.split(/\s+/);
  if (tokens.length >= 3) s = `${tokens[0]} ${tokens[1]}`;
  return s;
}

const GENUS_ONLY_PLACEHOLDERS = new Set(['species', 'spp', 'spp.', 'sp', 'sp.']);
const NO_FALLBACK_GENERA = new Set([
  'malus', 'cornus', 'prunus', 'carya', 'juglans', 'pyrus', 'vaccinium', 'ribes'
]);

function isGenusOnly(target) {
  const parts = norm(target).split(/\s+/);
  if (parts.length === 1) return true;
  if (parts.length === 2 && GENUS_ONLY_PLACEHOLDERS.has(parts[1])) return true;
  return false;
}

function matchSpecies(species, sci, com) {
  const sciq = sci ? norm(sci) : '';
  const comq = com ? norm(com) : '';
  if (sciq) {
    const hit = species.find(s => norm(s.scientific_name) === sciq);
    if (hit) return hit;
  }
  if (comq) {
    const hit = species.find(s => norm(s.common_name) === comq);
    if (hit) return hit;
  }
  if (sciq || comq) {
    const hit = species.find(s =>
      (s.aliases ?? []).some(a => norm(a) === sciq || norm(a) === comq));
    if (hit) return hit;
  }
  if (sciq) {
    const parts = sciq.split(/\s+/);
    if (parts.length >= 2 && /^[a-z]+$/i.test(parts[1])) {
      const binomial = `${parts[0]} ${parts[1]}`;
      const hit = species.find(s => norm(s.scientific_name) === binomial);
      if (hit) return hit;
    }
  }
  if (sciq && isGenusOnly(sciq)) {
    const g = sciq.split(/\s+/)[0];
    if (!NO_FALLBACK_GENERA.has(g)) {
      const hit = species.find(s => norm(s.scientific_name).split(/\s+/)[0] === g);
      if (hit) return hit;
    }
  }
  return null;
}

function pickKey(headers, candidates) {
  const lower = headers.map(h => h.toLowerCase());
  for (const c of candidates) {
    const idx = lower.indexOf(c);
    if (idx >= 0) return headers[idx];
  }
  for (const c of candidates) {
    const idx = lower.findIndex(h => h.includes(c));
    if (idx >= 0) return headers[idx];
  }
  return null;
}

function parseCSVRow(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseCSVRow(lines[0]).map(h => h.replace(/^[﻿]/, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const cols = parseCSVRow(lines[i]);
    const r = {};
    for (let j = 0; j < headers.length; j++) r[headers[j]] = cols[j] ?? '';
    rows.push(r);
  }
  return { headers, rows };
}

function loadFile(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  if (ext === 'csv') {
    const text = fs.readFileSync(filePath, 'utf8');
    if (text.trimStart().startsWith('<')) throw new Error('got HTML, not CSV');
    return parseCSV(text);
  }
  if (ext === 'geojson' || ext === 'json') {
    const obj = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (obj && obj.error) throw new Error(`api error: ${obj.error}`);
    if (obj.type !== 'FeatureCollection' || !Array.isArray(obj.features)) {
      throw new Error('not a FeatureCollection');
    }
    const headers = Object.keys(obj.features[0]?.properties || {});
    const rows = obj.features.map(f => {
      const props = { ...(f.properties || {}) };
      if (f.geometry?.type === 'Point') {
        const [lng, lat] = f.geometry.coordinates;
        props.__lng = lng; props.__lat = lat;
      } else if (f.geometry?.type === 'MultiPoint' && f.geometry.coordinates[0]) {
        const [lng, lat] = f.geometry.coordinates[0];
        props.__lng = lng; props.__lat = lat;
      }
      return props;
    });
    return { headers: [...headers, '__lng', '__lat'], rows };
  }
  if (ext === 'zip') {
    const tmpDir = filePath.replace(/\.zip$/, '.unzip');
    if (!fs.existsSync(tmpDir)) {
      execSync(`unzip -o -q "${filePath}" -d "${tmpDir}"`, { stdio: 'pipe' });
    }
    const inners = walkDir(tmpDir).filter(p => /\.(csv|geojson|json)$/i.test(p));
    if (inners.length === 0) throw new Error('zip had no csv/geojson');
    return loadFile(inners[0]);
  }
  throw new Error(`unknown format: ${ext}`);
}

function walkDir(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkDir(p));
    else out.push(p);
  }
  return out;
}

function detectSchema(headers, rows) {
  const out = {
    sciKey: pickKey(headers, SCI_KEYS),
    comKey: pickKey(headers, COM_KEYS),
    genusKey: pickKey(headers, GENUS_KEYS),
    idKey: pickKey(headers, ID_KEYS),
    latKey: headers.includes('__lat') ? '__lat' : pickKey(headers, LAT_KEYS),
    lngKey: headers.includes('__lng') ? '__lng' : pickKey(headers, LNG_KEYS),
    pointKey: null,
    speciesKey: null,
    useGenusPlusSpecies: false
  };
  // Prefer POINT/the_geom WKT column when present — many ArcGIS Hub
  // sources expose x/y as PROJECTED meters (Web Mercator / state
  // plane) which look like valid numbers but plot in the open ocean
  // when interpreted as WGS84 degrees.
  out.pointKey = pickKey(headers, POINT_KEYS);
  // If we have BOTH a point WKT column and naive x/y columns, sample
  // the x/y values: if any row's value falls outside ±180 / ±90, the
  // x/y are projected — fall through to the WKT path.
  if (out.pointKey && out.latKey && out.lngKey) {
    let saneXy = true;
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const lng = parseFloat(rows[i][out.lngKey]);
      const lat = parseFloat(rows[i][out.latKey]);
      if (Number.isFinite(lng) && (lng < -180 || lng > 180)) { saneXy = false; break; }
      if (Number.isFinite(lat) && (lat < -90 || lat > 90)) { saneXy = false; break; }
    }
    if (!saneXy) {
      // Reject the x/y columns; force the importer to use WKT.
      out.latKey = null;
      out.lngKey = null;
    } else {
      // x/y look sane — keep them, drop the WKT fallback.
      out.pointKey = null;
    }
  }
  // If we kept x/y but they look swapped (e.g. Nichols Arboretum
  // had x storing lat, y storing lng), detect by checking sample
  // row magnitudes against expected lat∈[-90,90] / lng∈[-180,180]
  // ranges and swap if needed.
  if (out.latKey && out.lngKey) {
    let nLatLooksLat = 0, nLatLooksLng = 0;
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const v = parseFloat(rows[i][out.latKey]);
      if (!Number.isFinite(v)) continue;
      if (Math.abs(v) <= 90) nLatLooksLat++;
      else if (Math.abs(v) <= 180) nLatLooksLng++;
    }
    if (nLatLooksLng > nLatLooksLat) {
      // The "lat" column actually holds longitudes — swap.
      const tmp = out.latKey;
      out.latKey = out.lngKey;
      out.lngKey = tmp;
    }
  }
  const ambigKey = pickKey(headers, AMBIG_SPECIES_KEYS);
  if (ambigKey) {
    const samples = [];
    for (const r of rows) {
      const v = (r[ambigKey] || '').trim();
      if (v && samples.length < 30) samples.push(v);
      if (samples.length >= 30) break;
    }
    const looksBinomial = samples.filter(s => /^[A-Z][a-z]+\s+[a-z]+/.test(s)).length;
    const looksEpithet = samples.filter(s => /^[a-z]+$/.test(s)).length;
    const looksCommon = samples.filter(s => /[a-zA-Z]+\s+[a-zA-Z]+/.test(s) && !/^[A-Z][a-z]+\s+[a-z]/.test(s)).length;
    if (looksBinomial > samples.length * 0.5) {
      if (!out.sciKey) out.sciKey = ambigKey;
    } else if (looksEpithet > samples.length * 0.5) {
      if (out.genusKey) {
        out.useGenusPlusSpecies = true;
        out.speciesKey = ambigKey;
      }
    } else if (looksCommon > samples.length * 0.5) {
      if (!out.comKey) out.comKey = ambigKey;
    }
  }
  return out;
}

function extractRow(r, schema) {
  let lng = NaN, lat = NaN;
  if (schema.latKey && schema.lngKey) {
    lng = parseFloat(r[schema.lngKey]);
    lat = parseFloat(r[schema.latKey]);
  } else if (schema.pointKey) {
    const v = String(r[schema.pointKey] || '');
    const wkt = v.match(/POINT\s*\(\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*\)/i);
    if (wkt) { lng = parseFloat(wkt[1]); lat = parseFloat(wkt[2]); }
  }
  // Hard validation: WGS84 lng∈[-180,180], lat∈[-90,90]. Anything
  // outside is projected coords or garbage; mark as missing so the
  // row is skipped.
  if (!Number.isFinite(lng) || !Number.isFinite(lat) ||
      lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    lng = NaN; lat = NaN;
  }
  // (0, 0) is "null island" — almost always a default value for
  // missing coordinates, never a real tree.
  if (lng === 0 && lat === 0) { lng = NaN; lat = NaN; }
  let sci = r[schema.sciKey] || '';
  const com = r[schema.comKey] || '';
  if (!sci && schema.useGenusPlusSpecies) {
    const g = (r[schema.genusKey] || '').trim();
    const s = (r[schema.speciesKey] || '').trim();
    if (g && s) sci = `${g} ${s}`;
    else if (g) sci = g;
  }
  if (!sci && schema.genusKey) sci = r[schema.genusKey] || '';
  const sciNorm = normalizeSpeciesName(sci);
  let externalId = schema.idKey ? String(r[schema.idKey] || '').trim() : '';
  if (!externalId && Number.isFinite(lng) && Number.isFinite(lat)) {
    externalId = `${lng.toFixed(6)},${lat.toFixed(6)}`;
  }
  return { lng, lat, sci: sciNorm || sci, com, externalId };
}

async function bulkUpsert(sql, args) {
  if (args.rows.length === 0) return { created: 0, updated: 0 };
  const externalIds = args.rows.map(r => r.externalId);
  const speciesIds = args.rows.map(r => r.speciesId);
  const lngs = args.rows.map(r => r.lng);
  const lats = args.rows.map(r => r.lat);
  const rows = await sql`
    insert into public.pins (
      region_id, created_by, species_id, location, status, visibility,
      import_source, import_external_id
    )
    select
      ${args.regionId}::uuid,
      ${args.userId}::uuid,
      t.species_id::uuid,
      ST_SetSRID(ST_MakePoint(t.lng, t.lat), 4326)::geography,
      'active'::pin_status,
      'public'::text,
      ${args.sourceId},
      t.external_id
      from unnest(
        ${speciesIds}::uuid[],
        ${lngs}::float8[],
        ${lats}::float8[],
        ${externalIds}::text[]
      ) as t(species_id, lng, lat, external_id)
    on conflict (region_id, import_source, import_external_id) do update set
      location = case
        when public.pins.location_modified_by_user_at is null
          then excluded.location
        else public.pins.location
      end,
      updated_at = now()
    returning id, (xmax = 0) as inserted
  `;
  const created = rows.filter(r => r.inserted).length;
  return { created, updated: rows.length - created };
}

async function ensureRegion(sql) {
  const found = await sql`select id from regions where name = ${REGION_NAME} limit 1`;
  if (found.length > 0) return found[0].id;
  // default_pin_visibility constraint allows shared|private (admin
  // imports use 'public' visibility on each pin directly via
  // bulkUpsert, regardless of the region default).
  const inserted = await sql`
    insert into regions (name, timezone, default_pin_visibility)
    values (${REGION_NAME}, 'America/New_York', 'shared')
    returning id
  `;
  return inserted[0].id;
}

async function importOne(sql, source, regionId, userId, species) {
  const sourceId = `opentrees-${source.id}`;
  const cityName = source.short || source.id;
  console.log(`\n=== ${cityName} (${source.country}) — ${source.id} ===`);
  let parsed;
  try {
    parsed = loadFile(source.path);
  } catch (e) {
    console.log(`  ✗ load failed: ${e.message}`);
    return { source: source.id, error: e.message };
  }
  const schema = detectSchema(parsed.headers, parsed.rows);
  console.log(`  rows=${parsed.rows.length.toLocaleString()} sci=${schema.sciKey || '?'} com=${schema.comKey || '?'} id=${schema.idKey || '?'}`);

  // Register import_source
  await sql`
    insert into import_sources (id, name, url, description, region_id, license)
    values (${sourceId}, ${source.long || cityName}, ${source.info || source.download},
            ${`Municipal tree inventory for ${cityName} (${source.country}). Imported via OpenTrees catalog.`},
            ${regionId}, ${source.license || null})
    on conflict (id) do update set
      name = excluded.name,
      url = excluded.url,
      description = excluded.description,
      license = excluded.license
  `;

  // Match against species
  const matched = [];
  let unmatched = 0, latlngMissing = 0, centroidOutliers = 0;
  const centroid = CITY_CENTROIDS[source.id];
  for (const r of parsed.rows) {
    const e = extractRow(r, schema);
    if (!Number.isFinite(e.lng) || !Number.isFinite(e.lat)) {
      latlngMissing++;
      continue;
    }
    // Per-source centroid check: reject pins implausibly far from
    // the city. Catches lat/lng-swap, sign-flip, and wrong-city
    // bugs that look fine row-by-row.
    if (centroid) {
      const distKm = haversineKm(centroid.lat, centroid.lng, e.lat, e.lng);
      if (distKm > CENTROID_RADIUS_KM) {
        centroidOutliers++;
        continue;
      }
    }
    const hit = matchSpecies(species, e.sci, e.com);
    if (!hit) { unmatched++; continue; }
    if (!e.externalId) continue;
    matched.push({
      externalId: e.externalId,
      speciesId: hit.id,
      lng: e.lng,
      lat: e.lat
    });
  }

  // Dedup by externalId — keep last seen.
  const byId = new Map();
  for (const m of matched) byId.set(m.externalId, m);
  const finalRows = Array.from(byId.values());

  console.log(
    `  matched=${finalRows.length.toLocaleString()} unmatched=${unmatched.toLocaleString()} ` +
    `no-coord=${latlngMissing.toLocaleString()}` +
    (centroid ? ` outlier=${centroidOutliers.toLocaleString()}` : ' (no centroid set — outlier check skipped)')
  );
  // Loud warning when centroid filter rejected a substantial share —
  // signals a swap / wrong-city / wrong-SRS issue worth investigating.
  if (centroid && centroidOutliers > 0) {
    const totalCoords = finalRows.length + centroidOutliers + unmatched;
    const pct = (centroidOutliers / Math.max(1, totalCoords)) * 100;
    if (pct > 20) {
      console.log(
        `  ⚠ ${pct.toFixed(0)}% of rows fell >${CENTROID_RADIUS_KM}km from ${source.id}'s ` +
        `centroid (${centroid.lat.toFixed(3)}, ${centroid.lng.toFixed(3)}). ` +
        `Likely a lat/lng swap, sign flip, or the wrong source CSV — review before relying on this import.`
      );
    }
  }

  // Start an import_run
  const runIns = await sql`
    insert into import_runs (import_source_id, triggered_by)
    values (${sourceId}, ${userId})
    returning id
  `;
  const runId = runIns[0].id;

  // Bulk upsert in 500-row batches
  let created = 0, updated = 0, errors = 0;
  const BATCH = 500;
  for (let i = 0; i < finalRows.length; i += BATCH) {
    const slice = finalRows.slice(i, i + BATCH);
    try {
      const r = await bulkUpsert(sql, { regionId, sourceId, userId, rows: slice });
      created += r.created;
      updated += r.updated;
    } catch (e) {
      errors++;
      console.log(`    batch ${Math.floor(i / BATCH) + 1} failed: ${e.message}`);
    }
    if ((i / BATCH) % 10 === 0) {
      process.stdout.write(`    progress: ${Math.min(i + BATCH, finalRows.length)}/${finalRows.length}\r`);
    }
  }
  console.log(`    → +${created.toLocaleString()} created, ${updated.toLocaleString()} updated, ${errors} batch errors`);

  await sql`
    update import_runs set
      finished_at = now(),
      pins_created = ${created},
      pins_updated = ${updated},
      pins_skipped_unmatched = ${unmatched},
      errors = ${sql.json(errors > 0 ? [{ externalId: 'batch', message: `${errors} batches failed` }] : [])}
    where id = ${runId}
  `;
  return { source: source.id, created, updated, unmatched, errors };
}

(async () => {
  const dbUrl = process.env.SUPABASE_DB_URL;
  const userId = process.env.FORAGER_DEV_USER_ID;
  if (!dbUrl) throw new Error('SUPABASE_DB_URL missing');
  if (!userId) throw new Error('FORAGER_DEV_USER_ID missing');

  const sql = postgres(dbUrl, { ssl: 'require', onnotice: () => undefined });
  try {
    const regionId = await ensureRegion(sql);
    console.log(`Region: ${REGION_NAME} → ${regionId}`);

    const species = await sql`select id, scientific_name, common_name, aliases from species`;
    console.log(`Loaded ${species.length} species from catalog.`);

    // Filter to sources we want to (re-)import. Edmonton + Calgary
    // already imported cleanly; the rest were deleted by
    // cleanup-opentrees-bad.cjs and need the new validation logic.
    const ALREADY_GOOD = new Set([
      'edmonton', 'calgary', 'escondido_ca', 'west_chester_pa', 'providence'
    ]);
    const onlyArg = process.argv.find(a => a.startsWith('--only='));
    const skipExistingArg = process.argv.includes('--skip-good');
    const targets = DOWNLOADS.filter(d => {
      if (!(d.status === 'downloaded' || d.status === 'cached') || d.size === 0) return false;
      if (onlyArg) {
        const ids = onlyArg.slice('--only='.length).split(',');
        return ids.includes(d.id);
      }
      if (skipExistingArg && ALREADY_GOOD.has(d.id)) return false;
      return true;
    });
    console.log(`\nImporting ${targets.length} sources…`);

    // Disable triggers ONCE for the whole batch (not per source) — safer
    // to enable in finally.
    await sql`alter table public.pins disable trigger tg_gate_public_pins`;
    await sql`alter table public.pins disable trigger tg_pin_density_track_ins`;
    await sql`alter table public.pins disable trigger tg_pin_density_track_upd`;
    await sql`alter table public.pins disable trigger tg_pin_density_track_del`;

    const results = [];
    try {
      for (const src of targets) {
        try {
          results.push(await importOne(sql, src, regionId, userId, species));
        } catch (e) {
          console.log(`  ✗ ${src.id} failed: ${e.message}`);
          results.push({ source: src.id, error: e.message });
        }
      }
    } finally {
      await sql`alter table public.pins enable trigger tg_gate_public_pins`;
      await sql`alter table public.pins enable trigger tg_pin_density_track_ins`;
      await sql`alter table public.pins enable trigger tg_pin_density_track_upd`;
      await sql`alter table public.pins enable trigger tg_pin_density_track_del`;
    }

    console.log('\nRefreshing pin density grid…');
    await sql`select public.refresh_pin_density()`;

    const totalCreated = results.reduce((a, r) => a + (r.created || 0), 0);
    const totalUpdated = results.reduce((a, r) => a + (r.updated || 0), 0);
    const totalUnmatched = results.reduce((a, r) => a + (r.unmatched || 0), 0);
    const errored = results.filter(r => r.error).length;
    console.log(`\n=== TOTALS ===`);
    console.log(`  created:   ${totalCreated.toLocaleString()}`);
    console.log(`  updated:   ${totalUpdated.toLocaleString()}`);
    console.log(`  unmatched: ${totalUnmatched.toLocaleString()}`);
    console.log(`  failed:    ${errored} sources`);
    fs.writeFileSync(
      path.resolve(__dirname, '../../data/exploration/import-results.json'),
      JSON.stringify(results, null, 2)
    );
  } finally {
    await sql.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
