// Layer 1 USA-NPN empirical-median calibration importer.
//
// What this does:
//   1. Pulls forageable species (id + scientific_name) from production DB.
//   2. Resolves each to an NPN species_id via getSpecies.json.
//   3. Pulls all CONUS NPN ripe-fruit observations 2018-2025 in bulk
//      (one date-window page at a time, all matched species in
//      species_id[] params). Filters phenophase_status==1 client-side.
//   4. Resolves each observation's USDA hardiness zone via the
//      zone_for_point(lng, lat) PostGIS function (cached per 4-decimal
//      lat/lng bin).
//   5. Aggregates per (species, zone): n_obs, n_sites, median DOY,
//      p10, p90.
//   6. Applies +14d leading-edge offset to start_doy = max(1, p10+14).
//   7. Drops cells with n_obs<30 or n_sites<8.
//   8. For each (species, zone) cell:
//        - if a regional_guide row already exists with peak_doy NULL:
//          UPDATE peak_doy = median.
//        - if no row exists: INSERT confidence='empirical_npn'.
//   9. Drops legume/persistent-pod species (Cercis canadensis, Robinia
//      pseudoacacia, Gleditsia triacanthos, Ceratonia siliqua).
//      Keeps Ginkgo biloba (real ripening signal on the seed).
//
// Outputs:
//   - supabase/migrations/20260509000003_layer1_npn_empirical.sql
//   - data/exploration/layer1-npn-summary.md
//
// Does NOT apply the migration. The user runs `supabase db push`.

const fs = require('node:fs');
const path = require('node:path');
const postgres = require('postgres');

// ---------- env ----------
const ENV_PATH = '/Users/jk/Dropbox/Claude/forager/.env.local';
const env = fs.readFileSync(ENV_PATH, 'utf8');
const SUPABASE_DB_URL = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim();

const ROOT = '/Users/jk/Dropbox/Claude/forager';
const MIGRATION_PATH = path.join(ROOT, 'supabase/migrations/20260509000003_layer1_npn_empirical.sql');
const SUMMARY_PATH = path.join(ROOT, 'data/exploration/layer1-npn-summary.md');
const RAW_DUMP_PATH = path.join(ROOT, 'data/exploration/layer1-npn-raw.json');

// ---------- config ----------
const NPN_BASE = 'https://services.usanpn.org/npn_portal';
const REQUEST_SRC = 'forager-calibration';

// CONUS bounding box: lonW, latS, lonE, latN
const BBOX = '-130,24,-66,50';
const PHENO_CLASS_ID = 12;  // Ripe fruits
const YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];

// Drop legume/persistent-pod species: NPN can't distinguish ripe vs dry
// pods that hang on the tree. Note: Ginkgo biloba KEPT — it's an exposed
// seed (sarcotesta) with a real ripening signal, even though
// taxonomically odd.
const DROP_SCI_NAMES = new Set([
  'Cercis canadensis',
  'Robinia pseudoacacia',
  'Gleditsia triacanthos',
  'Ceratonia siliqua'
]);

// Confidence thresholds before a cell is emitted.
const MIN_OBS = 30;
const MIN_SITES = 8;

// Leading-edge offset: NPN volunteers flag "ripe" ~14 days before
// foragers want it. Shift only the start of the window forward.
const LEADING_EDGE_OFFSET_D = 14;

