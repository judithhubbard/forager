// Universal calibration sanity check.
//
// Runs three classes of regression check against the live DB content
// of species_fruiting_windows + the unify pipeline output. Designed
// to catch the three bugs that hit calibration this session:
//
//   1) CROSS-ZONE MONOTONICITY VIOLATION
//      For each (species, complex_name, stage), walk the rows in zone
//      order and assert peak_doy is monotonic. Direction is inferred
//      from the row sequence — if zone 6a peak < zone 7a peak the
//      complex is frost-driven (warmer = later); otherwise heat-driven.
//      Reports any zone where the trend reverses by more than a small
//      tolerance (default ±5 days).
//
//      Catches: hawthorn 8b→9a jump that flipped Sep 10 → Aug 29 + Jun 19
//      (8b peak 253, 9a peak 241 with start_doy 170 — wrong by months),
//      Ussurian pear stale-evidence supports that didn't reset after
//      an anchor edit, anything where regional_anchors override the
//      default shift inconsistently.
//
//   2) BIMODAL COLLAPSE RISK
//      For each (species, zone, stage), assert that any rows beyond
//      the first have a distinct complex_name. The complex_name
//      schema (migration 24) lets multiple complex entries coexist
//      for the same key — but only when each has a distinct name.
//      A NULL complex_name + a named complex_name for the same key
//      indicates a pre-migration row that wasn't cleaned up, which
//      will silently overwrite or get masked in dedup views.
//
//      Catches: watercress before the spring/fall split, papaya
//      year-wrap pre-migration, anything where seed-era rows
//      coexist with unify-era rows for the same key.
//
//   3) SUMMARY-VS-MATH MISMATCH
//      Heuristic: if a complex's summary text mentions explicit
//      double-window phrases ("Apr-Jun + Sep-Nov", "spring + fall",
//      "year-round", "two flushes"), but the pipeline only writes
//      a single window per (species, zone, stage) for the implicated
//      stage, flag it for review.
//
//      Catches: watercress + chickweed pre-split (both had bimodal
//      summary text but single rows); guava (bimodal summary, was
//      single-row before complex_name schema).
//
// Usage:
//   node scripts/check-windows.cjs                # all species
//   node scripts/check-windows.cjs "Stellaria media" "Galium aparine"
//   node scripts/check-windows.cjs --severity=warn  # don't exit nonzero
//
// Exit code: 0 if no errors, 1 if any errors (configurable via
// --severity=warn for soft pre-commit hook usage).

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const dbUrl = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim();
const sql = require(path.join(__dirname, '..', 'node_modules', 'postgres'))(
  dbUrl, { ssl: 'require', onnotice: () => undefined }
);

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const named = args.filter(a => !a.startsWith('--'));
const severity = flags.has('--severity=warn') ? 'warn' : 'error';

// Monotonicity tolerance: how many days a single zone can deviate from
// the trend before we flag. Cross-zone window-window noise from
// regional_anchors should stay within ±5 days at most.
const MONOTONICITY_TOLERANCE_DAYS = 5;

// USDA zone numeric ordering: cold→warm. Cold zones smaller; +0.5 for
// 'b'. Used to walk rows in cold-to-warm sequence for monotonicity.
function zoneNumeric(code) {
  const m = code.match(/^(\d+)([ab]?)$/);
  if (!m) return Number.NaN;
  return parseInt(m[1], 10) + (m[2] === 'b' ? 0.5 : 0);
}

// Bimodal-summary phrase detection. Conservative — false positives are
// fine; false negatives are the failure mode this is preventing.
const BIMODAL_SUMMARY_PATTERNS = [
  /spring\s*\+\s*fall/i,
  /spring\s+and\s+fall/i,
  /fall\s*\+\s*spring/i,
  /\b[A-Z][a-z]{2,3}-[A-Z][a-z]{2,3}\s*\+\s*[A-Z][a-z]{2,3}-[A-Z][a-z]{2,3}\b/, // "Apr-Jun + Sep-Nov"
  /year-round/i,
  /two\s+flushes/i,
  /bimodal/i,
  /late-year\s+\+\s+early-year/i
];

function looksBimodalSummary(text) {
  if (!text) return false;
  return BIMODAL_SUMMARY_PATTERNS.some(re => re.test(text));
}

