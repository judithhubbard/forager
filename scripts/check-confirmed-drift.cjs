// Drift detector for confirmed species (Pass 2 of confirmed-species
// protection — companion to scripts/confirm-species.cjs).
//
// For each species with review_status='confirmed' + any is_confirmed
// rows in species_fruiting_windows, computes what the current
// species-complex-unify.cjs pipeline WOULD write if --force-confirmed
// were passed, and compares against the live (pinned) rows. Reports
// per-species deltas — Δpeak_doy / Δstart_doy / Δend_doy — so JK can
// see whether the upstream calibration has moved on since they
// confirmed.
//
// Pure read-only: never mutates the DB. Run anytime to see whether
// re-confirmation is worth considering.
//
// Usage:
//   node scripts/check-confirmed-drift.cjs                    # all confirmed species
//   node scripts/check-confirmed-drift.cjs "Acer saccharum"   # one species
//   node scripts/check-confirmed-drift.cjs --json             # machine-readable output
//
// Exit code: 0 when no drift; 1 when drift found (configurable for
// pre-commit-hook usage).

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
const SUPABASE_DB_URL = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim();
const sql = require(path.join(ROOT, 'node_modules', 'postgres'))(
  SUPABASE_DB_URL,
  { ssl: 'require', onnotice: () => undefined }
);

// Import the unify entries + zone mapping. The unify file is now
// guarded by `if (require.main !== module)` so requiring it is
// side-effect-free.
const { COMPLEXES, ZONE_NUM } = require('./species-complex-unify.cjs');

const args = process.argv.slice(2);
const wantJson = args.includes('--json');
// By default also write the drift report to static/drift-report.json
// so the calibration viewer can surface drift badges per species
// without an extra DB round-trip. Build artifact, regenerated whenever
// this script runs (which is automatically post-unify).
const writeStaticReport = !args.includes('--no-static');
const filterNames = args.filter((a) => !a.startsWith('--'));

/** Compute what the unify pipeline would write for a given complex
 *  entry + zone + member, mirroring the math at lines 2944-2948 of
 *  species-complex-unify.cjs. */
function projectWindow(cx, zoneCode) {
  const anchorNum = ZONE_NUM[cx.anchor_zone];
  const zoneNum = ZONE_NUM[zoneCode];
  if (anchorNum == null || zoneNum == null) return null;
  const peak = Math.max(1, Math.min(366,
    cx.anchor_peak + (zoneNum - anchorNum) * cx.shift_per_half_zone
  ));
  const start = Math.max(1, peak - cx.half_window);
  const end = Math.min(366, peak + cx.half_window);
  return { start_doy: start, peak_doy: peak, end_doy: end, stage: cx.stage ?? 'ripe' };
}

