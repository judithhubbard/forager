// Cross-zone monotonic smoothing of harvest windows.
//
// For each (species, stage), enforce monotonic DOY across zones based on the
// expected biological direction:
//   - Heat-driven (default): warmer zones → earlier DOY (flowering, fruit
//     ripe for most species, sap_run, shoot, leaf, flower_harvest)
//   - Frost-driven (per-species override): warmer zones → LATER DOY (late
//     nuts like American beech, persimmon, walnut, shagbark hickory — these
//     ripen as the first frost approaches, which arrives later in warmer
//     zones)
//   - Skip stages with weak zone signal (mushroom_flush — driven by rain
//     events; root_dig — year-round-ish; bark_strip — year-round-ish)
//
// Algorithm per (species, stage):
//   1. Sort rows by zone-numeric order.
//   2. Tag each row by evidence provenance — regional/iNat = ANCHOR (its
//      synthesized DOYs are trusted); generic-only/shifted-only = SOFT
//      (its DOYs were derived weakly and should be pulled toward the
//      anchor curve via interpolation).
//   3. Linearly interpolate SOFT zones between flanking ANCHOR zones.
//      Extrapolate beyond the outermost anchor with a per-half-zone
//      frost-date offset (~7 days, the same constant used in migration
//      #47).
//   4. Detect monotonicity violations among ANCHORS — report only;
//      don't auto-fix anchor data (real conflicts are signal worth
//      preserving).
//
// Idempotent: skips updates when computed values already match.
//
// Usage:
//   node scripts/smooth-across-zones.cjs --dry-run    # report only
//   node scripts/smooth-across-zones.cjs              # apply

'use strict';

const fs = require('node:fs');
const env = fs.readFileSync('/Users/jk/Dropbox/Claude/forager/.env.local', 'utf8');
const SUPABASE_DB_URL = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim();
const sql = require('/Users/jk/Dropbox/Claude/forager/node_modules/postgres')(
  SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined }
);

const dryRun = process.argv.includes('--dry-run');

// iNat samples below this size aren't statistically reliable enough
// to anchor a zone — small samples produce noisy p15/p85 estimates
// that show up as non-monotonic jumps in the across-zone curve.
const MIN_INAT_ANCHOR_OBS = 30;

// USDA hardiness zones map cleanly to a numeric axis (each half-zone =
// 5°F minimum-temp step ≈ 7 days of frost-date offset in temperate North
// America). The integer index lets us interpolate.
const ZONE_NUM = {
  '0a': 0, '0b': 1, '1a': 2, '1b': 3, '2a': 4, '2b': 5, '3a': 6, '3b': 7,
  '4a': 8, '4b': 9, '5a': 10, '5b': 11, '6a': 12, '6b': 13, '7a': 14, '7b': 15,
  '8a': 16, '8b': 17, '9a': 18, '9b': 19, '10a': 20, '10b': 21, '11a': 22, '11b': 23,
  '12a': 24, '12b': 25, '13a': 26, '13b': 27
};

// Direction by stage:
//   -1 = warmer zones earlier (heat-driven, default for fruits/sap/flowers/greens)
//    0 = no monotonic signal (skip — driven by other forces)
const DEFAULT_DIRECTION = {
  ripe: -1, ripening: -1, green: -1, past: 0,
  flowering: -1, flower_harvest: -1,
  shoot: -1, leaf: -1,
  sap_run: -1,
  root_dig: 0, mushroom_flush: 0, bark_strip: 0,
  bare: 0, unknown: 0
};

// Frost-driven late species: warmer zones → later DOY (frost arrives later
// in the year, so harvest happens later). Conservative — only the clearest
// cases. Walnut / hickory / oak are intermediate (maturation is heat-driven
// but drop is frost-loosened); leaving them as heat-driven default.
// Frost-driven ripe: harvest tracks first-frost timing, so warmer
// zones (later first frost) ripen LATER. This list mirrors the
// nut-frost-fix species table — all hardwood mast nuts plus
// frost-tinted late fruits.
const FROST_DRIVEN_RIPE = new Set([
  'Fagus grandifolia',      // American beech
  // Diospyros virginiana REMOVED: iNat shows ripe peak ~Sep 27 in
  // zone 7a (N=909+); frost-driven was off by 30-60 days. Folk
  // "wait for frost" is a quality-control heuristic, not biology.
  // Vaccinium macrocarpon REMOVED: iNat shows cranberries ripe in
  // early September across zones; "after first frost" is flavor-
  // sweetening folklore, not actual ripening. Now heat-driven.
  // Chestnuts (drop -10 to -25 days before first frost; still frost-anchored)
  // Castanea pumila REMOVED — heat-driven, handled by chinkapin-fix.
  'Castanea dentata', 'Castanea mollissima', 'Castanea sativa', 'Castanea sp.',
  // Oaks (acorns drop at first frost)
  'Quercus alba', 'Quercus macrocarpa',
  // Hickories (husks split at first frost)
  'Carya ovata', 'Carya laciniosa', 'Carya illinoinensis',
  // Walnuts (husks blacken pre-frost; timing tracks frost arrival)
  'Juglans nigra', 'Juglans cinerea', 'Juglans regia'
  // Hazelnuts: heat-driven (drop Aug-Sep before frost). Handled by
  // species-complex-unify; not in this list. Castanea pumila also
  // heat-driven (chinkapin-fix); not in this list.
]);

