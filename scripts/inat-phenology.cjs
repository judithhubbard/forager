// iNaturalist phenology pipeline.
//
// For each species (CLI args, or default test set: 3 elderberries +
// chinkapin), pulls Fruiting-annotated observations from the iNat API,
// reverse-geocodes each to a USDA zone via the existing zone_for_point
// PostGIS function, bins by zone × DOY, and:
//   - For zones with NO existing window for the primary stage:
//     INSERT a new row with confidence='empirical_inat' using the
//     p10/p50/p90 of the binned DOY distribution (only when N >= 10).
//   - For zones WITH an existing window:
//     APPEND an iNat evidence entry to the row's `evidence` JSONB
//     (with supports {p10, p90} = empirical bracket and the iNat link)
//     so the calibration viewer's per-source range bars show the iNat
//     bracket alongside the cited blog/extension sources. Don't change
//     the synthesized start/end/peak.
//
// Idempotent: skips inserts/appends if the iNat URL is already cited
// on that row.
//
// Usage:
//   node scripts/inat-phenology.cjs                            # default test set
//   node scripts/inat-phenology.cjs "Sambucus nigra"           # one species
//   node scripts/inat-phenology.cjs "Sambucus nigra" "..." ... # many

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const SUPABASE_DB_URL = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim();
const sql = require('/Users/jk/Dropbox/Claude/forager/node_modules/postgres')(
  SUPABASE_DB_URL,
  { ssl: 'require', onnotice: () => undefined }
);

const TIME_CONSULTED = '2026-05-09T00:00:00Z';
const MIN_OBS_PER_ZONE = 10;        // need at least this many fruiting obs in a zone before trusting an empirical window
const MAX_PAGES = 30;                // 30 × 200 = 6000 obs cap per species
const PHENOLOGY_TERM_ID = 12;
const PHENOLOGY_FRUITING = 14;

const DEFAULT_SPECIES = [
  'Sambucus canadensis',  // already calibrated — sanity check
  'Sambucus nigra',       // 1 zone calibrated, big gap to fill
  'Sambucus cerulea',     // 0 zones calibrated, blue elderberry
  'Castanea pumila'       // recently calibrated, validate vs. iNat
];

// Species whose iNat fruiting tails are NOT first-fruit-reporter artifacts —
// they really do hang on for weeks. For these, publish the inner-80% inset
// (p10-p90) instead of the default inner-70% (p15-p85). User-requested via
// the calibration viewer.
const WIDER_TRIM_SPECIES = new Set([
  'Rubus phoenicolasius',   // wineberry — hangs on for weeks; warm zones 7b-8a have tight published windows
  'Rubus parviflorus'       // thimbleberry — uneven canopy ripening across the long PNW season
]);

/** Pull all forageable species whose primary edible is fruit / nut /
 *  seed — those are the species where iNat's `Fruiting` annotation
 *  yields a meaningful harvest window. Sap-run, leaf, shoot, root, and
 *  mushroom species don't have Fruiting-annotated observations that
 *  map onto their forage cycle, so we skip them.
 *
 *  When `skipCited` is true, also skips species that already have any
 *  iNat-source evidence on any of their windows — pure speedup since
 *  the script is already idempotent. */
async function pickAllForageable(skipCited) {
  const rows = await sql`
    select s.id, s.scientific_name, s.common_name, s.forage_parts,
           exists (
             select 1
               from public.species_fruiting_windows w,
                    jsonb_array_elements(
                      case when jsonb_typeof(w.evidence) = 'array'
                           then w.evidence else '[]'::jsonb end
                    ) ev
              where w.species_id = s.id
                and ev->>'source' like 'iNaturalist%'
           ) as has_inat
      from public.species s
     where s.is_forageable = true
       and s.forage_parts && array['fruit','nut','seed']
     order by s.common_name`;
  const list = skipCited ? rows.filter(r => !r.has_inat) : rows;
  return list.map(r => r.scientific_name);
}

/** Look up an iNat taxon_id by exact scientific-name match. Returns
 *  null if not found. iNat sometimes has multiple matches when a name
 *  is shared across kingdoms; we filter to Plantae. */
async function inatTaxonId(scientificName) {
  const url = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(scientificName)}&is_active=true&rank=species`;
  const r = await fetch(url, { headers: { 'User-Agent': 'forager-research/1.0 (judith.a.hubbard@gmail.com)' } });
  if (!r.ok) throw new Error(`iNat taxa lookup ${r.status}`);
  const j = await r.json();
  const plant = (j.results || []).filter(t => t.iconic_taxon_name === 'Plantae');
  const exact = plant.find(t => t.name?.toLowerCase() === scientificName.toLowerCase());
  return exact?.id ?? plant[0]?.id ?? null;
}

/** Pull Fruiting-annotated observations for a taxon, paginated. Returns
 *  list of {date, lat, lng, id}. Caps at MAX_PAGES * 200 obs. */
async function inatFruitingObservations(taxonId) {
  const out = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `https://api.inaturalist.org/v1/observations?taxon_id=${taxonId}` +
                `&term_id=${PHENOLOGY_TERM_ID}&term_value_id=${PHENOLOGY_FRUITING}` +
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
    const seen = page * 200;
    if (seen >= total) break;
    await new Promise(s => setTimeout(s, 250)); // polite pacing
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