// ---------- helpers ----------
function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJsonRetry(url, attempts = 4) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'forager-layer1/1.0' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      return JSON.parse(text);
    } catch (e) {
      lastErr = e;
      const wait = 1000 * Math.pow(2, i);
      console.warn(`  retry in ${wait}ms after ${e.message}`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

function sqlEscape(s) {
  if (s === null || s === undefined) return 'NULL';
  return `'${String(s).replace(/'/g, "''")}'`;
}

// ---------- Step 1: pull species catalog ----------
async function loadForageableSpecies(sql) {
  const rows = await sql`
    select id, scientific_name
    from public.species
    where is_forageable = true
    order by scientific_name
  `;
  return rows.map(r => ({ id: r.id, scientificName: r.scientific_name }));
}

// ---------- Step 2: NPN species lookup ----------
async function loadNpnSpeciesIndex() {
  console.log('Fetching NPN species index ...');
  const arr = await fetchJsonRetry(`${NPN_BASE}/species/getSpecies.json`);
  console.log(`  ${arr.length} NPN species in index`);
  // Index by lowercase 'genus species'
  const byBinomial = new Map();
  for (const s of arr) {
    if (!s.genus || !s.species) continue;
    const key = `${s.genus} ${s.species}`.toLowerCase();
    byBinomial.set(key, s.species_id);
  }
  return byBinomial;
}

function matchNpnId(sciName, npnIndex) {
  const key = sciName.toLowerCase().trim();
  if (npnIndex.has(key)) return npnIndex.get(key);
  // Try first two words only (drop any subsp. var. etc).
  const parts = key.split(/\s+/);
  if (parts.length >= 2) {
    const binomial = `${parts[0]} ${parts[1]}`;
    if (npnIndex.has(binomial)) return npnIndex.get(binomial);
  }
  return null;
}

// ---------- Step 3: pull NPN observations ----------
async function pullObservationsForSpecies(npnIds) {
  // NPN's getObservations supports species_id[i] repeated params. We
  // fetch year-by-year to keep response sizes manageable. Status filter
  // is server-ignored, so we filter status==1 client-side. The endpoint
  // is non-paginated by year + species_id list; results capped at 10k
  // per call. We further chunk species into groups of 25 to stay under
  // the cap for popular species (Prunus serotina etc).
  const SPECIES_PER_CHUNK = 25;
  const speciesChunks = [];
  for (let i = 0; i < npnIds.length; i += SPECIES_PER_CHUNK) {
    speciesChunks.push(npnIds.slice(i, i + SPECIES_PER_CHUNK));
  }

  const allObs = [];
  let totalRaw = 0;
  let totalKept = 0;
  const errors = [];

  for (const year of YEARS) {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    for (let c = 0; c < speciesChunks.length; c++) {
      const chunk = speciesChunks[c];
      const params = new URLSearchParams({
        request_src: REQUEST_SRC,
        start_date: startDate,
        end_date: endDate,
        pheno_class_id: String(PHENO_CLASS_ID),
        bounding_box: BBOX
      });
      for (let i = 0; i < chunk.length; i++) {
        params.append(`species_id[${i}]`, String(chunk[i]));
      }
      const url = `${NPN_BASE}/observations/getObservations.json?${params.toString()}`;
      try {
        const rows = await fetchJsonRetry(url);
        if (!Array.isArray(rows)) {
          console.warn(`  ${year} chunk ${c}: not array, skipping`);
          continue;
        }
        totalRaw += rows.length;
        // Filter status==1 client-side. Drop any row with missing
        // lat/lng/day_of_year.
        const kept = rows.filter(r =>
          r.phenophase_status === 1 &&
          typeof r.day_of_year === 'number' && r.day_of_year >= 1 && r.day_of_year <= 366 &&
          typeof r.latitude === 'number' && typeof r.longitude === 'number' &&
          r.latitude >= 24 && r.latitude <= 50 && r.longitude >= -130 && r.longitude <= -66
        );
        totalKept += kept.length;
        allObs.push(...kept);
        process.stdout.write(`  ${year} chunk ${c + 1}/${speciesChunks.length}: ${rows.length} raw, ${kept.length} ripe (running ${totalKept})\n`);
        if (rows.length >= 9900) {
          console.warn(`  WARN: chunk ${c} year ${year} returned ${rows.length} - approaching/at 10k cap, may have truncated`);
        }
      } catch (e) {
        const msg = `${year} chunk ${c}: ${e.message}`;
        console.warn(`  ERROR ${msg}`);
        errors.push(msg);
      }
    }
  }
  return { obs: allObs, totalRaw, totalKept, errors };
}

// ---------- Step 4: zone resolution ----------
async function resolveZones(sql, obs) {
  // Cache by 4-decimal lat/lng bin to keep DB calls bounded.
  const cache = new Map();
  const zones = new Array(obs.length).fill(null);
  // Build distinct bins
  const bins = new Map();  // key -> { lng, lat, indices }
  for (let i = 0; i < obs.length; i++) {
    const o = obs[i];
    const lat = Math.round(o.latitude * 10000) / 10000;
    const lng = Math.round(o.longitude * 10000) / 10000;
    const key = `${lng}|${lat}`;
    let bin = bins.get(key);
    if (!bin) {
      bin = { lng, lat, indices: [] };
      bins.set(key, bin);
    }
    bin.indices.push(i);
  }
  console.log(`  ${bins.size} distinct lat/lng bins for ${obs.length} observations`);
  // Batch zone lookups. Postgres function is cheap; batch with a CTE.
  const binArr = [...bins.values()];
  const BATCH = 1000;
  for (let i = 0; i < binArr.length; i += BATCH) {
    const slice = binArr.slice(i, i + BATCH);
    const lngs = slice.map(b => b.lng);
    const lats = slice.map(b => b.lat);
    const rows = await sql`
      select t.idx,
             public.zone_for_point(t.lng::double precision, t.lat::double precision) as zone_code
      from unnest(${lngs}::double precision[], ${lats}::double precision[])
        with ordinality as t(lng, lat, idx)
    `;
    for (const r of rows) {
      const bin = slice[Number(r.idx) - 1];
      const zc = r.zone_code;
      for (const idx of bin.indices) zones[idx] = zc;
    }
    process.stdout.write(`  resolved zones for ${Math.min(i + BATCH, binArr.length)}/${binArr.length} bins\n`);
  }
  return zones;
}

// ---------- Step 5: aggregate ----------
function aggregate(obs, zones, idToSci) {
  // Group by (species_id, zone_code). Track DOY list and site set.
  const cells = new Map();  // 'speciesId|zoneCode' -> { doys, sites }
  for (let i = 0; i < obs.length; i++) {
    const o = obs[i];
    const zc = zones[i];
    if (!zc) continue;
    const key = `${o.species_id}|${zc}`;
    let c = cells.get(key);
    if (!c) {
      c = { speciesId: o.species_id, zone: zc, sci: idToSci.get(o.species_id), doys: [], sites: new Set() };
      cells.set(key, c);
    }
    c.doys.push(o.day_of_year);
    c.sites.add(o.site_id);
  }
  // Compute stats
  const out = [];
  for (const c of cells.values()) {
    const sorted = c.doys.slice().sort((a, b) => a - b);
    const median = percentile(sorted, 0.5);
    const p10 = percentile(sorted, 0.1);
    const p90 = percentile(sorted, 0.9);
    out.push({
      speciesId: c.speciesId,
      sci: c.sci,
      zone: c.zone,
      n_obs: c.doys.length,
      n_sites: c.sites.size,
      median_doy: Math.round(median),
      p10_doy: Math.round(p10),
      p90_doy: Math.round(p90)
    });
  }
  return out;
}

// ---------- Step 7: existing rows ----------
async function loadExistingWindows(sql, sciList) {
  const rows = await sql`
    select s.scientific_name, z.code as zone_code, w.confidence::text, w.peak_doy, w.id, w.start_doy, w.end_doy
    from public.species_fruiting_windows w
      join public.species s on s.id = w.species_id
      join public.climate_zones z on z.id = w.climate_zone_id
    where s.scientific_name = any(${sciList})
      and w.stage = 'ripe'
  `;
  // index by 'sci|zone'
  const map = new Map();
  for (const r of rows) {
    map.set(`${r.scientific_name}|${r.zone_code}`, r);
  }
  return map;
}

// ---------- Step 8: emit migration ----------
function buildMigration(updates, inserts, missingSpecies, droppedSpecies) {
  const lines = [];
  lines.push('-- Layer 1 NPN empirical fruiting windows.');
  lines.push('--');
  lines.push('-- Source: USA-NPN getObservations.json, pheno_class_id=12 (Ripe fruits),');
  lines.push('-- CONUS bbox -130,24 to -66,50, years 2018-2025, phenophase_status==1');
  lines.push('-- (filtered client-side because the API ignores the query param).');
  lines.push('-- Generator: scripts/npn-layer1-calibration.cjs');
  lines.push('-- Process documented in data/exploration/layer1-npn-summary.md');
  lines.push('--');
  lines.push('-- Cells require n_obs >= 30 AND n_sites >= 8 (drop weaker cells).');
  lines.push('-- start_doy = max(1, p10 + 14) — the +14d leading-edge offset');
  lines.push('-- corrects for NPN volunteers flagging "ripe" ~14d before harvest peak.');
  lines.push('-- end_doy   = p90.');
  lines.push('-- peak_doy  = median.');
  lines.push('--');
  lines.push('-- For (species, zone) cells already populated by Layer 2 regional_guide,');
  lines.push('-- the regional bracket wins; we only fill in peak_doy when null.');
  lines.push('-- For empty cells, this migration inserts a fresh empirical_npn row.');
  lines.push('--');
  lines.push(`-- Dropped species (legume/persistent dry pods that NPN can't tell apart`);
  lines.push(`-- from ripe fruit): ${[...DROP_SCI_NAMES].join(', ')}.`);
  lines.push('-- Ginkgo biloba kept: edible part is the seed sarcotesta with a real ripening signal.');
  lines.push('');
  lines.push(`-- Coverage: ${inserts.length} new empirical cells, ${updates.length} peak_doy fill-ins on existing regional_guide rows.`);
  lines.push('');
  lines.push('begin;');
  lines.push('');

  if (updates.length > 0) {
    lines.push('-- ---- 1. peak_doy fill-ins for existing regional_guide rows where peak_doy IS NULL ----');
    lines.push('');
    for (const u of updates) {
      const note = `NPN n=${u.n_obs}, sites=${u.n_sites}, range ${u.p10_doy}-${u.p90_doy}`;
      lines.push(
        `update public.species_fruiting_windows w ` +
        `set peak_doy = ${u.peak_doy}, ` +
        `    notes = coalesce(notes, '') || ' [Layer 1: peak ' || ${u.peak_doy} || ' from ${note.replace(/'/g, "''")}]' ` +
        `from public.species s, public.climate_zones z ` +
        `where w.species_id = s.id and w.climate_zone_id = z.id ` +
        `and w.stage = 'ripe' ` +
        `and s.scientific_name = ${sqlEscape(u.sci)} ` +
        `and z.code = ${sqlEscape(u.zone)} ` +
        `and w.peak_doy is null;`
      );
    }
    lines.push('');
  }

  if (inserts.length > 0) {
    lines.push('-- ---- 2. New empirical_npn rows for cells with no regional_guide coverage ----');
    lines.push('');
    lines.push('insert into public.species_fruiting_windows');
    lines.push('  (species_id, climate_zone_id, stage, start_doy, end_doy, peak_doy, confidence, notes)');
    lines.push('select s.id, z.id, \'ripe\'::public.stage, t.start_doy, t.end_doy, t.peak_doy,');
    lines.push('       \'empirical_npn\'::public.window_confidence, t.note');
    lines.push('from (values');
    const tuples = inserts.map(r => {
      const note = `NPN n=${r.n_obs}, sites=${r.n_sites}, range ${r.p10_doy}-${r.p90_doy}`;
      return `    (${sqlEscape(r.sci)}, ${sqlEscape(r.zone)}, ${r.start_doy}, ${r.end_doy}, ${r.peak_doy}, ${sqlEscape(note)})`;
    });
    lines.push(tuples.join(',\n'));
    lines.push('  ) as t(sci, zone, start_doy, end_doy, peak_doy, note)');
    lines.push('  join public.species s on s.scientific_name = t.sci');
    lines.push('  join public.climate_zones z on z.code = t.zone');
    lines.push('on conflict do nothing;');
    lines.push('');
  } else {
    lines.push('-- (no new empirical_npn rows passed the n_obs>=30 / n_sites>=8 threshold)');
    lines.push('');
  }

  lines.push('commit;');
  lines.push('');
  return lines.join('\n');
}

function buildSummary({
  totalForageable, npnMatched, missingSpecies, droppedSpecies, totalObsRaw, totalObsKept,
  cellsBefore, cellsAfter, updates, inserts, perSpeciesCoverage, zerodSpecies, errors
}) {
  const lines = [];
  lines.push('# Layer 1 USA-NPN Empirical Window Summary');
  lines.push('');
  lines.push(`**Date:** ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push('## Inputs');
  lines.push('');
  lines.push(`- Forageable species in catalog: ${totalForageable}`);
  lines.push(`- Matched to an NPN species_id: ${npnMatched}`);
  lines.push(`- Dropped (legume/persistent-pod): ${droppedSpecies.length} (${droppedSpecies.join(', ') || 'none'})`);
  lines.push(`- No NPN match: ${missingSpecies.length}`);
  lines.push('');
  lines.push('## NPN observation pull');
  lines.push('');
  lines.push(`- CONUS bbox -130,24 to -66,50, years 2018-2025, pheno_class_id=12.`);
  lines.push(`- Raw observations returned: ${totalObsRaw}`);
  lines.push(`- After client-side filter \`phenophase_status==1\`: ${totalObsKept}`);
  lines.push(`- Fetch errors (non-fatal, partial result): ${errors.length}`);
  if (errors.length > 0) {
    lines.push('');
    lines.push('Errors:');
    for (const e of errors.slice(0, 10)) lines.push(`- ${e}`);
    if (errors.length > 10) lines.push(`- (+${errors.length - 10} more)`);
  }
  lines.push('');
  lines.push('## Aggregation');
  lines.push('');
  lines.push(`- (species, zone) cells with any data: ${cellsBefore}`);
  lines.push(`- Cells passing n_obs>=30 AND n_sites>=8: ${cellsAfter}`);
  lines.push(`- New empirical_npn rows emitted: ${inserts.length}`);
  lines.push(`- Peak_doy fill-ins on existing regional_guide rows: ${updates.length}`);
  lines.push(`- Cells skipped because regional_guide already has peak_doy filled: see migration comments`);
  lines.push('');
  lines.push('## Per-species coverage');
  lines.push('');
  lines.push('| Species | NPN obs (status=1) | Cells passed | Zones covered |');
  lines.push('|---|---:|---:|---|');
  const sortedCov = [...perSpeciesCoverage].sort((a, b) => b.totalObs - a.totalObs);
  for (const c of sortedCov) {
    lines.push(`| _${c.sci}_ | ${c.totalObs} | ${c.cellsPassed} | ${c.zones.join(', ') || '—'} |`);
  }
  lines.push('');
  if (zerodSpecies.length > 0) {
    lines.push('## Coverage gaps: matched in NPN but no usable data');
    lines.push('');
    lines.push('Species had < 30 obs OR < 8 sites in every zone. They contribute nothing to this migration.');
    lines.push('');
    for (const z of zerodSpecies) {
      lines.push(`- _${z.sci}_ (NPN id ${z.npnId}, ${z.totalObs} ripe obs)`);
    }
    lines.push('');
  }
  if (missingSpecies.length > 0) {
    lines.push('## Coverage gaps: not in NPN at all');
    lines.push('');
    for (const s of missingSpecies) lines.push(`- _${s}_`);
    lines.push('');
  }
  lines.push('## Method notes');
  lines.push('');
  lines.push('- `start_doy = max(1, p10 + 14)` to correct the prior-validated 14d');
  lines.push('  early-flagging bias of NPN volunteers vs forager harvest peak.');
  lines.push('- `end_doy = p90`; `peak_doy = median`.');
  lines.push('- Layer 2 regional_guide cells take precedence for the bracket; this');
  lines.push('  layer only fills `peak_doy` on those rows when it was null.');
  lines.push('- `Cercis canadensis`, `Robinia pseudoacacia`, `Gleditsia triacanthos`,');
  lines.push('  `Ceratonia siliqua` dropped: dry pods persist year-round and NPN');
  lines.push('  observers cannot reliably distinguish ripe from dropped/dehiscing.');
  lines.push('- `Ginkgo biloba` kept: the edible sarcotesta has a true ripening signal.');
  lines.push('- Frost-anchoring NOT used: prior validation showed it does not tighten');
  lines.push('  variance (data/exploration/npn-validation-NE-frost-anchored.md).');
  lines.push('');
  return lines.join('\n');
}

// ---------- main ----------
async function main() {
  const sql = postgres(SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined });
  try {
    console.log('Loading forageable species ...');
    const species = await loadForageableSpecies(sql);
    console.log(`  ${species.length} forageable species in catalog`);

    const droppedSpecies = species.filter(s => DROP_SCI_NAMES.has(s.scientificName)).map(s => s.scientificName);
    const candidateSpecies = species.filter(s => !DROP_SCI_NAMES.has(s.scientificName));
    console.log(`  dropped legume/pod species: ${droppedSpecies.join(', ') || '(none in catalog)'}`);
    console.log(`  candidate species after drops: ${candidateSpecies.length}`);

    const npnIndex = await loadNpnSpeciesIndex();

    const matched = [];
    const missingSpecies = [];
    for (const s of candidateSpecies) {
      const npnId = matchNpnId(s.scientificName, npnIndex);
      if (npnId) matched.push({ ...s, npnId });
      else missingSpecies.push(s.scientificName);
    }
    console.log(`  NPN-matched: ${matched.length}, missing: ${missingSpecies.length}`);

    const idToSci = new Map();
    for (const m of matched) idToSci.set(m.npnId, m.scientificName);

    console.log('\nFetching NPN observations (this is the slow step) ...');
    const npnIds = matched.map(m => m.npnId);
    const { obs, totalRaw, totalKept, errors } = await pullObservationsForSpecies(npnIds);
    console.log(`\n  total raw obs: ${totalRaw}, kept (status==1): ${totalKept}`);

    // Save raw observations for debugging / re-runs.
    try {
      fs.writeFileSync(RAW_DUMP_PATH, JSON.stringify({
        meta: { totalRaw, totalKept, errors, fetchedAt: new Date().toISOString() },
        observations: obs.map(o => ({
          observation_id: o.observation_id,
          site_id: o.site_id,
          species_id: o.species_id,
          latitude: o.latitude,
          longitude: o.longitude,
          day_of_year: o.day_of_year,
          observation_date: o.observation_date,
          state: o.state
        }))
      }));
      console.log(`  raw observations dumped to ${RAW_DUMP_PATH}`);
    } catch (e) {
      console.warn(`  could not dump raw obs: ${e.message}`);
    }

    console.log('\nResolving USDA hardiness zones (cached per 4-decimal bin) ...');
    const zones = await resolveZones(sql, obs);

    console.log('\nAggregating per (species, zone) ...');
    const cells = aggregate(obs, zones, idToSci);
    console.log(`  ${cells.length} (species, zone) cells with any data`);

    const passed = cells.filter(c => c.n_obs >= MIN_OBS && c.n_sites >= MIN_SITES);
    console.log(`  ${passed.length} cells pass n_obs>=${MIN_OBS} AND n_sites>=${MIN_SITES}`);

    // Apply leading-edge offset and clamp.
    for (const c of passed) {
      c.start_doy = Math.max(1, c.p10_doy + LEADING_EDGE_OFFSET_D);
      c.end_doy = c.p90_doy;
      c.peak_doy = c.median_doy;
      // It's possible that p10+14 > p90 for very tight clusters. In that
      // case fall back to median +/- a small window so we still emit a
      // reasonable row.
      if (c.start_doy > c.end_doy) {
        c.start_doy = Math.max(1, c.median_doy);
        c.end_doy = c.median_doy;
      }
    }

    // Decide UPDATE vs INSERT vs skip.
    const sciList = [...new Set(passed.map(c => c.sci))];
    const existing = await loadExistingWindows(sql, sciList);
    const updates = [];
    const inserts = [];
    let skippedHasFullCoverage = 0;
    for (const c of passed) {
      const key = `${c.sci}|${c.zone}`;
      const ex = existing.get(key);
      if (ex) {
        // Layer 2 wins for the bracket. Only fill peak_doy if null.
        if (ex.peak_doy === null) {
          updates.push(c);
        } else {
          skippedHasFullCoverage++;
        }
      } else {
        inserts.push(c);
      }
    }
    console.log(`  → updates: ${updates.length}, inserts: ${inserts.length}, skipped (already complete): ${skippedHasFullCoverage}`);

    // Per-species coverage summary.
    const perSp = new Map();
    for (const c of cells) {
      let p = perSp.get(c.sci);
      if (!p) {
        p = { sci: c.sci, totalObs: 0, cellsPassed: 0, zones: [] };
        perSp.set(c.sci, p);
      }
      p.totalObs += c.n_obs;
    }
    for (const c of passed) {
      const p = perSp.get(c.sci);
      p.cellsPassed++;
      p.zones.push(c.zone);
    }
    const perSpeciesCoverage = [...perSp.values()];
    const zerodSpecies = matched
      .filter(m => {
        const p = perSp.get(m.scientificName);
        return !p || p.cellsPassed === 0;
      })
      .map(m => ({
        sci: m.scientificName,
        npnId: m.npnId,
        totalObs: perSp.get(m.scientificName)?.totalObs ?? 0
      }));

    // Build outputs.
    const migration = buildMigration(updates, inserts, missingSpecies, droppedSpecies);
    fs.writeFileSync(MIGRATION_PATH, migration);
    console.log(`\nWrote ${MIGRATION_PATH}`);

    const summary = buildSummary({
      totalForageable: species.length,
      npnMatched: matched.length,
      missingSpecies,
      droppedSpecies,
      totalObsRaw: totalRaw,
      totalObsKept: totalKept,
      cellsBefore: cells.length,
      cellsAfter: passed.length,
      updates, inserts, perSpeciesCoverage, zerodSpecies,
      errors
    });
    fs.writeFileSync(SUMMARY_PATH, summary);
    console.log(`Wrote ${SUMMARY_PATH}`);

    console.log('\nDone.');
  } finally {
    await sql.end();
  }
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
