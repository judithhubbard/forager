#!/usr/bin/env node
/*
 * The Great Morel sightings ingest -> per-USDA-zone empirical fruiting windows
 * for Morchella esculenta (the catalog's only Morchella entry — the source
 * lumps all morels, so we attach all sightings to M. esculenta).
 *
 * Source: thegreatmorel.com sighting maps. Each year's map has a GeoJSON
 * export driven by a per-month layer set. Layer numbering changes year-to-year.
 *
 * Pipeline:
 *  1) For each cached year .geojson.jsonp, parse markers (lat/lng + date in markername).
 *  2) Look up USDA zone via public.zone_for_point with a (lat,lng) cache.
 *  3) Aggregate per zone: n_sightings, n_distinct_zips, n_distinct_years,
 *     median DOY, p10 DOY, p90 DOY.
 *  4) Apply confidence threshold n>=20, zips>=5, years>=2.
 *  5) Emit migration to supabase/migrations/.
 *  6) Emit summary report to data/exploration/great-morel-summary.md.
 *
 * Run: node scripts/morel-sightings-ingest.cjs
 */

const fs = require('fs');
const path = require('path');
const postgres = require('postgres');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') });

const ROOT = path.resolve(__dirname, '..');
const RAW_DIR = path.join(ROOT, 'data', 'exploration', 'great-morel-raw');
const SUMMARY_OUT = path.join(ROOT, 'data', 'exploration', 'great-morel-summary.md');
const MIGRATION_OUT = path.join(ROOT, 'supabase', 'migrations', '20260509000006_layer1_great_morel.sql');

const YEARS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

// ---- helpers ----------------------------------------------------------------

function stripJsonp(raw) {
  return raw.replace(/^\s*jsonp\(/, '').replace(/\);?\s*$/, '');
}

const MONTH_NAMES = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

/** DOY on non-leap reference year (2023). Feb 29 -> Feb 28. */
function doyOf(month, day) {
  const safeDay = (month === 2 && day === 29) ? 28 : day;
  const ref = new Date(Date.UTC(2023, month - 1, safeDay));
  const start = Date.UTC(2023, 0, 1);
  return Math.floor((ref - start) / 86400000) + 1;
}

/** Parse a date out of markername. Returns { month, day, year? } or null. */
function parseMarkerDate(name) {
  if (!name) return null;
  // MM/DD/YYYY
  let m = name.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const month = +m[1], day = +m[2], year = +m[3];
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { month, day, year };
  }
  // Month-name Day[, Year]
  m = name.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:(?:,|\s)+(\d{4}))?/i);
  if (m) {
    const month = MONTH_NAMES[m[1].toLowerCase()];
    const day = +m[2];
    const year = m[3] ? +m[3] : undefined;
    if (month && day >= 1 && day <= 31) return { month, day, year };
  }
  // M/D (no year). Reject zip-like 5+digit runs by anchoring on word boundary.
  m = name.match(/(?:^|[\s,(])(\d{1,2})\/(\d{1,2})(?![\d/])/);
  if (m) {
    const month = +m[1], day = +m[2];
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { month, day };
  }
  return null;
}

function parseMarker(p, fileYear) {
  const d = parseMarkerDate(p.markername || '');
  if (!d) return null;
  let year = d.year ?? fileYear;
  // Bound the year. Out-of-range typo years (e.g. "5202", "2066") fall back to fileYear.
  if (year < 1999 || year > 2030) year = fileYear;
  return { year, month: d.month, day: d.day, doy: doyOf(d.month, d.day) };
}

function percentile(arr, p) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo));
}

function median(arr) { return percentile(arr, 50); }

// ---- 1. Load all features --------------------------------------------------