(async () => {
  // Find species that have is_confirmed rows.
  let species;
  if (filterNames.length > 0) {
    species = await sql`
      select id, scientific_name, common_name, review_status
        from public.species
       where scientific_name = any(${filterNames})`;
  } else {
    species = await sql`
      select distinct s.id, s.scientific_name, s.common_name, s.review_status
        from public.species s
        join public.species_fruiting_windows w on w.species_id = s.id
       where w.is_confirmed = true
       order by s.scientific_name`;
  }

  if (species.length === 0) {
    const msg = filterNames.length
      ? `No matching species in filter: ${filterNames.join(', ')}`
      : 'No confirmed species yet. Use scripts/confirm-species.cjs to confirm one.';
    if (wantJson) {
      console.log(JSON.stringify({ confirmed_count: 0, drift: [] }, null, 2));
    } else {
      console.log(msg);
    }
    await sql.end();
    process.exit(0);
  }

  const allDrift = [];

  for (const sp of species) {
    // Live (pinned) rows for this species.
    const liveRows = await sql`
      select w.id, cz.code as zone_code, w.stage, w.start_doy,
             w.end_doy, w.peak_doy, w.complex_name, w.is_confirmed
        from public.species_fruiting_windows w
        join public.climate_zones cz on cz.id = w.climate_zone_id
       where w.species_id = ${sp.id}
       order by cz.code, w.stage, w.complex_name`;

    // What the unify pipeline would write today. Iterate every
    // COMPLEX that lists this species + every (zone, stage) it
    // would project.
    const projected = []; // { zone_code, stage, complex_name, start, peak, end }
    for (const cx of COMPLEXES) {
      if (!cx.members.includes(sp.scientific_name)) continue;
      for (const zoneCode of cx.target_zones) {
        const w = projectWindow(cx, zoneCode);
        if (!w) continue;
        projected.push({
          zone_code: zoneCode,
          stage: w.stage,
          complex_name: cx.name,
          start_doy: w.start_doy,
          peak_doy: w.peak_doy,
          end_doy: w.end_doy
        });
      }
    }

    // Match projected vs live by (zone, stage, complex_name).
    const drifts = [];
    const liveKey = (r) => `${r.zone_code}|${r.stage}|${r.complex_name ?? ''}`;
    const liveMap = new Map(liveRows.map((r) => [liveKey(r), r]));
    const projKey = (p) => `${p.zone_code}|${p.stage}|${p.complex_name}`;
    const projMap = new Map(projected.map((p) => [projKey(p), p]));

    // (a) Rows projected by unify but missing live OR live has
    //     different DOYs.
    for (const [k, proj] of projMap) {
      const live = liveMap.get(k);
      if (!live) {
        drifts.push({
          kind: 'unify-would-add',
          zone_code: proj.zone_code,
          stage: proj.stage,
          complex_name: proj.complex_name,
          live: null,
          projected: { start: proj.start_doy, peak: proj.peak_doy, end: proj.end_doy }
        });
        continue;
      }
      const dPeak = proj.peak_doy - live.peak_doy;
      const dStart = proj.start_doy - live.start_doy;
      const dEnd = proj.end_doy - live.end_doy;
      if (Math.abs(dPeak) > 0 || Math.abs(dStart) > 0 || Math.abs(dEnd) > 0) {
        drifts.push({
          kind: 'unify-would-change',
          zone_code: proj.zone_code,
          stage: proj.stage,
          complex_name: proj.complex_name,
          live: { start: live.start_doy, peak: live.peak_doy, end: live.end_doy },
          projected: { start: proj.start_doy, peak: proj.peak_doy, end: proj.end_doy },
          delta: { start: dStart, peak: dPeak, end: dEnd }
        });
      }
    }

    // (b) Rows in live but no longer in projected (unify would
    //     orphan / delete this row, IF it cleaned up — which it
    //     currently doesn't, but worth flagging anyway).
    for (const [k, live] of liveMap) {
      if (!projMap.has(k) && live.complex_name) {
        drifts.push({
          kind: 'orphaned-live-row',
          zone_code: live.zone_code,
          stage: live.stage,
          complex_name: live.complex_name,
          live: { start: live.start_doy, peak: live.peak_doy, end: live.end_doy },
          projected: null
        });
      }
    }

    if (drifts.length > 0) {
      allDrift.push({
        scientific_name: sp.scientific_name,
        common_name: sp.common_name,
        review_status: sp.review_status,
        n_live_rows: liveRows.length,
        n_confirmed_rows: liveRows.filter((r) => r.is_confirmed).length,
        drifts
      });
    }
  }

  // Always also write a static report keyed by species_id for the
  // calibration viewer. Unless --no-static is passed.
  if (writeStaticReport && filterNames.length === 0) {
    const staticReport = {
      generated_at: new Date().toISOString(),
      confirmed_count: species.length,
      drift_count: allDrift.length,
      by_species_id: {} // species_id → { n_drifts, kinds: { ... } }
    };
    // Map back to species_id since the viewer keys species by uuid.
    const idByName = new Map(species.map((s) => [s.scientific_name, s.id]));
    for (const s of allDrift) {
      const id = idByName.get(s.scientific_name);
      if (!id) continue;
      staticReport.by_species_id[id] = {
        scientific_name: s.scientific_name,
        common_name: s.common_name,
        n_drifts: s.drifts.length,
        kinds: s.drifts.reduce((acc, d) => {
          acc[d.kind] = (acc[d.kind] || 0) + 1;
          return acc;
        }, {})
      };
    }
    const outPath = path.join(ROOT, 'static', 'drift-report.json');
    fs.writeFileSync(outPath, JSON.stringify(staticReport, null, 2));
    if (!wantJson) {
      console.log(`Wrote static drift report: static/drift-report.json (${allDrift.length} drifted species)`);
    }
  }

  if (wantJson) {
    console.log(JSON.stringify({
      confirmed_count: species.length,
      drift_count: allDrift.length,
      species: allDrift
    }, null, 2));
  } else {
    if (allDrift.length === 0) {
      console.log(`✓ No drift detected. ${species.length} confirmed species in sync with current unify pipeline.`);
    } else {
      console.log(`⚠ Drift detected in ${allDrift.length} of ${species.length} confirmed species.`);
      for (const s of allDrift) {
        console.log(`\n${s.common_name} (${s.scientific_name}) — ${s.drifts.length} drift entries`);
        for (const d of s.drifts) {
          if (d.kind === 'unify-would-change') {
            console.log(`  ${d.zone_code} ${d.stage} [${d.complex_name}]: live ${d.live.start}-${d.live.end}/peak ${d.live.peak} → would be ${d.projected.start}-${d.projected.end}/peak ${d.projected.peak}  (Δpeak ${d.delta.peak > 0 ? '+' : ''}${d.delta.peak}d)`);
          } else if (d.kind === 'unify-would-add') {
            console.log(`  ${d.zone_code} ${d.stage} [${d.complex_name}]: NEW row in unify (not yet confirmed) ${d.projected.start}-${d.projected.end}/peak ${d.projected.peak}`);
          } else if (d.kind === 'orphaned-live-row') {
            console.log(`  ${d.zone_code} ${d.stage} [${d.complex_name}]: ORPHANED (unify no longer projects this) live ${d.live.start}-${d.live.end}/peak ${d.live.peak}`);
          }
        }
      }
      console.log(`\nTo re-confirm a species with current pipeline output:`);
      console.log(`  node scripts/confirm-species.cjs "<scientific name>" --notes "..."`);
    }
  }

  await sql.end();
  process.exit(allDrift.length === 0 ? 0 : 1);
})().catch((err) => {
  console.error('check-confirmed-drift failed:', err);
  sql.end();
  process.exit(2);
});