async function loadAll(speciesFilter) {
  const filterClause = speciesFilter && speciesFilter.length
    ? sql`and s.scientific_name = any(${speciesFilter})`
    : sql``;
  return await sql`
    select s.id as species_id,
           s.scientific_name,
           s.common_name,
           w.id as window_id,
           w.stage,
           w.start_doy,
           w.end_doy,
           w.peak_doy,
           w.complex_name,
           w.notes,
           cz.code as zone_code
      from public.species s
      join public.species_fruiting_windows w on w.species_id = s.id
      join public.climate_zones cz on cz.id = w.climate_zone_id
     where s.is_forageable = true
       ${filterClause}
     order by s.scientific_name, w.stage, cz.code, w.id`;
}

function checkMonotonicity(rows) {
  // Group by (species, complex_name, stage); inside each group walk
  // by zoneNumeric and check peak_doy monotonicity.
  const violations = [];
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.scientific_name}|${r.complex_name ?? '(null)'}|${r.stage}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  for (const [key, group] of groups) {
    // Sort by zone numeric.
    const sorted = group.slice().sort(
      (a, b) => zoneNumeric(a.zone_code) - zoneNumeric(b.zone_code)
    );
    if (sorted.length < 3) continue; // need at least 3 zones to detect a trend
    // Infer direction from the first->last difference.
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const overall = last.peak_doy - first.peak_doy;
    const direction = overall > 0 ? +1 : -1; // +1 = warmer-later (frost-driven); -1 = warmer-earlier (heat-driven)
    // Walk neighbors, flag any reversal beyond tolerance.
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      const delta = cur.peak_doy - prev.peak_doy;
      // Reversal: opposite sign AND beyond tolerance.
      if (direction * delta < -MONOTONICITY_TOLERANCE_DAYS) {
        violations.push({
          key,
          scientific_name: cur.scientific_name,
          common_name: cur.common_name,
          stage: cur.stage,
          complex_name: cur.complex_name,
          zone: cur.zone_code,
          prev_zone: prev.zone_code,
          peak_doy: cur.peak_doy,
          prev_peak_doy: prev.peak_doy,
          delta,
          expected_direction: direction > 0 ? 'frost-driven (warmer = later)' : 'heat-driven (warmer = earlier)'
        });
      }
    }
  }
  return violations;
}

function checkBimodalCollapse(rows) {
  // For each (species, zone, stage), count distinct complex_name values
  // including null. If multiple rows share NULL complex_name, or a NULL
  // sits beside a named complex, flag.
  const violations = [];
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.scientific_name}|${r.zone_code}|${r.stage}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const complexNames = group.map(r => r.complex_name);
    const distinct = new Set(complexNames);
    // Bad: multiple rows but not all distinct complex_names (one or
    // more pairs of rows share the same name, which means the unify
    // pipeline's per-complex dedup must have failed).
    if (distinct.size < group.length) {
      const dupes = complexNames.reduce((m, n) => {
        m.set(n, (m.get(n) || 0) + 1); return m;
      }, new Map());
      const duped = [...dupes].filter(([, c]) => c > 1).map(([n]) => n);
      violations.push({
        key,
        scientific_name: group[0].scientific_name,
        common_name: group[0].common_name,
        zone: group[0].zone_code,
        stage: group[0].stage,
        n_rows: group.length,
        n_distinct: distinct.size,
        duplicated_complex_names: duped.map(n => n ?? '(null)'),
        window_ids: group.map(r => r.window_id)
      });
    }
    // Suspicious: one row with NULL complex_name + at least one with a
    // named complex. The NULL row is almost certainly a stale seed-era
    // row that should be deleted.
    else if (complexNames.includes(null) && complexNames.some(n => n != null)) {
      violations.push({
        key,
        scientific_name: group[0].scientific_name,
        common_name: group[0].common_name,
        zone: group[0].zone_code,
        stage: group[0].stage,
        n_rows: group.length,
        suspicious: 'null complex_name coexisting with named complex(es) — likely stale seed row',
        named_complexes: complexNames.filter(n => n != null),
        window_ids: group.map(r => r.window_id)
      });
    }
  }
  return violations;
}