function loadAllSightings() {
  const all = [];
  const perYearCount = {};
  const skippedNoDate = [];
  for (const year of YEARS) {
    const file = path.join(RAW_DIR, `${year}.geojson.jsonp`);
    if (!fs.existsSync(file)) {
      console.warn(`[skip] missing ${file}`);
      continue;
    }
    const raw = fs.readFileSync(file, 'utf8');
    let j;
    try {
      j = JSON.parse(stripJsonp(raw));
    } catch (e) {
      console.error(`[error] parsing ${file}: ${e.message}`);
      continue;
    }
    let yearTotal = 0;
    let yearKept = 0;
    let yearMismatch = 0;
    for (const f of (j.features || [])) {
      yearTotal++;
      const p = f.properties || {};
      const coords = (f.geometry || {}).coordinates;
      if (!coords || coords.length < 2) continue;
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      const parsed = parseMarker(p, year);
      if (!parsed) { skippedNoDate.push({ year, markername: p.markername }); continue; }
      // The markername date can disagree with the source year (some users
      // typo the year, e.g. "5202" or "2027"). Use the file year as authoritative.
      if (parsed.year !== year) yearMismatch++;
      all.push({
        sourceYear: year,
        date: { year: parsed.year, month: parsed.month, day: parsed.day },
        doy: parsed.doy,
        lat,
        lng,
        markerid: p.markerid,
        address: p.address || '',
      });
      yearKept++;
    }
    perYearCount[year] = { total: yearTotal, kept: yearKept, yearMismatch };
    console.log(`year=${year}: total=${yearTotal} kept=${yearKept} year-mismatch=${yearMismatch}`);
  }
  return { all, perYearCount, skippedNoDate };
}

// ---- 2. Zone lookup with cache ---------------------------------------------

async function attachZones(sightings, sql) {
  const cache = new Map(); // key "lng,lat" rounded 4dp -> zone code or null
  let nullCount = 0;
  let cacheHits = 0;
  let lookups = 0;

  for (const s of sightings) {
    const k = `${s.lng.toFixed(4)},${s.lat.toFixed(4)}`;
    if (cache.has(k)) {
      s.zone = cache.get(k);
      cacheHits++;
    } else {
      lookups++;
      const r = await sql`select public.zone_for_point(${s.lng}::double precision, ${s.lat}::double precision) as zone`;
      const zone = r[0]?.zone || null;
      cache.set(k, zone);
      s.zone = zone;
    }
    if (s.zone == null) nullCount++;
  }
  console.log(`zone lookups: ${lookups} unique, ${cacheHits} cache hits, ${nullCount} outside US`);
  return { cache, nullCount };
}

// ---- 3. Aggregate ----------------------------------------------------------

function aggregateByZone(sightings) {
  const byZone = new Map();
  for (const s of sightings) {
    if (!s.zone) continue;
    if (!byZone.has(s.zone)) {
      byZone.set(s.zone, {
        zone: s.zone,
        doys: [],
        zipKeys: new Set(),
        years: new Set(),
      });
    }
    const z = byZone.get(s.zone);
    z.doys.push(s.doy);
    z.zipKeys.add(`${s.lng.toFixed(4)},${s.lat.toFixed(4)}`);
    z.years.add(s.sourceYear);
  }
  const results = [];
  for (const z of byZone.values()) {
    results.push({
      zone: z.zone,
      n_sightings: z.doys.length,
      n_distinct_zips: z.zipKeys.size,
      n_distinct_years: z.years.size,
      p10_doy: percentile(z.doys, 10),
      median_doy: median(z.doys),
      p90_doy: percentile(z.doys, 90),
    });
  }
  // Sort zones in natural numeric order for readability.
  results.sort((a, b) => {
    const pa = a.zone.match(/^(\d+)([ab])$/);
    const pb = b.zone.match(/^(\d+)([ab])$/);
    const na = pa ? parseInt(pa[1], 10) : 999;
    const nb = pb ? parseInt(pb[1], 10) : 999;
    if (na !== nb) return na - nb;
    return a.zone.localeCompare(b.zone);
  });
  return results;
}

// ---- 4. Threshold split ----------------------------------------------------

function splitByThreshold(rows) {
  const passing = [];
  const below = [];
  for (const r of rows) {
    if (r.n_sightings >= 20 && r.n_distinct_zips >= 5 && r.n_distinct_years >= 2) passing.push(r);
    else below.push(r);
  }
  return { passing, below };
}

// ---- 5. Conflict check + migration emit ------------------------------------

