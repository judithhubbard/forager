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
// --with-inat: for low-confidence proposals, query the empirical_inat
// rows in species_fruiting_windows and fit a per-zone slope. The
// empirical slope can falsify a low-confidence rule-based proposal
// (e.g., chickweed warm-zone winter was proposed as 'photoperiod'
// based on slope=0 + wide half_window, but iNat data shows peak DOY
// shifts -4.6 d/half-zone in zones 7a-9a — clearly heat_driven).
const withInat = args.includes('--with-inat');
// --pull-missing: for any low-confidence proposal whose member species
// has no empirical_inat data, call scripts/inat-phenology.cjs to pull
// observations and re-classify. Slow (5-30s per species); only
// activates with --with-inat.
const pullMissing = args.includes('--pull-missing');

const ALL_MECHANISMS = new Set([
  'heat_driven', 'cool_night', 'frost_anchored',
  'photoperiod', 'rain_flush', 'dormancy_break', 'indeterminate'
]);

const TSV_PATH = path.join(ROOT, 'audit-mechanism.tsv');
const JSON_PATH = path.join(ROOT, 'audit-mechanism.json');

// DB connection — only needed for --with-inat. Lazy so apply / vanilla
// runs don't open a connection they won't use.
let sql = null;
function getSql() {
  if (sql) return sql;
  const env = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
  const SUPABASE_DB_URL = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim();
  sql = require(path.join(ROOT, 'node_modules', 'postgres'))(
    SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined }
  );
  return sql;
}

const ZONE_NUM = {
  '3a': 6, '3b': 7, '4a': 8, '4b': 9, '5a': 10, '5b': 11,
  '6a': 12, '6b': 13, '7a': 14, '7b': 15, '8a': 16, '8b': 17,
  '9a': 18, '9b': 19, '10a': 20, '10b': 21, '11a': 22, '11b': 23
};

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

/** Apply the slope-direction default for a complex entry. Caller-
 *  provided reason + confidence let the keyword-conflict branch
 *  delegate cleanly. */
