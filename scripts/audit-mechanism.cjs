// Audit-mechanism: propose a `mechanism` field for every COMPLEX entry
// in species-complex-unify.cjs that doesn't already have one explicitly
// set. Pure read-only — never edits the source file. Slice 2 of the
// calibration-model-mechanism plan (see /Users/jk/.claude/plans/
// magical-chasing-tarjan.md).
//
// Per-entry classification rules (highest-confidence rule wins):
//
//   1. STRONG SIGNALS (high confidence)
//      Species-name keyword → frost_anchored:
//        Diospyros virginiana (persimmon, despite folklore — but
//        already annotated explicitly as heat_driven)
//        Rosa rugosa hip stage
//        Hippophae rhamnoides (sea buckthorn) hip stage
//        Vaccinium post-frost stages
//        Any species whose curated summary contains
//          /after frost|hard frost|first .* frost|post-frost/i
//
//      Species-name keyword → cool_night:
//        Grifola frondosa (hen of woods — explicit), Hericium
//        (lion's mane — explicit), Hypsizygus, Pleurotus when
//        slope > 0
//        Any species whose summary mentions cool/cold-trigger
//        for stage mushroom_flush
//
//      Stage sap_run with positive slope → frost_anchored (cold-
//        trigger sap rise). Negative slope → heat_driven.
//
//   2. SLOPE-DIRECTION DEFAULTS (medium confidence)
//      slope < 0  → heat_driven
//      slope > 0  → cool_night (when stage = mushroom_flush)
//                 → dormancy_break (when stage in leaf, shoot, root_dig)
//                 → frost_anchored (otherwise — e.g., ripe nuts that
//                   drop after frost in cold zones)
//      slope = 0  → photoperiod (when half_window >= 30 — wide-window
//                   day-length-locked species)
//                 → indeterminate (when half_window < 30 — narrow
//                   window with no slope means we don't really know)
//
//   3. LOW CONFIDENCE for any case where the slope and stage
//      combination is unusual (e.g., positive slope on flower_harvest
//      — heat_driven cooling species are rare and worth a closer look).
//
// Usage:
//   node scripts/audit-mechanism.cjs           # writes TSV + JSON
//   node scripts/audit-mechanism.cjs --json    # prints JSON to stdout
//   node scripts/audit-mechanism.cjs --apply   # reads TSV back +
//                                                prints patches to stdout
//
// Output files (in project root, gitignored if you don't want them
// committed):
//   audit-mechanism.tsv  — human-reviewable, has an OK? column
//   audit-mechanism.json — machine-readable, same data
//
// After review:
//   1. Edit audit-mechanism.tsv. In the OK? column:
//        blank          = accept the proposal
//        skip           = leave the entry without an explicit mechanism
//        <mechanism>    = override with that mechanism (must be one of
//                         the recognized values)
//   2. Run `node scripts/audit-mechanism.cjs --apply` — prints a
//      patches block to stdout, one entry per block, formatted so you
//      can apply via the Edit tool (find/replace) or manually.
//   3. Re-run `node scripts/species-complex-unify.cjs` — validation
//      should run clean.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const { COMPLEXES } = require(path.join(ROOT, 'scripts', 'species-complex-unify.cjs'));

const args = process.argv.slice(2);
const wantJson = args.includes('--json');
const apply = args.includes('--apply');

const ALL_MECHANISMS = new Set([
  'heat_driven', 'cool_night', 'frost_anchored',
  'photoperiod', 'rain_flush', 'dormancy_break', 'indeterminate'
]);

const TSV_PATH = path.join(ROOT, 'audit-mechanism.tsv');
const JSON_PATH = path.join(ROOT, 'audit-mechanism.json');

/** Strong-signal keywords by species scientific name (lowercased).
 *  Maps a substring to the mechanism it implies. */
