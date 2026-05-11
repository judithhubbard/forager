// iNaturalist phenology pipeline for MUSHROOMS.
//
// Mushrooms differ from plants in two ways:
//   1) iNat does not have a "Fruiting" phenology annotation for fungi
//      (the annotation taxonomy is plant-specific). For mushrooms,
//      the presence of any research-grade observation IS evidence
//      that a fruit body was on the ground at that location/date —
//      that's exactly what foragers want to know.
//   2) Some mushroom species have bimodal seasons (spring + fall
//      flushes — wood ear, oysters). This v1 produces a single
//      tail-trimmed window per zone; species with known bimodality
//      stay in scripts/species-complex-unify.cjs with explicit
//      bimodal entries (the iNat append is informational, but
//      should NOT clobber the explicit bimodal rows).
//
// Pipeline:
//   - For each catalog species with forage_parts containing 'mushroom':
//     * Resolve iNat taxon_id (filtered to iconic_taxon_name='Fungi').
//     * Pull research-grade observations (cap 30 pages × 200 = 6000).
//     * Reverse-geocode lat/lng → USDA zone via zone_for_point RPC.
//     * Bin by zone × DOY; for zones with N ≥ 10:
//       - If no existing row for (species, zone, mushroom_flush): INSERT
//         with confidence='empirical_inat' and the p15-p85 inner-70%
//         inset as start/end (p50 as peak).
//       - If a row exists: APPEND iNat evidence to its evidence array,
//         do NOT overwrite the synthesized start/end/peak. (Existing
//         bimodal rows from the unify pipeline should stay
//         authoritative — the iNat append is data the viewer can
//         render as a dot overlay.)
//   - Idempotent: skips when the iNat URL is already in the evidence array.
//
// Usage:
//   node scripts/inat-mushrooms.cjs                            # all mushrooms
//   node scripts/inat-mushrooms.cjs "Morchella esculenta"      # one species
//   node scripts/inat-mushrooms.cjs "Morchella esculenta" "Cantharellus cibarius"

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const SUPABASE_DB_URL = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim();
const sql = require('/Users/jk/Dropbox/Claude/forager/node_modules/postgres')(
  SUPABASE_DB_URL,
  { ssl: 'require', onnotice: () => undefined }
);

const TIME_CONSULTED = new Date().toISOString();
const MIN_OBS_PER_ZONE = 10;
const MAX_PAGES = 30;
const STAGE = 'mushroom_flush';

async function pickAllMushrooms() {
  const rows = await sql`
    select s.id, s.scientific_name, s.common_name
      from public.species s
     where s.is_forageable = true
       and 'mushroom' = any(s.forage_parts)
     order by s.scientific_name`;
  return rows.map(r => r.scientific_name);
}

/** Look up an iNat taxon_id by exact scientific-name match, filtered
 *  to Fungi. Returns null if not found. */