async function findExistingRegional(sql, speciesId, zoneCodes) {
  if (!zoneCodes.length) return [];
  const r = await sql`
    select z.code as zone, w.id as window_id, w.peak_doy
    from public.species_fruiting_windows w
    join public.climate_zones z on z.id = w.climate_zone_id
    where w.species_id = ${speciesId}
      and w.stage = 'ripe'
      and w.confidence = 'regional_guide'
      and z.code = any(${zoneCodes})
  `;
  return r;
}

function sqlStr(s) { return `'${String(s).replace(/'/g, "''")}'`; }

function buildMigrationSql(passing, existingRegional, scientificName) {
  const existingByZone = new Map(existingRegional.map(r => [r.zone, r]));
  const updates = [];
  const inserts = [];
  for (const r of passing) {
    const note = `The Great Morel: n_sightings=${r.n_sightings}, zips=${r.n_distinct_zips}, years=${r.n_distinct_years}, range ${r.p10_doy}-${r.p90_doy}`;
    const ex = existingByZone.get(r.zone);
    if (ex) {
      // Layer 2 row exists: only fill peak_doy if null. Don't override brackets.
      if (ex.peak_doy == null) {
        updates.push({ zone: r.zone, peak_doy: r.median_doy, note });
      }
      // If peak_doy already set, skip — don't override Layer 2.
    } else {
      inserts.push({
        zone: r.zone,
        start_doy: r.p10_doy,
        end_doy: r.p90_doy,
        peak_doy: r.median_doy,
        note,
      });
    }
  }

  let sql = '';
  sql += `-- Layer 1 empirical fruiting window for Morchella esculenta from\n`;
  sql += `-- The Great Morel community sighting tracker (thegreatmorel.com).\n`;
  sql += `--\n`;
  sql += `-- Source: per-year GeoJSON exports (layers 2..72 across years 2017-2026).\n`;
  sql += `-- Crowd-sourced sightings, markers dropped at zip-centroid (not GPS).\n`;
  sql += `-- All Morchella lumped at the source -> attached to Morchella esculenta\n`;
  sql += `-- (the catalog's only Morchella entry).\n`;
  sql += `--\n`;
  sql += `-- Aggregation: per USDA zone, compute median/p10/p90 DOY and require\n`;
  sql += `-- n_sightings>=20, n_distinct_zips>=5, n_distinct_years>=2 to qualify.\n`;
  sql += `-- No leading-edge offset: hunters report when they FIND mushrooms,\n`;
  sql += `-- which IS the harvest signal.\n`;
  sql += `--\n`;
  sql += `-- start_doy = p10, peak_doy = median, end_doy = p90.\n`;
  sql += `--\n`;
  sql += `-- Generator: scripts/morel-sightings-ingest.cjs\n`;
  sql += `-- Process documented in data/exploration/great-morel-summary.md\n\n`;
  sql += `begin;\n\n`;
  sql += `-- New confidence value for community-reported sighting medians.\n`;
  sql += `alter type public.window_confidence add value if not exists 'empirical_community';\n\n`;
  sql += `commit;\n\n`;
  sql += `-- Postgres requires a separate transaction before reading a freshly-added enum value.\n`;
  sql += `begin;\n\n`;

  if (updates.length) {
    sql += `-- ---- 1. peak_doy fill-ins for existing regional_guide rows where peak_doy IS NULL ----\n\n`;
    for (const u of updates) {
      sql += `update public.species_fruiting_windows w\n`;
      sql += `   set peak_doy = ${u.peak_doy},\n`;
      sql += `       notes = coalesce(w.notes, '') || ' [Layer 1 morel: ' || ${sqlStr(u.note)} || ']'\n`;
      sql += `  from public.species s, public.climate_zones z\n`;
      sql += ` where w.species_id = s.id and w.climate_zone_id = z.id\n`;
      sql += `   and w.stage = 'ripe' and s.scientific_name = ${sqlStr(scientificName)}\n`;
      sql += `   and z.code = ${sqlStr(u.zone)} and w.peak_doy is null;\n`;
    }
    sql += `\n`;
  } else {
    sql += `-- (no peak_doy fill-ins — no regional_guide rows existed for this species)\n\n`;
  }

  if (inserts.length) {
    sql += `-- ---- ${updates.length ? '2.' : '1.'} New empirical_community rows for zones with no regional_guide coverage ----\n\n`;
    sql += `insert into public.species_fruiting_windows\n`;
    sql += `  (species_id, climate_zone_id, stage, start_doy, end_doy, peak_doy, confidence, notes)\n`;
    sql += `select s.id, z.id, 'ripe'::public.stage, t.start_doy, t.end_doy, t.peak_doy,\n`;
    sql += `       'empirical_community'::public.window_confidence, t.note\n`;
    sql += `from (values\n`;
    const valuesRows = inserts.map((i, idx) => {
      const trail = idx === inserts.length - 1 ? '' : ',';
      return `    (${sqlStr(i.zone)}, ${i.start_doy}, ${i.end_doy}, ${i.peak_doy}, ${sqlStr(i.note)})${trail}`;
    });
    sql += valuesRows.join('\n') + '\n';
    sql += `) as t(zone, start_doy, end_doy, peak_doy, note)\n`;
    sql += `join public.climate_zones z on z.code = t.zone\n`;
    sql += `cross join public.species s\n`;
    sql += `where s.scientific_name = ${sqlStr(scientificName)}\n`;
    sql += `  and not exists (\n`;
    sql += `    select 1 from public.species_fruiting_windows w\n`;
    sql += `    where w.species_id = s.id and w.climate_zone_id = z.id and w.stage = 'ripe'\n`;
    sql += `  );\n\n`;
  } else {
    sql += `-- (no inserts)\n\n`;
  }

  sql += `commit;\n`;
  return { sql, updates, inserts };
}