const SPECIES_KEYWORDS = {
  'rosa rugosa': 'frost_anchored',          // hip stage post-frost
  'hippophae': 'frost_anchored',            // sea buckthorn
  'grifola': 'cool_night',
  'hericium': 'cool_night',
  'hypsizygus': 'cool_night',
  'lepista': 'cool_night',                  // wood blewit
  'flammulina': 'cool_night',               // velvet shank — winter mushroom
};

/** Stage-summary regex patterns (case-insensitive). */
const SUMMARY_PATTERNS = {
  frost_anchored: /\b(after frost|hard frost|first .* frost|post-frost|after the first frost)\b/i,
  cool_night: /\b(cool night|cool-night|cool-temperature|cool temperature trigger|first cool|drop in temp|after autumn rain|autumn cooling)\b/i,
  photoperiod: /\b(day.length|photoperiod|equinox-triggered)\b/i,
  rain_flush: /\b(rain.flush|after rain|rain.triggered|first heavy rain|monsoon)\b/i,
  dormancy_break: /\b(chill.hour|after dormancy|spring warm.up|sap rise|sap.run)\b/i
};

/** Stages that go to spring (last-spring-frost anchor) vs fall. */
const SPRING_STAGES = new Set(['shoot', 'leaf', 'flowering', 'flower_harvest', 'sap_run', 'green']);

/** Apply the classification rules to one complex entry. Returns
 *  { proposed_mechanism, confidence, reason }. */
function classify(cx) {
  const stage = cx.stage ?? 'ripe';
  const slope = cx.shift_per_half_zone;
  const summary = cx.summary || '';
  const members = (cx.members || []).join(' ').toLowerCase();
  const name = (cx.name || '').toLowerCase();

  // (1) STRONG SIGNALS — high confidence
  for (const [keyword, mech] of Object.entries(SPECIES_KEYWORDS)) {
    if (members.includes(keyword) || name.includes(keyword)) {
      return { proposed_mechanism: mech, confidence: 'high', reason: `Species keyword '${keyword}' → ${mech}` };
    }
  }
  // Pleurotus with positive slope → cool_night (fall flush);
  // negative → heat_driven (spring flush already in source).
  if (members.includes('pleurotus') && slope > 0) {
    return { proposed_mechanism: 'cool_night', confidence: 'high', reason: 'Pleurotus with positive slope' };
  }

  // Summary keyword scans, in priority order
  for (const [mech, re] of Object.entries(SUMMARY_PATTERNS)) {
    if (re.test(summary)) {
      // For mushrooms, the summary keyword carries extra weight
      const conf = stage === 'mushroom_flush' ? 'high' : 'medium';
      return { proposed_mechanism: mech, confidence: conf, reason: `Summary keyword for ${mech}` };
    }
  }

  // Stage-specific rules
  if (stage === 'sap_run') {
    if (slope > 0) {
      return { proposed_mechanism: 'frost_anchored', confidence: 'high', reason: 'sap_run with positive slope (cold-trigger flow tracks LSF)' };
    }
    return { proposed_mechanism: 'heat_driven', confidence: 'medium', reason: 'sap_run with non-positive slope (heat-driven sap rise)' };
  }

  // (2) SLOPE-DIRECTION DEFAULTS — medium confidence
  if (slope < 0) {
    return { proposed_mechanism: 'heat_driven', confidence: 'medium', reason: `Negative slope (${slope}) → heat_driven default` };
  }
  if (slope > 0) {
    if (stage === 'mushroom_flush') {
      return { proposed_mechanism: 'cool_night', confidence: 'medium', reason: `Mushroom + positive slope (${slope}) → cool_night` };
    }
    if (stage === 'leaf' || stage === 'shoot' || stage === 'root_dig') {
      return { proposed_mechanism: 'dormancy_break', confidence: 'low', reason: `${stage} with positive slope (${slope}) — likely dormancy-tracked but worth confirming` };
    }
    return { proposed_mechanism: 'frost_anchored', confidence: 'low', reason: `Positive slope (${slope}) on ${stage} — likely frost-tracked, please confirm` };
  }
  // slope === 0
  const halfWindow = cx.half_window ?? 0;
  if (halfWindow >= 30) {
    return { proposed_mechanism: 'photoperiod', confidence: 'low', reason: `Zero slope + wide half_window (${halfWindow}) — photoperiod-locked candidate` };
  }
  return { proposed_mechanism: 'indeterminate', confidence: 'low', reason: `Zero slope + narrow half_window (${halfWindow}) — mechanism unclear` };
}