function checkSummaryMath(rows) {
  // For each unique (species, complex_name) where complex_name is not
  // null, peek at the notes (which embed the summary text per
  // unify-pipeline convention) and look for bimodal-summary phrases.
  // If found AND only one complex entry exists for that species under
  // that stage, flag.
  const violations = [];
  // Index: species → stage → Set<complex_name>
  const byStage = new Map();
  // Index: (species, complex_name) → sample notes text
  const sampleNotes = new Map();
  for (const r of rows) {
    if (r.complex_name == null) continue;
    if (!byStage.has(r.scientific_name)) byStage.set(r.scientific_name, new Map());
    const stages = byStage.get(r.scientific_name);
    if (!stages.has(r.stage)) stages.set(r.stage, new Set());
    stages.get(r.stage).add(r.complex_name);
    const ckey = `${r.scientific_name}|${r.complex_name}`;
    if (!sampleNotes.has(ckey)) sampleNotes.set(ckey, { notes: r.notes, common: r.common_name, stage: r.stage });
  }
  for (const [ckey, { notes, common, stage }] of sampleNotes) {
    if (!looksBimodalSummary(notes)) continue;
    const [sci, complex_name] = ckey.split('|');
    const stages = byStage.get(sci);
    const complexesForStage = stages?.get(stage);
    if (complexesForStage && complexesForStage.size < 2) {
      violations.push({
        scientific_name: sci,
        common_name: common,
        stage,
        complex_name,
        bimodal_phrase_match: BIMODAL_SUMMARY_PATTERNS.filter(re => re.test(notes ?? '')).map(re => re.source).slice(0, 3),
        n_complexes_for_stage: complexesForStage?.size ?? 0,
        notes_excerpt: (notes ?? '').slice(0, 140)
      });
    }
  }
  return violations;
}

function formatViolations(monotonic, bimodal, summary) {
  const lines = [];
  if (monotonic.length === 0 && bimodal.length === 0 && summary.length === 0) {
    lines.push('✓ All checks passed.');
    return { ok: true, output: lines.join('\n') };
  }
  if (monotonic.length > 0) {
    lines.push(`\n=== Monotonicity violations (${monotonic.length}) ===`);
    for (const v of monotonic) {
      lines.push(`  ${v.scientific_name} (${v.common_name}) — ${v.stage} — ${v.complex_name ?? '(null)'}`);
      lines.push(`    ${v.prev_zone} peak ${v.prev_peak_doy} → ${v.zone} peak ${v.peak_doy} (Δ=${v.delta} d); expected ${v.expected_direction}`);
    }
  }
  if (bimodal.length > 0) {
    lines.push(`\n=== Bimodal-collapse risks (${bimodal.length}) ===`);
    for (const v of bimodal) {
      lines.push(`  ${v.scientific_name} (${v.common_name}) — zone ${v.zone}, stage ${v.stage}, ${v.n_rows} rows`);
      if (v.duplicated_complex_names) {
        lines.push(`    Duplicated complex_name values: ${v.duplicated_complex_names.join(', ')}`);
      } else if (v.suspicious) {
        lines.push(`    ${v.suspicious}; named=${v.named_complexes.join(', ')}`);
      }
      lines.push(`    window ids: ${v.window_ids.join(', ')}`);
    }
  }
  if (summary.length > 0) {
    lines.push(`\n=== Summary-vs-math mismatches (${summary.length}) ===`);
    for (const v of summary) {
      lines.push(`  ${v.scientific_name} (${v.common_name}) — stage ${v.stage}, complex "${v.complex_name}"`);
      lines.push(`    Summary text mentions bimodal pattern but only ${v.n_complexes_for_stage} complex(es) exists for this stage.`);
      lines.push(`    Matched phrase pattern(s): ${v.bimodal_phrase_match.join(' | ')}`);
      lines.push(`    Notes excerpt: ${JSON.stringify(v.notes_excerpt)}`);
    }
  }
  lines.push(`\nTotal: ${monotonic.length + bimodal.length + summary.length} issues`);
  return { ok: false, output: lines.join('\n') };
}

(async () => {
  const rows = await loadAll(named.length ? named : null);
  console.log(`Loaded ${rows.length} window rows across ${new Set(rows.map(r => r.scientific_name)).size} species.`);
  const monotonic = checkMonotonicity(rows);
  const bimodal = checkBimodalCollapse(rows);
  const summary = checkSummaryMath(rows);
  const { ok, output } = formatViolations(monotonic, bimodal, summary);
  console.log(output);
  await sql.end();
  process.exit(ok ? 0 : (severity === 'warn' ? 0 : 1));
})().catch(e => {
  console.error('check-windows failed:', e);
  sql.end();
  process.exit(2);
});
