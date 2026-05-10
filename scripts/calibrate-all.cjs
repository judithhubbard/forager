// Canonical calibration rebuild pipeline.
//
// Runs every calibration script in the correct order, then runs the
// regression test harness. This replaces the ad-hoc "run rederive
// then nut-frost-fix then maple-sap-fix in some order" pattern that
// produced different results depending on the path. Pipeline order
// matters because some scripts override values written by others
// (e.g., nut-frost-fix's frost-driven anchors override rederive's
// evidence envelope for nut species).
//
// Order rationale:
//   1. migrate-regional-sidecar — adds JSON sidecar entries to
//      evidence (one-shot but idempotent)
//   2. rederive-from-evidence — synthesize DOY from evidence, with
//      INAT_WRONG_STAGE skip so nut species are reserved for #3
//   3. nut-frost-fix — overrides nut species with NOAA first-frost
//      anchored values
//   4. maple-sap-fix — overrides maple sap rows with heat-driven
//      direction (corrects an old Phase A inversion)
//   5. pawpaw-fix — overrides pawpaw with KSU-anchored values (iNat
//      first-fruit bias would otherwise dominate)
//   6. beech-frost-fix — single-species fix for beech (subset of
//      nut-frost-fix; kept for explicit anchoring)
//   7. blackberry-fix — restores cold-zone blackberry envelopes
//      after any rederive churn
//   8. smooth-across-zones — interpolates soft (non-anchor) zones
//      from flanking anchors
//   9. test-calibration — runs regression tests and exits non-zero
//      on failure
//
// Usage:
//   node scripts/calibrate-all.cjs              # full rebuild
//   node scripts/calibrate-all.cjs --skip-tests # skip step 9

'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');

const SCRIPTS_DIR = '/Users/jk/Dropbox/Claude/forager/scripts';
const skipTests = process.argv.includes('--skip-tests');

const STEPS = [
  { name: '1. migrate-regional-sidecar',  script: 'migrate-regional-sidecar.cjs',  optional: true },
  { name: '2. rederive-from-evidence',    script: 'rederive-from-evidence.cjs',    optional: false },
  { name: '3. nut-frost-fix',             script: 'nut-frost-fix.cjs',             optional: false },
  { name: '4. maple-sap-fix',             script: 'maple-sap-fix.cjs',             optional: false },
  { name: '5. pawpaw-fix',                script: 'pawpaw-fix.cjs',                optional: false },
  { name: '5b. mulberry-fix',             script: 'mulberry-fix.cjs',              optional: false },
  { name: '6. beech-frost-fix',           script: 'beech-frost-fix.cjs',           optional: false },
  { name: '7. blackberry-fix',            script: 'blackberry-fix.cjs',            optional: false },
  { name: '8. smooth-across-zones',       script: 'smooth-across-zones.cjs',       optional: false },
];
if (!skipTests) {
  STEPS.push({ name: '9. test-calibration', script: 'test-calibration.cjs', optional: false });
}

async function runStep(step) {
  return new Promise((resolve, reject) => {
    console.log(`\n── ${step.name} ──`);
    const t0 = Date.now();
    const child = spawn('node', [path.join(SCRIPTS_DIR, step.script)], { stdio: 'inherit' });
    child.on('exit', (code) => {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1) + 's';
      if (code === 0) {
        console.log(`✓ ${step.name} done in ${elapsed}`);
        resolve(0);
      } else if (step.optional) {
        console.log(`⚠ ${step.name} exit ${code} (optional, continuing) in ${elapsed}`);
        resolve(code);
      } else {
        console.log(`✗ ${step.name} exit ${code} in ${elapsed}`);
        reject(new Error(`step failed: ${step.name}`));
      }
    });
  });
}

(async () => {
  console.log(`Running canonical calibration pipeline (${STEPS.length} steps)`);
  const t0 = Date.now();
  let lastTestExit = 0;
  for (const step of STEPS) {
    try {
      lastTestExit = await runStep(step);
    } catch (e) {
      console.error(`\nPipeline aborted at ${step.name}: ${e.message}`);
      process.exit(2);
    }
  }
  const total = ((Date.now() - t0) / 1000).toFixed(1) + 's';
  console.log(`\n=== Pipeline complete in ${total} ===`);
  process.exit(lastTestExit);
})();