/** TSV-quote a value: replace tab + newline with spaces. */
function tsv(v) {
  if (v == null) return '';
  return String(v).replace(/[\t\r\n]+/g, ' ');
}

function buildAuditRows() {
  const rows = [];
  for (const cx of COMPLEXES) {
    if (cx.mechanism) {
      // Already annotated — don't propose, just note.
      rows.push({
        name: cx.name,
        stage: cx.stage ?? 'ripe',
        slope: cx.shift_per_half_zone,
        half_window: cx.half_window,
        proposed_mechanism: cx.mechanism,
        confidence: 'explicit',
        reason: 'already annotated in source',
        members: (cx.members || []).join(', '),
        summary_snippet: (cx.summary || '').substring(0, 80),
        is_annotated: true
      });
      continue;
    }
    const { proposed_mechanism, confidence, reason } = classify(cx);
    rows.push({
      name: cx.name,
      stage: cx.stage ?? 'ripe',
      slope: cx.shift_per_half_zone,
      half_window: cx.half_window,
      proposed_mechanism,
      confidence,
      reason,
      members: (cx.members || []).join(', '),
      summary_snippet: (cx.summary || '').substring(0, 80),
      is_annotated: false
    });
  }
  return rows;
}

function writeTsv(rows) {
  const lines = ['name\tstage\tslope\thalf_window\tproposed_mechanism\tconfidence\treason\tsummary_snippet\tOK?'];
  for (const r of rows) {
    if (r.is_annotated) continue; // only un-annotated rows need review
    lines.push([
      r.name, r.stage, r.slope, r.half_window,
      r.proposed_mechanism, r.confidence, r.reason,
      r.summary_snippet, ''
    ].map(tsv).join('\t'));
  }
  fs.writeFileSync(TSV_PATH, lines.join('\n') + '\n');
}

function writeJson(rows) {
  const out = {
    generated_at: new Date().toISOString(),
    total_complexes: COMPLEXES.length,
    already_annotated: rows.filter((r) => r.is_annotated).length,
    pending_review: rows.filter((r) => !r.is_annotated).length,
    by_proposed_mechanism: rows.reduce((m, r) => {
      const k = r.proposed_mechanism;
      m[k] = (m[k] || 0) + 1;
      return m;
    }, {}),
    by_confidence: rows.reduce((m, r) => {
      const k = r.confidence;
      m[k] = (m[k] || 0) + 1;
      return m;
    }, {}),
    rows
  };
  fs.writeFileSync(JSON_PATH, JSON.stringify(out, null, 2));
  return out;
}

/** --apply: read the user-edited TSV back and emit per-entry patch
 *  text the user can paste (or feed into Edit tool calls). */