function slopeDefault(cx, extraReason = null, conf = null) {
  const stage = cx.stage ?? 'ripe';
  const slope = cx.shift_per_half_zone;
  if (slope < 0) {
    return {
      proposed_mechanism: 'heat_driven',
      confidence: conf ?? 'medium',
      reason: extraReason ?? `Negative slope (${slope}) → heat_driven default`
    };
  }
  if (slope > 0) {
    if (stage === 'mushroom_flush') {
      return {
        proposed_mechanism: 'cool_night',
        confidence: conf ?? 'medium',
        reason: extraReason ?? `Mushroom + positive slope (${slope}) → cool_night`
      };
    }
    if (stage === 'leaf' || stage === 'shoot' || stage === 'root_dig') {
      return {
        proposed_mechanism: 'dormancy_break',
        confidence: conf ?? 'low',
        reason: extraReason ?? `${stage} with positive slope (${slope}) — likely dormancy-tracked but worth confirming`
      };
    }
    return {
      proposed_mechanism: 'frost_anchored',
      confidence: conf ?? 'low',
      reason: extraReason ?? `Positive slope (${slope}) on ${stage} — likely frost-tracked, please confirm`
    };
  }
  // slope === 0
  const halfWindow = cx.half_window ?? 0;
  if (halfWindow >= 30) {
    return {
      proposed_mechanism: 'photoperiod',
      confidence: conf ?? 'low',
      reason: extraReason ?? `Zero slope + wide half_window (${halfWindow}) — photoperiod-locked candidate`
    };
  }
  return {
    proposed_mechanism: 'indeterminate',
    confidence: conf ?? 'low',
    reason: extraReason ?? `Zero slope + narrow half_window (${halfWindow}) — mechanism unclear`
  };
}

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

  // Summary keyword scans — but ONLY when consistent with the slope
  // direction. Frost / cool-night summary mentions in heat-driven
  // species are usually about FLAVOR (e.g., "sweeten after frost",
  // "frost-blet", "persists into first hard frost") not RIPENING
  // TRIGGER. The slope direction is the more reliable signal; the
  // summary keyword can only ELEVATE a proposal that's already
  // plausible from the slope.
  for (const [mech, re] of Object.entries(SUMMARY_PATTERNS)) {
    if (!re.test(summary)) continue;
    // Compatibility check: does this mechanism agree with the slope
    // direction?
    const compatible =
      (mech === 'heat_driven' && slope < 0) ||
      (mech === 'cool_night' && slope > 0) ||
      (mech === 'frost_anchored' && slope >= 0) ||   // frost_anchored ignores slope, but heat-driven slopes are inconsistent
      (mech === 'photoperiod' && slope === 0) ||
      (mech === 'rain_flush' && slope === 0) ||
      (mech === 'dormancy_break' && slope >= 0);
    if (!compatible) {
      // Found a keyword but it disagrees with the slope. Don't trust
      // it as authoritative — record the conflict as a note and fall
      // through to the slope-direction default below.
      // (E.g., highbush cranberry summary says "after first frost"
      // but slope is -3 = heat-driven; the frost mention is about
      // flavor improvement, not ripening.)
      // We continue to the slope default; the reason will note this.
      return slopeDefault(cx, `Summary keyword '${mech}' detected but conflicts with slope ${slope} — using slope direction; manual review recommended if mechanism actually is ${mech}`, 'low');
    }
    // For mushrooms, the summary keyword carries extra weight
    const conf = stage === 'mushroom_flush' ? 'high' : 'medium';
    return { proposed_mechanism: mech, confidence: conf, reason: `Summary keyword for ${mech} (consistent with slope ${slope})` };
  }

  // Stage-specific rules
  if (stage === 'sap_run') {
    if (slope > 0) {
      return { proposed_mechanism: 'frost_anchored', confidence: 'high', reason: 'sap_run with positive slope (cold-trigger flow tracks LSF)' };
    }
    return { proposed_mechanism: 'heat_driven', confidence: 'medium', reason: 'sap_run with non-positive slope (heat-driven sap rise)' };
  }

  // (2) SLOPE-DIRECTION DEFAULTS — medium confidence
  return slopeDefault(cx);
}

/** TSV-quote a value: replace tab + newline with spaces. */
function tsv(v) {
  if (v == null) return '';
  return String(v).replace(/[\t\r\n]+/g, ' ');
}

/** Fit a simple linear regression slope (least-squares) of peak_doy
 *  vs zoneNum across the supplied points. Returns null when fewer
 *  than 2 distinct zones. The slope is reported in DOY-per-HALF-ZONE
 *  (so −3 means warmer-by-one-half-zone shifts peak 3 days earlier),
 *  matching the COMPLEX entry's shift_per_half_zone units. */
function fitSlope(points) {
  // points: [{ zoneNum, peakDoy }, …]
  const distinctZones = new Set(points.map((p) => p.zoneNum));
  if (distinctZones.size < 2) return null;
  const n = points.length;
  const meanX = points.reduce((s, p) => s + p.zoneNum, 0) / n;
  const meanY = points.reduce((s, p) => s + p.peakDoy, 0) / n;
  let num = 0, den = 0;
  for (const p of points) {
    num += (p.zoneNum - meanX) * (p.peakDoy - meanY);
    den += (p.zoneNum - meanX) ** 2;
  }
  if (den === 0) return null;
  return num / den; // DOY per half-zone (zoneNum increments are half-zone steps)
}

/** Pull empirical_inat peak DOYs across zones for one species, optional
 *  stage filter. Returns array of {zone, zoneNum, peakDoy} sorted by
 *  zoneNum. Includes both stand-alone empirical_inat rows AND iNat
 *  evidence entries appended to other rows (so we don't miss species
 *  whose curated rows just have an iNat bracket attached). */