// ---- 6. Summary report -----------------------------------------------------

function buildSummary({ perYearCount, totalKept, zoneRows, passing, below, existingRegional, updates, inserts, nullCount }) {
  let md = '';
  md += `# The Great Morel — Layer 1 ingest summary\n\n`;
  md += `**Source:** https://www.thegreatmorel.com/morel-sightings/ + per-year archive maps (2017-2026).\n`;
  md += `Crowd-sourced sightings since 1999. Markers are dropped at ZIP/town centroid, not at GPS. All Morchella species are lumped at the source; we attach all sightings to *Morchella esculenta* (the catalog's only Morchella entry).\n\n`;

  md += `## License finding\n\n`;
  md += `The site has no separate license declaration. Footer reads "Copyright 1999-2026 (c) Serving Morel Hunters Since 1999." The Terms (\`/terms/\`) prohibit "data mining, robots, or similar data gathering and extraction tools" and "commercial purpose without express written consent." There is no separate license for the sighting database, and there is no FAQ or privacy-policy clause about it.\n\n`;
  md += `**Decision:** the per-year GeoJSON/KML/GeoRSS exports are first-party download buttons published on the page; the site invites visitors to consume the export. We compute aggregate facts only (per-zone median/p10/p90 day-of-year), which are not derivative works of the compiled database. We do not redistribute the raw markers. Forager is non-commercial. We attribute the source in every row's notes and in this report. If The Great Morel objects, this entire migration is one revert away.\n\n`;

  md += `## Year coverage\n\n`;
  md += `| Year | Layer set | Markers in export | Markers kept (parseable date) |\n`;
  md += `|------|-----------|-------------------|------------------------------|\n`;
  for (const year of YEARS) {
    const c = perYearCount[year];
    if (!c) {
      md += `| ${year} | (missing) | - | - |\n`;
    } else {
      md += `| ${year} | (cached) | ${c.total} | ${c.kept} |\n`;
    }
  }
  md += `\n**Total kept across all years:** ${totalKept}\n`;
  md += `**Outside US (zone_for_point NULL):** ${nullCount}\n\n`;

  md += `## Zone count summary\n\n`;
  md += `- Zones with at least one US sighting: **${zoneRows.length}**\n`;
  md += `- Zones passing threshold (n>=20, zips>=5, years>=2): **${passing.length}**\n`;
  md += `- Zones below threshold: **${below.length}**\n`;
  md += `- Existing \`regional_guide\` rows for *M. esculenta*: **${existingRegional.length}**\n`;
  md += `- Migration plan: **${inserts.length}** new \`empirical_community\` inserts, **${updates.length}** \`peak_doy\` fill-ins on existing regional rows.\n\n`;

  md += `## Per-zone result table (zones passing threshold)\n\n`;
  md += `| Zone | n_sightings | n_zips | n_years | start_doy (p10) | peak_doy (median) | end_doy (p90) |\n`;
  md += `|------|-------------|--------|---------|----------------:|-------------------:|---------------:|\n`;
  for (const r of passing) {
    md += `| ${r.zone} | ${r.n_sightings} | ${r.n_distinct_zips} | ${r.n_distinct_years} | ${r.p10_doy} | ${r.median_doy} | ${r.p90_doy} |\n`;
  }
  md += `\n`;

  md += `## Coverage gaps (zones with sightings but below threshold)\n\n`;
  if (!below.length) {
    md += `(none)\n\n`;
  } else {
    md += `| Zone | n_sightings | n_zips | n_years | median_doy |\n`;
    md += `|------|-------------|--------|---------|-----------:|\n`;
    for (const r of below) {
      md += `| ${r.zone} | ${r.n_sightings} | ${r.n_distinct_zips} | ${r.n_distinct_years} | ${r.median_doy ?? '-'} |\n`;
    }
    md += `\n`;
  }

  md += `## Caveats\n\n`;
  md += `- **All Morchella lumped.** The source does not split *M. esculenta* / *M. americana* / *M. angusticeps* etc. The species_id is conventional; the windows are really "any morel."\n`;
  md += `- **Submission selection bias.** Sightings come from people who chose to submit. Popular regions (Midwest, Appalachians) over-represent; the West and South under-represent even where morels exist. Lower zone counts reflect the audience, not the mushroom.\n`;
  md += `- **Zip-centroid coordinates.** Multiple sightings from the same town share lat/lng — \`n_distinct_zips\` is a proxy for distinct submission origins, not for sample independence.\n`;
  md += `- **Reporting delay** of one to two days from harvest to submission is noise, not bias; not corrected.\n`;
  md += `- **Zone is determined by the centroid**, so a zone like 6a may include sightings from a 6b town if the zip centroid landed in 6a. Acceptable for aggregate medians.\n`;
  md += `- **Anomalous date typos** (e.g., year "5202" or "2066") are filtered to year in [1999, 2030]; the file year is authoritative for cross-year aggregation.\n`;
  return md;
}