function applyFromTsv() {
  if (!fs.existsSync(TSV_PATH)) {
    console.error(`audit-mechanism.tsv not found at ${TSV_PATH}. Run without --apply first.`);
    process.exit(1);
  }
  const lines = fs.readFileSync(TSV_PATH, 'utf8').split('\n');
  const header = lines.shift().split('\t');
  const nameIdx = header.indexOf('name');
  const proposedIdx = header.indexOf('proposed_mechanism');
  const okIdx = header.indexOf('OK?');
  if (nameIdx < 0 || proposedIdx < 0 || okIdx < 0) {
    console.error('TSV header missing required columns (name, proposed_mechanism, OK?). Was the file edited destructively?');
    process.exit(1);
  }

  // Build a name → mechanism map from the TSV
  const decisions = new Map();
  for (const ln of lines) {
    if (!ln.trim()) continue;
    const cells = ln.split('\t');
    const name = cells[nameIdx];
    const proposed = cells[proposedIdx];
    const okRaw = (cells[okIdx] ?? '').trim();
    let mechanism;
    if (okRaw === '') mechanism = proposed;
    else if (okRaw.toLowerCase() === 'skip') continue;
    else if (ALL_MECHANISMS.has(okRaw)) mechanism = okRaw;
    else {
      console.warn(`# WARN: ${name}: OK? value '${okRaw}' is not a recognized mechanism — skipping`);
      continue;
    }
    decisions.set(name, mechanism);
  }

  // Generate per-entry patches. Format suitable for manual paste
  // OR for feeding into Edit tool calls. Each block shows the
  // before/after diff for the entry's first two lines.
  console.log(`# audit-mechanism --apply patches`);
  console.log(`# Generated ${new Date().toISOString()}`);
  console.log(`# ${decisions.size} entries to annotate.`);
  console.log(`#`);
  console.log(`# For each entry below, edit scripts/species-complex-unify.cjs:`);
  console.log(`# find the entry by name, then add the indicated 'mechanism:'`);
  console.log(`# line after the members: line (the exact indent matches the`);
  console.log(`# surrounding lines).`);
  console.log();

  for (const cx of COMPLEXES) {
    if (cx.mechanism) continue;
    const mech = decisions.get(cx.name);
    if (!mech) continue;
    const memberLine = `    members: [${(cx.members || []).map((s) => `'${s}'`).join(', ')}],`;
    const mechLine = `    mechanism: '${mech}',`;
    console.log(`# == ${cx.name} ==`);
    console.log(`# Find this line in scripts/species-complex-unify.cjs:`);
    console.log(`#   ${memberLine}`);
    console.log(`# Insert immediately after it:`);
    console.log(`#   ${mechLine}`);
    console.log();
  }
}

// ---- Main ----

if (apply) {
  applyFromTsv();
} else {
  const rows = buildAuditRows();
  const summary = writeJson(rows);
  writeTsv(rows);

  if (wantJson) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`Audited ${rows.length} complex entries.`);
    console.log(`  ${summary.already_annotated} already annotated (skipped).`);
    console.log(`  ${summary.pending_review} pending review.`);
    console.log();
    console.log('Proposed distribution:');
    for (const [k, v] of Object.entries(summary.by_proposed_mechanism).sort(([, a], [, b]) => b - a)) {
      console.log('  ' + k.padEnd(20) + v);
    }
    console.log();
    console.log('Confidence distribution:');
    for (const [k, v] of Object.entries(summary.by_confidence).sort(([, a], [, b]) => b - a)) {
      console.log('  ' + k.padEnd(20) + v);
    }
    console.log();
    console.log(`Wrote: ${TSV_PATH}`);
    console.log(`Wrote: ${JSON_PATH}`);
    console.log();
    console.log('Next: review audit-mechanism.tsv (fill OK? column for any');
    console.log('overrides), then run `node scripts/audit-mechanism.cjs --apply`');
    console.log('to print patch blocks for manual application.');

    // Highlight low-confidence cases for closer review
    const lowConf = rows.filter((r) => r.confidence === 'low' && !r.is_annotated);
    if (lowConf.length > 0) {
      console.log();
      console.log(`Low-confidence proposals (${lowConf.length}) worth a closer look:`);
      for (const r of lowConf.slice(0, 30)) {
        console.log(`  ${r.name.padEnd(40)} slope=${String(r.slope).padStart(3)}  stage=${r.stage.padEnd(15)} → ${r.proposed_mechanism}  (${r.reason})`);
      }
      if (lowConf.length > 30) {
        console.log(`  … and ${lowConf.length - 30} more in audit-mechanism.tsv`);
      }
    }
  }
}