/** Map (lat, lng) → USDA zone code via existing zone_for_point RPC.
 *  Uses unnest for one round-trip per batch instead of per-row. */
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

async function processSpecies(scientificName) {
  console.log(`\n========================================`);
  console.log(`${scientificName}`);

  const sp = await sql`
    select id, common_name, scientific_name, forage_parts
      from public.species
     where scientific_name = ${scientificName}`;
  if (sp.length === 0) { console.log('  ! not in DB'); return; }
  const species = sp[0];

  // Fruiting observations always map to the 'ripe' stage. (We could
  // add Flowering→flowering/flower_harvest as a separate pass.)
  const stage = 'ripe';
  console.log(`  stage: ${stage} (Fruiting → ripe)`);

  const taxonId = await inatTaxonId(scientificName);
  if (!taxonId) { console.log('  ! no iNat taxon match'); return; }
  console.log(`  iNat taxon_id=${taxonId}`);

  console.log('  fetching Fruiting observations…');
  const obs = await inatFruitingObservations(taxonId);
  console.log(`  pulled ${obs.length} fruiting obs`);
  if (obs.length === 0) return;

  console.log('  reverse-geocoding to USDA zones…');
  const zones = await zonesForPoints(obs);
  // Bin by zone
  const byZone = new Map(); // zoneCode -> [doy, doy, ...]
  for (let i = 0; i < obs.length; i++) {
    const z = zones[i];
    if (!z) continue;
    const d = doy(obs[i].date);
    let arr = byZone.get(z);
    if (!arr) { arr = []; byZone.set(z, arr); }
    arr.push(d);
  }

  // Existing windows for this stage
  const existing = await sql`
    select w.id, cz.code, w.start_doy, w.end_doy, w.peak_doy, w.confidence,
           coalesce(w.evidence, '[]'::jsonb) as evidence
      from public.species_fruiting_windows w
      join public.climate_zones cz on cz.id = w.climate_zone_id
     where w.species_id = ${species.id} and w.stage = ${stage}::public.stage`;
  const existingByZone = new Map(existing.map(e => [e.code, e]));

  // Climate-zone id lookup
  const allZones = await sql`select id, code from public.climate_zones`;
  const zoneIdByCode = new Map(allZones.map(z => [z.code, z.id]));

  let inserted = 0, appended = 0, skipped = 0;

  // Process zones in sorted order for stable output
  const sortedCodes = [...byZone.keys()].sort();
  for (const code of sortedCodes) {
    const doys = byZone.get(code).slice().sort((a, b) => a - b);
    if (doys.length < MIN_OBS_PER_ZONE) {
      console.log(`  ${code.padEnd(4)} N=${String(doys.length).padStart(4)}  (skipped — below MIN_OBS_PER_ZONE=${MIN_OBS_PER_ZONE})`);
      continue;
    }
    // Full distribution summary: min, p10, p15, p50, p85, p90, max.
    // The synthesized DOY range we publish is the inner-70% inset
    // (p15-p85). Raw outer percentiles + min/max are kept in the
    // supports object so the viewer can plot the full spread as
    // dots-flanking-line. We don't shift any observations — this is
    // a tail-trim, not a bias correction.
    //
    // Per-species override: a few species have unusually long fruiting
    // tails that aren't first-fruit artifacts (e.g. Rubus phoenicolasius
    // wineberries hang on for weeks; Rubus parviflorus thimbleberries
    // ripen unevenly through the canopy). For these we publish the
    // wider p10-p85 / p15-p90 inset that the user has explicitly
    // requested via the calibration viewer.
    const useWiderTrim = WIDER_TRIM_SPECIES.has(species.scientific_name);
    const min_doy = doys[0];
    const max_doy = doys[doys.length - 1];
    const p10 = percentile(doys, 0.1);
    const p15 = percentile(doys, 0.15);
    const p50 = percentile(doys, 0.5);
    const p85 = percentile(doys, 0.85);
    const p90 = percentile(doys, 0.9);
    const pubStart = useWiderTrim ? p10 : p15;
    const pubEnd = useWiderTrim ? p90 : p85;
    const inatUrl = `https://www.inaturalist.org/observations?taxon_id=${taxonId}&term_id=${PHENOLOGY_TERM_ID}&term_value_id=${PHENOLOGY_FRUITING}&place_id=any`;
    const trimLabel = useWiderTrim ? 'inner-80% inset (p10-p90)' : 'inner-70% inset (p15-p85)';
    const inatEntry = {
      source: 'iNaturalist (Fruiting annotations)',
      url: inatUrl,
      consulted_at: TIME_CONSULTED,
      summary: `${doys.length} research-grade Fruiting obs in zone ${code}. ` +
               `Distribution: min=${min_doy}, p10=${p10}, p15=${p15}, p50=${p50}, p85=${p85}, p90=${p90}, max=${max_doy}. ` +
               `Published range is the ${trimLabel} to discount 'first fruit' tail outliers — no data was shifted.`,
      supports: {
        start_doy: pubStart,
        end_doy: pubEnd,
        peak_doy: p50,
        min_doy,
        p10_doy: p10,
        p90_doy: p90,
        max_doy,
        n_obs: doys.length
      }
    };

    const exist = existingByZone.get(code);
    if (!exist) {
      const zoneId = zoneIdByCode.get(code);
      if (!zoneId) { console.log(`  ${code}: no climate_zones row, skipping`); continue; }
      // INSERT new row with empirical_inat. No ON CONFLICT — there's
      // no unique index on (species_id, climate_zone_id, stage), and
      // we've already verified `exist` is undefined for this zone+stage.
      // Synthesized DOY uses bias-corrected p15-p85 (not raw p10-p90)
      // to avoid the iNat "first fruit" left-skew.
      await sql`
        insert into public.species_fruiting_windows
          (species_id, climate_zone_id, stage, start_doy, end_doy, peak_doy, confidence, notes, evidence)
        values
          (${species.id}, ${zoneId}, ${stage}::public.stage,
           ${pubStart}, ${pubEnd}, ${p50},
           'empirical_inat'::public.window_confidence,
           ${'iNaturalist phenology empirical: N=' + doys.length + ', tail-trimmed start/peak/end = ' + pubStart + '/' + p50 + '/' + pubEnd + ' (' + trimLabel + '). Full distribution p10=' + p10 + ', p90=' + p90 + '.'},
           ${sql.json([inatEntry])})`;
      console.log(`  ${code.padEnd(4)} N=${String(doys.length).padStart(4)}  start=${String(pubStart).padStart(3)} p50=${String(p50).padStart(3)} end=${String(pubEnd).padStart(3)}  → INSERT (empirical_inat${useWiderTrim ? ', wider trim' : ''})`);
      inserted++;
    } else {
      // APPEND or REPLACE iNat evidence. Idempotent on URL — but if
      // an existing iNat entry from an earlier script version lacks
      // the extended distribution fields (min_doy, p10_doy, etc.),
      // we swap it for the new shape so the viewer can render the
      // full distribution as dots-flanking-line.
      const ev = Array.isArray(exist.evidence) ? exist.evidence : [];
      const existingIdx = ev.findIndex(e => e?.url === inatUrl);
      const hasFullDist = existingIdx >= 0
        && ev[existingIdx]?.supports?.min_doy != null
        && ev[existingIdx]?.supports?.p90_doy != null;
      if (hasFullDist) {
        console.log(`  ${code.padEnd(4)} N=${String(doys.length).padStart(4)}  p15=${String(p15).padStart(3)} p50=${String(p50).padStart(3)} p85=${String(p85).padStart(3)}  → already cited, skip`);
        skipped++;
        continue;
      }
      // Compare iNat published range (p15-p85) to existing synthesized window.
      const inEnv = (p15 >= exist.start_doy - 7 && p85 <= exist.end_doy + 7);
      const note = inEnv ? 'IN-ENVELOPE' : 'OUTSIDE-ENVELOPE';
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
         where id = ${exist.id}`;
      const verb = existingIdx >= 0 ? 'UPGRADE' : 'APPEND';
      console.log(`  ${code.padEnd(4)} N=${String(doys.length).padStart(4)}  p15=${String(p15).padStart(3)} p50=${String(p50).padStart(3)} p85=${String(p85).padStart(3)}  vs DB ${exist.start_doy}-${exist.end_doy}  → ${verb} (${note})`);
      appended++;
    }
  }
  console.log(`  summary: +${inserted} inserts, +${appended} evidence appends, ${skipped} already-cited, ${byZone.size} zones with obs total`);
}

async function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter(a => a.startsWith('--')));
  const named = args.filter(a => !a.startsWith('--'));

  let targets;
  if (flags.has('--all')) {
    targets = await pickAllForageable(flags.has('--skip-cited'));
    console.log(`Batch mode: ${targets.length} forageable species (fruit/nut/seed). skip-cited=${flags.has('--skip-cited')}`);
  } else {
    targets = named.length > 0 ? named : DEFAULT_SPECIES;
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