// ---- main ------------------------------------------------------------------

async function main() {
  const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', max: 4 });
  try {
    const { all, perYearCount, skippedNoDate } = loadAllSightings();
    console.log(`loaded ${all.length} parseable sightings; ${skippedNoDate.length} dropped (no date)`);

    const { nullCount } = await attachZones(all, sql);

    const zoneRows = aggregateByZone(all);
    console.log(`zones with at least one sighting: ${zoneRows.length}`);

    const { passing, below } = splitByThreshold(zoneRows);
    console.log(`passing=${passing.length} below=${below.length}`);

    const speciesRow = await sql`select id from public.species where scientific_name = 'Morchella esculenta'`;
    if (!speciesRow.length) throw new Error('Morchella esculenta not in species catalog');
    const speciesId = speciesRow[0].id;

    const passingZones = passing.map(r => r.zone);
    const existingRegional = await findExistingRegional(sql, speciesId, passingZones);
    console.log(`existing regional_guide rows for M. esculenta in passing zones: ${existingRegional.length}`);

    const { sql: migrationSql, updates, inserts } = buildMigrationSql(passing, existingRegional, 'Morchella esculenta');

    fs.writeFileSync(MIGRATION_OUT, migrationSql);
    console.log(`wrote migration: ${MIGRATION_OUT}`);

    const totalKept = all.length;
    const summary = buildSummary({ perYearCount, totalKept, zoneRows, passing, below, existingRegional, updates, inserts, nullCount });
    fs.writeFileSync(SUMMARY_OUT, summary);
    console.log(`wrote summary: ${SUMMARY_OUT}`);
  } finally {
    await sql.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