function directionFor(scientificName, stage) {
  if (stage === 'ripe' && FROST_DRIVEN_RIPE.has(scientificName)) return +1;
  return DEFAULT_DIRECTION[stage] ?? 0;
}

// Fuzzy-language detection — same heuristic as the rederive script.
// Vague seasonal phrasing ("mid-to-late summer", "early fall") gets
// agent-interpreted as a hard DOY range, but it's really a pointer to
// a season ± uncertainty. The smoother shouldn't anchor on that
// false-precision range.
const FUZZY_LANGUAGE_RE = /\b(mid[\s-]+(?:to[\s-]+late\s+)?(?:spring|summer|fall|autumn|winter)|late\s+(?:spring|summer|fall|autumn|winter)|early\s+(?:spring|summer|fall|autumn|winter)|around\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)|in\s+(?:spring|summer|fall|autumn|winter))\b/i;
const PRECISE_DATE_RE = /\b(?:\d{1,2}\/\d{1,2}|january\s+\d{1,2}|february\s+\d{1,2}|march\s+\d{1,2}|april\s+\d{1,2}|may\s+\d{1,2}|june\s+\d{1,2}|july\s+\d{1,2}|august\s+\d{1,2}|september\s+\d{1,2}|october\s+\d{1,2}|november\s+\d{1,2}|december\s+\d{1,2}|DOY\s*\d+|first\s+frost|after\s+(?:first|hard)\s+frost)\b/i;

// Three-tier precision detection (mirrors rederive). Intermediate
// month-level language ("late July through early August", "JUL-AUG")
// is NOT fuzzy — it's reasonably precise. Only vague seasonal
// language ("late summer", "early fall") triggers fuzzy.
const INTERMEDIATE_LANGUAGE_RE = /\b((?:early|mid|late)\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)|(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(?:[-\s]+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC))?|in\s+(?:january|february|march|april|may|june|july|august|september|october|november|december))\b/i;

function isFuzzyEvidence(ev) {
  if (!ev?.summary) return false;
  // iNat sources are real empirical observations — their p15-p85
  // span reflects biological variance, not source vagueness. Never
  // classify iNat as fuzzy.
  if ((ev.source || '').toLowerCase().startsWith('inaturalist')) return false;
  // Strip agent metadata before testing.
  const s = ev.summary
    .replace(/\(interpreted:[^)]*\)/gi, '')
    .replace(/\[zone-shift[^\]]*\]/gi, '');
  if (PRECISE_DATE_RE.test(s)) return false;
  // Intermediate language counts as non-fuzzy for anchor purposes.
  if (INTERMEDIATE_LANGUAGE_RE.test(s)) return false;
  if (FUZZY_LANGUAGE_RE.test(s)) return true;
  // Fall back to span only when no language signal at all.
  const sd = ev.supports?.start_doy, ed = ev.supports?.end_doy;
  if (sd != null && ed != null && (ed - sd) > 60) return true;
  return false;
}