async function getEmpiricalForSpecies(speciesId, stage) {
  const s = getSql();
  // empirical_inat-confidence rows
  const standalone = await s`
    select cz.code as zone, w.peak_doy as peak_doy
      from species_fruiting_windows w
      join climate_zones cz on cz.id = w.climate_zone_id
     where w.species_id = ${speciesId}
       and w.confidence = 'empirical_inat'
       and (${stage === null} or w.stage = ${stage}::public.stage)`;
  const points = [];
  for (const r of standalone) {
    const zn = ZONE_NUM[r.zone];
    if (zn != null && r.peak_doy != null) points.push({ zone: r.zone, zoneNum: zn, peakDoy: r.peak_doy });
  }
  // iNat evidence entries appended to curated/regional rows. These
  // carry their own supports.{peak_doy, start_doy, end_doy} but live
  // on a row whose synthesized peak was from another source.
  const inatEv = await s`
    select cz.code as zone, jsonb_path_query(w.evidence, '$[*] ? (@.is_inat == true)') as ev
      from species_fruiting_windows w
      join climate_zones cz on cz.id = w.climate_zone_id
     where w.species_id = ${speciesId}
       and (${stage === null} or w.stage = ${stage}::public.stage)
       and w.evidence is not null`;
  for (const r of inatEv) {
    const peak = r.ev?.peak_doy ?? r.ev?.supports?.peak_doy;
    const zn = ZONE_NUM[r.zone];
    if (zn != null && peak != null) {
      // Avoid duplicating the standalone empirical_inat row.
      if (!points.some((p) => p.zoneNum === zn && p.peakDoy === peak)) {
        points.push({ zone: r.zone, zoneNum: zn, peakDoy: peak });
      }
    }
  }
  points.sort((a, b) => a.zoneNum - b.zoneNum);
  return points;
}

/** Use the empirical slope to suggest a mechanism. Returns the same
 *  shape as classify(): { proposed_mechanism, confidence, reason }.
 *  Returns null when there isn't enough empirical data to draw any
 *  conclusion. */
function classifyFromEmpiricalSlope(empiricalSlope, points, stage) {
  if (empiricalSlope == null) return null;
  const slopeStr = empiricalSlope.toFixed(1);
  const nz = new Set(points.map((p) => p.zoneNum)).size;
  // Threshold: |slope| > 1.5 d/half-zone is a meaningful direction.
  // Under 1.5 means the empirical data is consistent with "flat".
  if (empiricalSlope <= -1.5) {
    return {
      proposed_mechanism: 'heat_driven',
      confidence: 'high',
      reason: `iNat empirical slope ${slopeStr} d/half-zone across ${nz} zones — heat_driven`
    };
  }
  if (empiricalSlope >= 1.5) {
    if (stage === 'mushroom_flush') {
      return {
        proposed_mechanism: 'cool_night',
        confidence: 'high',
        reason: `iNat empirical slope +${slopeStr} d/half-zone (mushroom) — cool_night`
      };
    }
    return {
      proposed_mechanism: 'frost_anchored',
      confidence: 'high',
      reason: `iNat empirical slope +${slopeStr} d/half-zone — frost_anchored / cool-trigger`
    };
  }
  // |slope| < 1.5 d/half-zone across multiple zones = genuinely flat
  return {
    proposed_mechanism: 'photoperiod',
    confidence: 'high',
    reason: `iNat empirical slope ${slopeStr} d/half-zone across ${nz} zones — flat → photoperiod`
  };
}

/** Run inat-phenology.cjs for one species as a subprocess. Returns
 *  number of zones with new iNat data (best-effort parse of the
 *  script's stdout summary line). */