async function inatFungusTaxonId(scientificName) {
  const url = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(scientificName)}&is_active=true&rank=species`;
  const r = await fetch(url, { headers: { 'User-Agent': 'forager-research/1.0 (judith.a.hubbard@gmail.com)' } });
  if (!r.ok) throw new Error(`iNat taxa lookup ${r.status}`);
  const j = await r.json();
  const fungi = (j.results || []).filter(t => t.iconic_taxon_name === 'Fungi');
  const exact = fungi.find(t => t.name?.toLowerCase() === scientificName.toLowerCase());
  return exact?.id ?? fungi[0]?.id ?? null;
}

/** Pull research-grade observations for a fungus taxon. No annotation
 *  filter — every observation is evidence of a fruit body. */
async function inatMushroomObservations(taxonId) {
  const out = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `https://api.inaturalist.org/v1/observations?taxon_id=${taxonId}` +
                `&quality_grade=research&geo=true&per_page=200&page=${page}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'forager-research/1.0 (judith.a.hubbard@gmail.com)' } });
    if (!r.ok) {
      if (r.status === 429) { await new Promise(s => setTimeout(s, 2000)); page--; continue; }
      throw new Error(`iNat observations ${r.status}`);
    }
    const j = await r.json();
    for (const o of j.results || []) {
      if (!o.observed_on || !o.location) continue;
      const [latStr, lngStr] = o.location.split(',');
      const lat = parseFloat(latStr), lng = parseFloat(lngStr);
      if (!isFinite(lat) || !isFinite(lng)) continue;
      out.push({ id: o.id, date: o.observed_on, lat, lng });
    }
    const total = j.total_results ?? 0;
    if (page * 200 >= total) break;
    await new Promise(s => setTimeout(s, 250));
  }
  return out;
}

function doy(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.floor((d - start) / 86400000) + 1;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return Math.round(sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]));
}

async function zonesForPoints(points) {
  if (points.length === 0) return [];
  const out = new Array(points.length);
  const BATCH = 500;
  for (let i = 0; i < points.length; i += BATCH) {
    const slice = points.slice(i, i + BATCH);
    const lngs = slice.map(p => p.lng);
    const lats = slice.map(p => p.lat);
    const rows = await sql`
      select t.idx::int as idx, public.zone_for_point(t.lng::numeric, t.lat::numeric) as code
        from unnest(${lngs}::float8[], ${lats}::float8[])
             with ordinality as t(lng, lat, idx)`;
    for (const r of rows) out[i + (r.idx - 1)] = r.code;
  }
  return out;
}

/** Rough bimodality detector. Returns true if the DOY distribution
 *  has two clear peaks with a valley between them (spring + fall
 *  flush). When detected, we skip the INSERT/UPDATE path entirely
 *  and just append iNat evidence — the unify pipeline's explicit
 *  bimodal rows stay authoritative. */
function isBimodal(doys) {
  if (doys.length < 20) return false;
  // 30-day buckets across the year (12 buckets).
  const buckets = new Array(12).fill(0);
  for (const d of doys) buckets[Math.min(11, Math.floor((d - 1) / 30))]++;
  // Find local maxima (a bucket strictly greater than both neighbors,
  // with wrap-around — mushroom seasons can straddle year-end).
  const isPeak = i => {
    const left = buckets[(i - 1 + 12) % 12];
    const right = buckets[(i + 1) % 12];
    return buckets[i] > left && buckets[i] > right && buckets[i] >= doys.length * 0.10;
  };
  let peakCount = 0;
  for (let i = 0; i < 12; i++) if (isPeak(i)) peakCount++;
  return peakCount >= 2;
}

async function processSpecies(scientificName) {
  console.log(`\n========================================`);
  console.log(`${scientificName}`);

  const sp = await sql`
    select id, common_name, scientific_name, forage_parts
      from public.species
     where scientific_name = ${scientificName}`;
  if (sp.length === 0) { console.log('  ! not in DB'); return; }
  const species = sp[0];
  if (!(species.forage_parts || []).includes('mushroom')) {
    console.log(`  ! forage_parts does not include 'mushroom' — skipping`);
    return;
  }

  const taxonId = await inatFungusTaxonId(scientificName);
  if (!taxonId) { console.log('  ! no iNat Fungi taxon match'); return; }
  console.log(`  iNat taxon_id=${taxonId} (Fungi)`);

  console.log('  fetching research-grade observations…');
  const obs = await inatMushroomObservations(taxonId);
  console.log(`  pulled ${obs.length} obs`);
  if (obs.length === 0) return;

  console.log('  reverse-geocoding to USDA zones…');
  const zones = await zonesForPoints(obs);
  const byZone = new Map();
  for (let i = 0; i < obs.length; i++) {
    const z = zones[i];
    if (!z) continue;
    const d = doy(obs[i].date);
    let arr = byZone.get(z);
    if (!arr) { arr = []; byZone.set(z, arr); }
    arr.push(d);
  }

  const existing = await sql`
    select w.id, cz.code, w.start_doy, w.end_doy, w.peak_doy, w.confidence,
           w.complex_name, coalesce(w.evidence, '[]'::jsonb) as evidence
      from public.species_fruiting_windows w
      join public.climate_zones cz on cz.id = w.climate_zone_id
     where w.species_id = ${species.id} and w.stage = ${STAGE}::public.stage
     order by cz.code`;
  // For zones with multiple rows (bimodal complexes), key by code → array.
  const existingByZone = new Map();
  for (const e of existing) {
    if (!existingByZone.has(e.code)) existingByZone.set(e.code, []);
    existingByZone.get(e.code).push(e);
  }

  const allZones = await sql`select id, code from public.climate_zones`;
  const zoneIdByCode = new Map(allZones.map(z => [z.code, z.id]));

  let inserted = 0, appended = 0, skipped = 0;

  const sortedCodes = [...byZone.keys()].sort();
  for (const code of sortedCodes) {
    const doys = byZone.get(code).slice().sort((a, b) => a - b);
    if (doys.length < MIN_OBS_PER_ZONE) {
      console.log(`  ${code.padEnd(4)} N=${String(doys.length).padStart(4)}  (skipped — below MIN_OBS_PER_ZONE=${MIN_OBS_PER_ZONE})`);
      continue;
    }
    const min_doy = doys[0];
    const max_doy = doys[doys.length - 1];
    const p10 = percentile(doys, 0.1);
    const p15 = percentile(doys, 0.15);
    const p50 = percentile(doys, 0.5);
    const p85 = percentile(doys, 0.85);
    const p90 = percentile(doys, 0.9);
    const bimodal = isBimodal(doys);

    const inatUrl = `https://www.inaturalist.org/observations?taxon_id=${taxonId}&place_id=any&quality_grade=research`;
    const trimLabel = 'inner-70% inset (p15-p85)';
    const inatEntry = {
      source: 'iNaturalist (research-grade mushroom observations)',
      url: inatUrl,
      consulted_at: TIME_CONSULTED,
      summary: `${doys.length} research-grade observations in zone ${code}` +
               (bimodal ? ' (bimodal — split season detected)' : '') +
               `. Distribution: min=${min_doy}, p10=${p10}, p15=${p15}, p50=${p50}, p85=${p85}, p90=${p90}, max=${max_doy}. ` +
               (bimodal
                 ? 'Bimodality detected — single-window p15-p85 would smear distinct spring + fall flushes. iNat evidence appended for the calibration viewer; window math stays with the existing (possibly bimodal) row(s) from the unify pipeline.'
                 : `Published range is the ${trimLabel} of all-year observation dates — for mushrooms an observation IS evidence of a fruit body present, so no Fruiting annotation needed.`),
      supports: {
        start_doy: p15,
        end_doy: p85,
        peak_doy: p50,
        min_doy,
        p10_doy: p10,
        p90_doy: p90,
        max_doy,
        n_obs: doys.length,
        bimodal
      }
    };

    const rowsForZone = existingByZone.get(code) || [];

    if (rowsForZone.length === 0) {
      // No existing row in this zone for mushroom_flush.
      const zoneId = zoneIdByCode.get(code);
      if (!zoneId) { console.log(`  ${code}: no climate_zones row, skipping`); continue; }
      if (bimodal) {
        // Don't auto-insert a single window when the distribution is
        // bimodal — that would publish a misleading wide range. Flag
        // it for manual unify entry.
        console.log(`  ${code.padEnd(4)} N=${String(doys.length).padStart(4)}  → BIMODAL, no auto-insert (add to unify with explicit spring + fall rows)`);
        continue;
      }
      await sql`
        insert into public.species_fruiting_windows
          (species_id, climate_zone_id, stage, start_doy, end_doy, peak_doy, confidence, notes, evidence)
        values
          (${species.id}, ${zoneId}, ${STAGE}::public.stage,
           ${p15}, ${p85}, ${p50},
           'empirical_inat'::public.window_confidence,
           ${'iNaturalist mushroom-observation empirical: N=' + doys.length + ', tail-trimmed start/peak/end = ' + p15 + '/' + p50 + '/' + p85 + ' (' + trimLabel + ').'},
           ${sql.json([inatEntry])})`;
      console.log(`  ${code.padEnd(4)} N=${String(doys.length).padStart(4)}  start=${String(p15).padStart(3)} p50=${String(p50).padStart(3)} end=${String(p85).padStart(3)}  → INSERT (empirical_inat)`);
      inserted++;
      continue;
    }

    // Existing row(s) — append/upgrade iNat evidence on the first row
    // for the zone (typically there's only one, but bimodal complexes
    // may have two — we attach the iNat blob to one of them so the
    // viewer surfaces it; future enhancement could split by which
    // half-distribution best matches each row).
    const target = rowsForZone[0];
    const ev = Array.isArray(target.evidence) ? target.evidence : [];
    const existingIdx = ev.findIndex(e => e?.url === inatUrl);
    const hasFullDist = existingIdx >= 0
      && ev[existingIdx]?.supports?.min_doy != null
      && ev[existingIdx]?.supports?.p90_doy != null;
    if (hasFullDist) {
      console.log(`  ${code.padEnd(4)} N=${String(doys.length).padStart(4)}  p15=${String(p15).padStart(3)} p50=${String(p50).padStart(3)} p85=${String(p85).padStart(3)}  → already cited, skip`);
      skipped++;
      continue;
    }
    const inEnv = (p15 >= target.start_doy - 14 && p85 <= target.end_doy + 14);
    const note = bimodal ? 'BIMODAL' : (inEnv ? 'IN-ENVELOPE' : 'OUTSIDE-ENVELOPE');
    let updated;
    if (existingIdx >= 0) {
      updated = ev.slice();
      updated[existingIdx] = inatEntry;
    } else {
      updated = ev.concat([inatEntry]);
    }
    await sql`
      update public.species_fruiting_windows
         set evidence = ${sql.json(updated)},
             updated_at = now()
       where id = ${target.id}`;
    const verb = existingIdx >= 0 ? 'UPGRADE' : 'APPEND';
    const tag = rowsForZone.length > 1 ? ` (1 of ${rowsForZone.length} rows)` : '';
    console.log(`  ${code.padEnd(4)} N=${String(doys.length).padStart(4)}  p15=${String(p15).padStart(3)} p50=${String(p50).padStart(3)} p85=${String(p85).padStart(3)}  vs DB ${target.start_doy}-${target.end_doy}  → ${verb} (${note})${tag}`);
    appended++;
  }
  console.log(`  summary: +${inserted} inserts, +${appended} evidence appends, ${skipped} already-cited, ${byZone.size} zones with obs total`);
}

async function main() {
  const args = process.argv.slice(2);
  let targets;
  if (args.length === 0) {
    targets = await pickAllMushrooms();
    console.log(`Batch mode: ${targets.length} mushroom species.`);
  } else {
    targets = args;
  }

  let i = 0;
  for (const sci of targets) {
    i++;
    console.log(`\n[${i}/${targets.length}] ${sci}`);
    try {
      await processSpecies(sci);
    } catch (e) {
      console.error(`  ! error for ${sci}: ${e.message}`);
    }
  }

  console.log('\nRefreshing zone-presence materialized view…');
  await sql`select public.refresh_species_zone_presence()`;
  console.log('Done.');
  await sql.end();
}

main().catch(e => { console.error(e); process.exit(1); });
