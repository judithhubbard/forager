// Calibration regression test runner.
//
// Loads data/calibration-tests.json and asserts that each anchor's
// synthesized peak_doy is within tolerance. Prints PASS/FAIL with
// the actual delta in days; exits non-zero if any test fails so it
// can wire into CI when we want.
//
// Run after any pipeline change (rederive, smooth, nut-frost-fix,
// migrations, etc.) to catch regressions immediately. Without this,
// every fix is unverifiable — the sign-bug in extrapolate sat
// silent until manual spot-check noticed Maine blackberry peaking
// in early July.
//
// Usage:
//   node scripts/test-calibration.cjs                  # all tests
//   node scripts/test-calibration.cjs --verbose        # full diff per test
//   node scripts/test-calibration.cjs --filter beech   # only matching common name

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const env = fs.readFileSync('/Users/jk/Dropbox/Claude/forager/.env.local', 'utf8');
const SUPABASE_DB_URL = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim();
const sql = require('/Users/jk/Dropbox/Claude/forager/node_modules/postgres')(
  SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined }
);

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const filterIdx = args.indexOf('--filter');
const filter = filterIdx >= 0 ? (args[filterIdx + 1] || '').toLowerCase() : null;

const TEST_FILE = '/Users/jk/Dropbox/Claude/forager/data/calibration-tests.json';

function doyToDate(doy) {
  const d = new Date(Date.UTC(2024, 0, 1));
  d.setUTCDate(d.getUTCDate() + doy - 1);
  return d.toISOString().slice(5, 10); // MM-DD
}

(async () => {
  const data = JSON.parse(fs.readFileSync(TEST_FILE, 'utf8'));
  const tests = filter
    ? data.tests.filter(t =>
        (t.common || '').toLowerCase().includes(filter) ||
        (t.species || '').toLowerCase().includes(filter))
    : data.tests;

  console.log(`Running ${tests.length} calibration regression tests${filter ? ` (filter=${filter})` : ''}\n`);

  let passed = 0, failed = 0, missing = 0;
  const failures = [];
  const missingRows = [];

  for (const t of tests) {
    const sp = await sql`select id from species where scientific_name = ${t.species}`;
    if (sp.length === 0) {
      console.log(`  ? ${t.common.padEnd(28)} ${t.zone.padEnd(4)} ${t.stage.padEnd(15)} — species not in DB`);
      missing++;
      missingRows.push(`${t.common} (${t.species})`);
      continue;
    }
    const cz = await sql`select id from climate_zones where code = ${t.zone}`;
    if (cz.length === 0) {
      console.log(`  ? ${t.common.padEnd(28)} ${t.zone.padEnd(4)} ${t.stage.padEnd(15)} — zone not in DB`);
      missing++;
      continue;
    }
    const r = await sql`
      select start_doy, end_doy, peak_doy, confidence
        from species_fruiting_windows
       where species_id = ${sp[0].id}
         and climate_zone_id = ${cz[0].id}
         and stage = ${t.stage}::public.stage`;
    if (r.length === 0) {
      console.log(`  ? ${t.common.padEnd(28)} ${t.zone.padEnd(4)} ${t.stage.padEnd(15)} — no row in DB`);
      missing++;
      missingRows.push(`${t.common} ${t.zone} ${t.stage}`);
      continue;
    }
    const row = r[0];
    const actualPeak = row.peak_doy ?? Math.round((row.start_doy + row.end_doy) / 2);
    const delta = actualPeak - t.peak_doy;
    const ok = Math.abs(delta) <= t.tolerance;

    const label = `${t.common} (${t.species})`;
    const stamp = ok ? 'PASS' : 'FAIL';
    const sign = delta >= 0 ? '+' : '';
    const summary = `${stamp} ${t.zone.padEnd(4)} ${t.stage.padEnd(15)} expected ${t.peak_doy} (${doyToDate(t.peak_doy)}) ±${t.tolerance}d, actual ${actualPeak} (${doyToDate(actualPeak)}) Δ${sign}${delta}d`;
    console.log(`  ${stamp === 'PASS' ? '✓' : '✗'} ${label.padEnd(40)} ${summary}`);

    if (verbose) {
      console.log(`      window ${row.start_doy}-${row.end_doy} (${doyToDate(row.start_doy)}—${doyToDate(row.end_doy)}), confidence ${row.confidence}`);
      console.log(`      source: ${t.source}`);
      if (t.notes) console.log(`      notes:  ${t.notes}`);
    }

    if (ok) passed++;
    else { failed++; failures.push({ test: t, actual: actualPeak, delta }); }
  }

  console.log(`\n=== ${passed} passed, ${failed} failed, ${missing} missing — ${tests.length} total ===\n`);
  if (failed > 0) {
    console.log('Failures:');
    for (const f of failures) {
      console.log(`  ${f.test.common} ${f.test.zone} ${f.test.stage}: expected ${f.test.peak_doy} (${doyToDate(f.test.peak_doy)}) ±${f.test.tolerance}, got ${f.actual} (${doyToDate(f.actual)}), Δ${f.delta >= 0 ? '+' : ''}${f.delta}d`);
      console.log(`    source: ${f.test.source}`);
    }
  }
  if (missingRows.length > 0) {
    console.log('\nMissing rows (test couldn\'t evaluate):');
    for (const m of missingRows) console.log(`  ${m}`);
  }

  await sql.end();
  process.exit(failed > 0 ? 1 : 0);
})();