function pullInatForSpecies(scientificName) {
  const { spawnSync } = require('node:child_process');
  const r = spawnSync(
    'node',
    [path.join(__dirname, 'inat-phenology.cjs'), scientificName],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const out = (r.stdout || '') + (r.stderr || '');
  const m = out.match(/(\d+) zones with obs total/);
  return m ? parseInt(m[1], 10) : 0;
}

async function buildAuditRows() {
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
    const r = classify(cx);
    rows.push({
      name: cx.name,
      stage: cx.stage ?? 'ripe',
      slope: cx.shift_per_half_zone,
      half_window: cx.half_window,
      proposed_mechanism: r.proposed_mechanism,
      confidence: r.confidence,
      reason: r.reason,
      members: (cx.members || []).join(', '),
      summary_snippet: (cx.summary || '').substring(0, 80),
      is_annotated: false,
      // Slot for the empirical refinement below.
      empirical_slope: null,
      empirical_zones: null
    });
  }

  // --with-inat: re-classify low-confidence rows using empirical data.
  // The data-seeking principle: don't punt on uncertainty, INVESTIGATE.
  if (withInat) {
    const lowConfRows = rows.filter((r) => r.confidence === 'low');
    console.log(`\n--- Empirical refinement pass: ${lowConfRows.length} low-confidence entries ---`);
    const s = getSql();
    for (const row of lowConfRows) {
      const cx = COMPLEXES.find((c) => c.name === row.name);
      if (!cx) continue;
      // Use the first member species as the data source. Most COMPLEX
      // entries have 1 member; for multi-member complexes the timing
      // should be similar across members by construction.
      const firstMember = (cx.members || [])[0];
      if (!firstMember) continue;
      const stage = cx.stage ?? 'ripe';
      const sp = await s`select id from species where scientific_name = ${firstMember}`;
      if (sp.length === 0) {
        row.reason += ' · iNat: species not in DB';
        continue;
      }
      // Query empirical data WITHOUT stage filter. The COMPLEX entry's
      // stage may be 'leaf' or 'root_dig' but iNat's Fruiting-annotated
      // observations are necessarily 'ripe' stage. Mechanism is a
      // species-level concept, so the species's empirical phenology
      // pattern is informative regardless of which stage the complex
      // entry models. (Sweet birch sap is the exception — and it's
      // already explicitly annotated.)
      let points = await getEmpiricalForSpecies(sp[0].id, null);

      // If we have no iNat data and --pull-missing is set, fetch it.
      if (points.length === 0 && pullMissing) {
        console.log(`  ${row.name}: no empirical data, pulling iNat for ${firstMember}...`);
        const n = pullInatForSpecies(firstMember);
        if (n > 0) {
          // Re-query after the pull
          points = await getEmpiricalForSpecies(sp[0].id, null);
        } else {
          row.reason += ` · iNat: 0 fruiting obs across all zones`;
          continue;
        }
      }

      if (points.length === 0) {
        row.reason += ' · iNat: no empirical data in DB (try --pull-missing)';
        continue;
      }

      const empSlope = fitSlope(points);
      row.empirical_slope = empSlope;
      row.empirical_zones = points.length;

      if (empSlope == null) {
        row.reason += ` · iNat: only ${points.length} zone(s), can't fit slope`;
        continue;
      }

      const refined = classifyFromEmpiricalSlope(empSlope, points, stage);
      if (refined) {
        const before = row.proposed_mechanism;
        if (refined.proposed_mechanism !== before) {
          console.log(`  ${row.name}: ${before} → ${refined.proposed_mechanism} (empirical slope ${empSlope.toFixed(1)} d/half-zone across ${points.length} zones)`);
        } else {
          console.log(`  ${row.name}: confirmed ${refined.proposed_mechanism} via empirical slope ${empSlope.toFixed(1)}`);
        }
        row.proposed_mechanism = refined.proposed_mechanism;
        row.confidence = refined.confidence;
        row.reason = refined.reason;
      }
    }
    console.log();
  }

  return rows;
}

function writeTsv(rows) {
  const lines = ['name\tstage\tslope\thalf_window\tproposed_mechanism\tconfidence\treason\tempirical_slope\tempirical_zones\tsummary_snippet\tOK?'];
  for (const r of rows) {
    if (r.is_annotated) continue; // only un-annotated rows need review
    lines.push([
      r.name, r.stage, r.slope, r.half_window,
      r.proposed_mechanism, r.confidence, r.reason,
      r.empirical_slope != null ? r.empirical_slope.toFixed(1) : '',
      r.empirical_zones != null ? r.empirical_zones : '',
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

(async () => {
if (apply) {
  applyFromTsv();
} else {
  const rows = await buildAuditRows();
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
  if (sql) await sql.end();
})().catch((err) => {
  console.error('audit-mechanism failed:', err);
  if (sql) sql.end();
  process.exit(1);
});