function provenanceFor(source, summary) {
  const src = (source || '').toLowerCase();
  if (src.startsWith('inaturalist')) return 'empirical_inat';
  const s = summary || '';
  if (/\[zone-shift/i.test(s)) return 'shifted';
  if (/\b(zones?\s*[0-9]+[ab]?|VT|ME|NH|MA|NY|PA|MN|WI|MI|OH|IL|CA|FL|TX|GA|NC|SC|VA|MD|WA|OR|CO|UT|AZ|NM|Vermont|Maine|Minnesota|Wisconsin|California|Florida|northern New England|Upper Midwest|southeastern|Pacific Northwest|Mid-Atlantic|Philadelphia|Toronto|Ottawa|Seattle|Boston|Chicago|Portland|metro)\b/i.test(s)) return 'regional';
  return 'generic';
}

/** Is this row "anchor" quality? Anchors are zones where the dominant
 *  supporting evidence is a real regional observation or iNat empirical
 *  binning. SOFT rows have only generic / shifted-only evidence (or none
 *  with supports) — those get pulled toward the anchor curve. */
function isAnchor(evidence) {
  if (!Array.isArray(evidence)) return false;
  const supporting = evidence.filter(
    e => e?.supports?.start_doy != null && e?.supports?.end_doy != null
  );
  if (supporting.length === 0) return false;
  return supporting.some(e => {
    const p = provenanceFor(e?.source, e?.summary);
    // Fuzzy-language sources don't anchor — their bounds are agent
    // interpretations of vague phrasing, not precise observations.
    // They stay as evidence but the smoother should pull around them.
    if (isFuzzyEvidence(e)) return false;
    if (p === 'regional') return true;
    if (p === 'empirical_inat' && (e?.supports?.n_obs ?? 0) >= MIN_INAT_ANCHOR_OBS) return true;
    return false;
  });
}

/** Linear interpolation between two points (a, b) in zone-numeric space at
 *  query point q. Returns rounded integer DOY. */
function interp(qZone, aZone, aVal, bZone, bVal) {
  if (aZone === bZone) return aVal;
  const t = (qZone - aZone) / (bZone - aZone);
  return Math.round(aVal + t * (bVal - aVal));
}

/** Per-half-zone offset for extrapolation beyond the outermost anchor.
 *  ~7 days per half-zone code, same magnitude as migration #47's frost-date
 *  shifts. Sign matches direction. */
const PER_ZONE_DAYS = 7;

function extrapolate(qZone, anchorZone, anchorVal, direction) {
  // direction = -1: warmer zones earlier; +1: warmer zones later.
  // Formula: delta_DOY = direction * step * delta_zone. So a colder
  // zone (delta_zone < 0) of a heat-driven species (direction=-1)
  // gets +step days, i.e. later peak.
  return Math.round(anchorVal + direction * PER_ZONE_DAYS * (qZone - anchorZone));
}

function smoothCurve(rows, direction) {
  // rows: [{ zoneNum, zone_code, start_doy, end_doy, peak_doy, isAnchor, evidence }] sorted by zoneNum
  const anchors = rows.filter(r => r.isAnchor);
  if (anchors.length === 0) return null; // can't smooth without any anchor
  const out = rows.map(r => ({ ...r }));

  for (const r of out) {
    if (r.isAnchor) continue; // anchor values stay
    const before = anchors.filter(a => a.zoneNum < r.zoneNum).slice(-1)[0];
    const after  = anchors.filter(a => a.zoneNum > r.zoneNum)[0];
    let newStart, newEnd, newPeak;
    if (before && after) {
      newStart = interp(r.zoneNum, before.zoneNum, before.start_doy, after.zoneNum, after.start_doy);
      newEnd   = interp(r.zoneNum, before.zoneNum, before.end_doy,   after.zoneNum, after.end_doy);
      const beforePeak = before.peak_doy ?? Math.round((before.start_doy + before.end_doy) / 2);
      const afterPeak  = after.peak_doy  ?? Math.round((after.start_doy  + after.end_doy)  / 2);
      newPeak  = interp(r.zoneNum, before.zoneNum, beforePeak, after.zoneNum, afterPeak);
    } else if (before) {
      newStart = extrapolate(r.zoneNum, before.zoneNum, before.start_doy, direction);
      newEnd   = extrapolate(r.zoneNum, before.zoneNum, before.end_doy,   direction);
      const bp = before.peak_doy ?? Math.round((before.start_doy + before.end_doy) / 2);
      newPeak  = extrapolate(r.zoneNum, before.zoneNum, bp, direction);
    } else if (after) {
      newStart = extrapolate(r.zoneNum, after.zoneNum, after.start_doy, direction);
      newEnd   = extrapolate(r.zoneNum, after.zoneNum, after.end_doy,   direction);
      const ap = after.peak_doy ?? Math.round((after.start_doy + after.end_doy) / 2);
      newPeak  = extrapolate(r.zoneNum, after.zoneNum, ap, direction);
    } else {
      continue;
    }
    // Clamp to valid DOY range.
    newStart = Math.max(1, Math.min(366, newStart));
    newEnd   = Math.max(1, Math.min(366, newEnd));
    newPeak  = Math.max(1, Math.min(366, newPeak));

    // When the soft zone has its OWN evidence with supports, just
    // use that evidence's envelope directly — don't extrapolate at
    // all. Extrapolation only applies to zones with truly NO data.
    // This avoids making the synthesized window earlier than any
    // observation (Aug-blackberry showing Jul end is just wrong if
    // iNat says fruiting through Aug).
    if (Array.isArray(r.evidence)) {
      const supps = r.evidence
        .filter((e) => e?.supports?.start_doy != null && e?.supports?.end_doy != null)
        .map((e) => e.supports);
      if (supps.length > 0) {
        newStart = Math.min(...supps.map((s) => s.start_doy));
        newEnd   = Math.max(...supps.map((s) => s.end_doy));
        const peaks = supps.map((s) => s.peak_doy).filter(p => p != null);
        newPeak = peaks.length > 0
          ? Math.round(peaks.reduce((a,b) => a+b, 0) / peaks.length)
          : Math.round((newStart + newEnd) / 2);
      }
    }
    r.newStart = newStart;
    r.newEnd = newEnd;
    r.newPeak = newPeak;
  }
  return out;
}

function detectAnchorViolations(rows, direction) {
  const anchors = rows.filter(r => r.isAnchor);
  const violations = [];
  for (let i = 1; i < anchors.length; i++) {
    const prev = anchors[i - 1];
    const cur  = anchors[i];
    // Check monotonicity on all three: start, end, and peak (when
    // both rows have a peak set). For direction=-1 (heat-driven):
    // values should DECREASE as zone warms. direction=+1 (frost):
    // values should INCREASE.
    const startDelta = cur.start_doy - prev.start_doy;
    const endDelta   = cur.end_doy   - prev.end_doy;
    const peakDelta  = (cur.peak_doy != null && prev.peak_doy != null)
      ? cur.peak_doy - prev.peak_doy : null;
    const expectedSign = direction;
    const TOL = 3; // 3-day tolerance — small drift OK
    const startOk = (startDelta * expectedSign) >= -TOL;
    const endOk   = (endDelta   * expectedSign) >= -TOL;
    const peakOk  = peakDelta == null || (peakDelta * expectedSign) >= -TOL;
    if (!startOk || !endOk || !peakOk) {
      violations.push({
        from: prev.zone_code, to: cur.zone_code,
        prev_doy: `${prev.start_doy}-${prev.end_doy}` + (prev.peak_doy != null ? ` peak ${prev.peak_doy}` : ''),
        cur_doy:  `${cur.start_doy}-${cur.end_doy}` + (cur.peak_doy != null ? ` peak ${cur.peak_doy}` : ''),
        startDelta, endDelta, peakDelta
      });
    }
  }
  return violations;
}

(async () => {
  // Pull all rows joined with species + zone, then group in JS.
  const rows = await sql`
    select w.id, w.species_id, w.stage, cz.code as zone_code,
           w.start_doy, w.end_doy, w.peak_doy,
           coalesce(w.evidence, '[]'::jsonb) as evidence,
           s.scientific_name, s.common_name
      from species_fruiting_windows w
      join species s on s.id = w.species_id
      join climate_zones cz on cz.id = w.climate_zone_id
     where s.is_forageable = true
     order by s.scientific_name, w.stage, cz.code`;

  const groups = new Map(); // key = "species_id::stage" -> rows[]
  for (const r of rows) {
    const k = `${r.species_id}::${r.stage}`;
    let arr = groups.get(k);
    if (!arr) { arr = []; groups.set(k, arr); }
    arr.push(r);
  }

  let updated = 0;
  let skippedDirZero = 0;
  let skippedNoAnchor = 0;
  let skippedTooFew = 0;
  const violations = [];
  const changes = [];

  // Species where iNat captures the wrong stage relative to the
  // foraging window — smoothing should leave these alone because
  // averaging in iNat data would pull synthesis toward the wrong
  // cluster. The species-complex-unify framework writes the correct
  // foraging-stage anchor; smoothing must respect it.
  // (Diospyros virginiana / Vaccinium macrocarpon REMOVED from this
  // list — iNat is reliable for both, just biased to color-change
  // not harvest-peak.)
  const NUT_FROST_FIX_SPECIES = new Set([
    'Fagus grandifolia',
    'Castanea dentata', 'Castanea mollissima', 'Castanea sativa', 'Castanea sp.',
    'Quercus alba', 'Quercus macrocarpa',
    'Carya ovata', 'Carya laciniosa', 'Carya illinoinensis',
    'Juglans nigra', 'Juglans cinerea', 'Juglans regia',
    'Corylus americana', 'Corylus cornuta',
    // Ash samaras: iNat captures persistent visible samaras (Aug-Oct)
    // not the brief edible spring window (Apr-May).
    'Fraxinus americana', 'Fraxinus pennsylvanica', 'Fraxinus nigra'
  ]);

  for (const [key, grp] of groups) {
    const sample = grp[0];
    if (NUT_FROST_FIX_SPECIES.has(sample.scientific_name)) {
      skippedDirZero++;  // count under skipped-no-signal for reporting brevity
      continue;
    }
    const direction = directionFor(sample.scientific_name, sample.stage);
    if (direction === 0) { skippedDirZero++; continue; }
    if (grp.length < 3)   { skippedTooFew++;  continue; }

    // Decorate with zoneNum + anchor flag, sort by zoneNum.
    const decorated = grp
      .filter(r => ZONE_NUM[r.zone_code] != null)
      .map(r => ({
        ...r,
        zoneNum: ZONE_NUM[r.zone_code],
        isAnchor: isAnchor(r.evidence)
      }))
      .sort((a, b) => a.zoneNum - b.zoneNum);

    const anchorCount = decorated.filter(r => r.isAnchor).length;
    if (anchorCount === 0) { skippedNoAnchor++; continue; }

    const vios = detectAnchorViolations(decorated, direction);
    if (vios.length > 0) {
      violations.push({ scientific: sample.scientific_name, common: sample.common_name, stage: sample.stage, direction, vios });
    }

    const smoothed = smoothCurve(decorated, direction);
    if (!smoothed) continue;

    for (const r of smoothed) {
      if (r.isAnchor) continue;
      if (r.newStart == null) continue;
      if (r.newStart === r.start_doy && r.newEnd === r.end_doy && r.newPeak === r.peak_doy) continue;
      changes.push({
        common: r.common_name, sci: r.scientific_name, stage: r.stage,
        zone: r.zone_code,
        old: `${r.start_doy}-${r.end_doy} peak ${r.peak_doy ?? '—'}`,
        nu:  `${r.newStart}-${r.newEnd} peak ${r.newPeak}`
      });
      if (!dryRun) {
        await sql`
          update species_fruiting_windows
             set start_doy = ${r.newStart},
                 end_doy   = ${r.newEnd},
                 peak_doy  = ${r.newPeak},
                 updated_at = now()
           where id = ${r.id}`;
      }
      updated++;
    }
  }

  console.log('\n=== Smoothing summary ===');
  console.log(`Total (species,stage) groups: ${groups.size}`);
  console.log(`  skipped (no zone signal):    ${skippedDirZero}`);
  console.log(`  skipped (<3 rows):           ${skippedTooFew}`);
  console.log(`  skipped (no anchor zones):   ${skippedNoAnchor}`);
  console.log(`Rows ${dryRun ? 'WOULD update' : 'updated'}:  ${updated}`);

  console.log('\n=== Anchor monotonicity violations (review needed) ===');
  console.log(`Total combos with violations: ${violations.length}`);
  for (const v of violations.slice(0, 20)) {
    console.log(`\n  ${v.common} (${v.scientific}) stage=${v.stage} dir=${v.direction === -1 ? 'heat→earlier' : 'frost→later'}`);
    for (const x of v.vios) {
      const peakStr = x.peakDelta != null ? `, Δpeak=${x.peakDelta}` : '';
      console.log(`    ${x.from} → ${x.to}: ${x.prev_doy} → ${x.cur_doy}  (Δstart=${x.startDelta}, Δend=${x.endDelta}${peakStr})`);
    }
  }
  if (violations.length > 20) console.log(`\n  +${violations.length - 20} more violations (truncated)`);

  console.log('\n=== Sample smoothing changes (first 30) ===');
  for (const c of changes.slice(0, 30)) {
    console.log(`  ${c.common} ${c.zone} ${c.stage}: ${c.old} → ${c.nu}`);
  }
  if (changes.length > 30) console.log(`  +${changes.length - 30} more changes`);

  if (!dryRun && updated > 0) {
    console.log('\nRefreshing zone-presence materialized view…');
    await sql`select public.refresh_species_zone_presence()`;
  }
  await sql.end();
})();
