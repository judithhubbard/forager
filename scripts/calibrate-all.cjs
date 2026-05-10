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

// Order rationale (revised after the chinkapin Florida 9a finding):
// nut-frost-fix runs FIRST to set frost-driven anchors; then rederive
// runs and overrides nut species ONLY when explicit-zone-match
// regional evidence exists (e.g., Eat The Weeds Florida → 9a).
// This way cited regional sources for warm zones (where the frost-
// driven model overshoots) take precedence over the generic frost
// calculation, while cold/medium zones without explicit evidence
// keep the frost-driven default.
// Order rationale:
//   1. sidecar evidence migrated to evidence array
//   2. nut-frost-fix sets frost-driven anchors for nut species (so
//      rederive at step 3 has a baseline to either override-with-
//      strong-evidence or preserve)
//   3. rederive: for nut species, only overrides when explicit-zone-
//      match regional evidence exists (e.g., Eat The Weeds Florida
//      9a → 9a). For non-nut species, computes envelope from all
//      supporting evidence.
//   4-9. Species-specific fixes run AFTER rederive so they aren't
//      overwritten by the evidence envelope (which can be polluted
//      by over-shifted entries).
//   10. smooth-across-zones interpolates soft zones from anchors.
//   11. test-calibration validates the final state.
const STEPS = [
  { name: '1. migrate-regional-sidecar',  script: 'migrate-regional-sidecar.cjs',  optional: true },
  { name: '2. nut-frost-fix',             script: 'nut-frost-fix.cjs',             optional: false },
  { name: '3. rederive-from-evidence',    script: 'rederive-from-evidence.cjs',    optional: false },
  { name: '4. maple-sap-fix',             script: 'maple-sap-fix.cjs',             optional: false },
  { name: '5. pawpaw-fix',                script: 'pawpaw-fix.cjs',                optional: false },
  { name: '6. mulberry-fix',              script: 'mulberry-fix.cjs',              optional: false },
  { name: '7. foxgrape-fix',              script: 'foxgrape-fix.cjs',              optional: false },
  { name: '8. beech-frost-fix',           script: 'beech-frost-fix.cjs',           optional: false },
  { name: '9. blackberry-fix',            script: 'blackberry-fix.cjs',            optional: false },
  { name: '10. smooth-across-zones',      script: 'smooth-across-zones.cjs',       optional: false },
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
