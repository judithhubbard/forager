// Re-derive synthesized window DOYs from each row's evidence array.
//
// The synthesized start_doy / end_doy / peak_doy on a species_fruiting_windows
// row is the canonical "this is what the app shows" value. It's set when the
// row is inserted, but doesn't auto-update when new evidence is appended —
// so over time the canonical bar drifts from the cited evidence ranges.
//
// This script walks every row, classifies each evidence entry's provenance
// (using the same heuristic as the calibration viewer), and re-derives the
// synthesized DOY range as the envelope of the strongest available pool:
//
//   PRIORITY (only the highest-priority pool is used; lower pools stay on
//   the row as evidence and still render in the viewer, but don't drive
//   the synthesized window):
//     1. Regional-observation sources (someone in the zone reporting
//        specific timing) — strongest signal.
//     2. iNat empirical (when no regional sources exist — empirical
//        Fruiting observations have first-fruit bias and capture green
//        / developing fruit, so they over-stretch the harvest window
//        when used in combination with tighter cited sources).
//     3. Generic sources (fallback when no regional or iNat exists).
//     4. Shifted estimates → NEVER drive the synthesized window.
//        Row left unchanged if this is the only available pool.
//
// Idempotent: rows whose computed envelope matches existing values are skipped.
//
// Usage:
//   node scripts/rederive-from-evidence.cjs --dry-run    # report what would change, no writes
//   node scripts/rederive-from-evidence.cjs              # apply

'use strict';

const fs = require('node:fs');
const env = fs.readFileSync('/Users/jk/Dropbox/Claude/forager/.env.local', 'utf8');
const SUPABASE_DB_URL = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim();
const sql = require('/Users/jk/Dropbox/Claude/forager/node_modules/postgres')(
  SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined }
);

const dryRun = process.argv.includes('--dry-run');

// iNat samples below this size aren't statistically reliable enough
// to anchor a zone's synthesized DOY. They stay as evidence (visible
// in the viewer's per-source range bar) but get treated as 'soft' so
// the smoother can interpolate from larger anchors. 30 is a balance
// between statistical reliability and not throwing out too many data
// points; below that, p15/p85 estimates are sensitive to a couple of
// outlier observations.
const MIN_INAT_ANCHOR_OBS = 30;

// Species where iNat 'Fruiting' captures the wrong stage for foraging.
// For hardwood mast nuts, observers tag developing burrs/hulls visible
// on the tree (summer) — but harvest is post-frost dropped nuts (fall).
// iNat values are weeks too early for these. Cited regional/silviculture
// sources are the only valid synthesis pool; iNat stays as evidence for
// spread visibility but is excluded from the envelope.
const INAT_WRONG_STAGE = new Set([
  // Beech
  'Fagus grandifolia',
  // Chestnuts
  'Castanea dentata', 'Castanea mollissima', 'Castanea sativa',
  'Castanea sp.', 'Castanea pumila',
  // Oaks
  'Quercus alba', 'Quercus macrocarpa',
  // Hickories
  'Carya ovata', 'Carya laciniosa', 'Carya illinoinensis',
  // Walnuts
  'Juglans nigra', 'Juglans cinerea', 'Juglans regia',
  // Hazelnuts
  'Corylus americana', 'Corylus cornuta',
  // Persimmon — frost-driven late-season fruit, fruit clings to tree
  // until frost; iNat captures developing fruit visible all summer
  'Diospyros virginiana',
  // Pawpaw — slow-ripening fruit; iNat captures developing fruit
  // weeks before harvest (visible May-Aug; ripens Aug-Sep)
  'Asimina triloba',
  // American cranberry — frost-tinted late fruit; tart through Sept,
  // peak harvest after first frost (Oct-Nov)
  'Vaccinium macrocarpon'
]);

/** Three-tier precision detection. Sources differ in how precisely
 *  they describe harvest timing:
 *    PRECISE — explicit dates ("Aug 15", "DOY 227", "Sep 14, 2024",
 *      "after first frost"). Use raw supports values; trust them.
 *    INTERMEDIATE — month-level reference ("early September",
 *      "mid-July", "JUL-AUG", "in October"). Months are pinned but
 *      day-precision is implied. Effective range: peak ± 12 days
 *      (~3 weeks total, the typical "first half of August" span).
 *    FUZZY — vague seasonal ("late summer", "early fall", "around
 *      September"). Effective range: peak ± 18 days (~5 weeks).
 *  The agent processing source quotes tends to interpret all three
 *  as full DOY ranges, manufacturing false precision. The tiered
 *  shrink keeps each evidence entry contributing roughly the spread
 *  it actually claims.
 *
 *  iNat is excluded from this — its supports are real observation
 *  percentiles (p15-p85), already empirically grounded.  */
const PRECISE_DATE_RE = /\b(?:\d{1,2}\/\d{1,2}|january\s+\d{1,2}|february\s+\d{1,2}|march\s+\d{1,2}|april\s+\d{1,2}|may\s+\d{1,2}|june\s+\d{1,2}|july\s+\d{1,2}|august\s+\d{1,2}|september\s+\d{1,2}|october\s+\d{1,2}|november\s+\d{1,2}|december\s+\d{1,2}|DOY\s*\d+|first\s+frost|after\s+(?:first|hard)\s+frost)\b/i;
const INTERMEDIATE_LANGUAGE_RE = /\b((?:early|mid|late)\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)|(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(?:[-\s]+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC))?|in\s+(?:january|february|march|april|may|june|july|august|september|october|november|december))\b/i;
const FUZZY_LANGUAGE_RE = /\b(mid[\s-]+(?:to[\s-]+late\s+)?(?:spring|summer|fall|autumn|winter)|late\s+(?:spring|summer|fall|autumn|winter)|early\s+(?:spring|summer|fall|autumn|winter)|around\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)|in\s+(?:spring|summer|fall|autumn|winter))\b/i;
const INTERMEDIATE_HALF_WINDOW = 9;  // peak ± 9d for intermediate (month-level claims like "JUL-AUG")
const FUZZY_HALF_WINDOW = 18;        // peak ± 18d for fuzzy (seasonal language like "late summer")

function precisionTier(ev) {
  if (!ev?.summary) return 'precise';
  // Strip agent metadata before precision detection — the
  // `(interpreted: ... DOY 207-258 ...)` parenthetical and the
  // `[zone-shift +/-Nd]` tag are the agent's added context, not
  // the source's actual quoted claim. A vague "late summer" quote
  // shouldn't get classified precise just because the agent wrote
  // "(interpreted: DOY 207-258)" alongside it.
  const s = ev.summary
    .replace(/\(interpreted:[^)]*\)/gi, '')
    .replace(/\[zone-shift[^\]]*\]/gi, '');
  // Precise dates or phenological events override everything.
  if (PRECISE_DATE_RE.test(s)) return 'precise';
  // Fuzzy seasonal language is the loosest tier.
  if (FUZZY_LANGUAGE_RE.test(s)) return 'fuzzy';
  // Month-level references (no day) are intermediate.
  if (INTERMEDIATE_LANGUAGE_RE.test(s)) return 'intermediate';
  // Fall back to span heuristic when language doesn't tell us.
  const sd = ev.supports?.start_doy, ed = ev.supports?.end_doy;
  if (sd != null && ed != null) {
    const span = ed - sd;
    if (span > 60) return 'fuzzy';
    if (span > 30) return 'intermediate';
  }
  return 'precise';
}

// Backwards-compat shim used by detectAnchorViolations / smoothing.
function isFuzzyEvidence(ev) {
  return precisionTier(ev) !== 'precise';
}

function effectiveSupports(ev, isInat) {
  const s = ev.supports?.start_doy, e = ev.supports?.end_doy;
  if (s == null || e == null) return null;
  if (isInat) return { start: s, end: e, peak: ev.supports.peak_doy };
  const tier = precisionTier(ev);
  if (tier === 'precise') return { start: s, end: e, peak: ev.supports.peak_doy };
  const halfWindow = tier === 'intermediate' ? INTERMEDIATE_HALF_WINDOW : FUZZY_HALF_WINDOW;
  const mid = ev.supports.peak_doy ?? Math.round((s + e) / 2);
  return { start: mid - halfWindow, end: mid + halfWindow, peak: mid, fuzzy: true, tier };
}

function provenanceFor(source, summary, rowZoneCode) {
  const src = (source || '').toLowerCase();
  if (src.startsWith('inaturalist')) return 'empirical_inat';
  const s = summary || '';
  const beforeShiftTag = s.split(/\[zone-shift/i)[0];
  const hasShiftTag = /\[zone-shift/i.test(s);
  // Strongest signal: the row's zone is explicitly named in the
  // source quote. Eat The Weeds writing "Florida, zone 9a" is
  // regional ONLY for the 9a row — the same source attached to a
  // 7a row (via agent shifting) shouldn't claim regional status.
  if (rowZoneCode) {
    const rowZoneRegex = new RegExp(`\\bzones?\\s*${rowZoneCode.replace(/[ab]/, m => `[${m}]`)}\\b`, 'i');
    if (rowZoneRegex.test(beforeShiftTag)) return 'regional';
    // Source mentions a SPECIFIC zone different from the row's zone
    // → treat as shifted (this entry is on this row only because of
    // agent shifting, not because the source is about this zone).
    const otherZoneMatch = beforeShiftTag.match(/\bzones?\s*([0-9]+[ab]?)\b/i);
    if (otherZoneMatch && otherZoneMatch[1].toLowerCase() !== rowZoneCode.toLowerCase()) {
      return hasShiftTag ? 'shifted' : 'generic';
    }
  }
  // Fallback: state/region names without explicit zone reference.
  // Less precise but still meaningful (NC State Extension implies
  // NC's zones; can't pin to one zone without a state→zones map).
  if (/\b(VT|ME|NH|MA|NY|PA|MN|WI|MI|OH|IL|CA|FL|TX|GA|NC|SC|VA|MD|WA|OR|CO|UT|AZ|NM|Vermont|Maine|Minnesota|Wisconsin|California|Florida|northern New England|Upper Midwest|southeastern|Pacific Northwest|Mid-Atlantic|Philadelphia|Toronto|Ottawa|Seattle|Boston|Chicago|Portland|metro)\b/i.test(beforeShiftTag)) return 'regional';
  if (hasShiftTag) return 'shifted';
  if (/\b(zones?\s*[0-9]+[ab]?|VT|ME|NH|MA|NY|PA|MN|WI|MI|OH|IL|CA|FL|TX|GA|NC|SC|VA|MD|WA|OR|CO|UT|AZ|NM|Vermont|Maine|Minnesota|Wisconsin|California|Florida|northern New England|Upper Midwest|southeastern|Pacific Northwest|Mid-Atlantic|Philadelphia|Toronto|Ottawa|Seattle|Boston|Chicago|Portland|metro)\b/i.test(s)) return 'regional';
  return 'generic';
}

function median(nums) {
  const s = nums.slice().sort((a, b) => a - b);
  if (s.length === 0) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

(async () => {
  const rows = await sql`
    select w.id,
           w.species_id,
           s.scientific_name,
           s.common_name,
           cz.code as zone_code,
           w.stage,
           w.start_doy,
           w.end_doy,
           w.peak_doy,
           w.confidence,
           coalesce(w.evidence, '[]'::jsonb) as evidence
      from species_fruiting_windows w
      join species s on s.id = w.species_id
      join climate_zones cz on cz.id = w.climate_zone_id
     where s.is_forageable = true
     order by s.common_name, cz.code, w.stage`;

  let touched = 0;
  let unchanged = 0;
  let skippedNoRealObs = 0;
  let skippedNoSupports = 0;
  const widened = [];
  const narrowed = [];

  for (const r of rows) {
    const isNutSpecies = INAT_WRONG_STAGE.has(r.scientific_name);

    const ev = Array.isArray(r.evidence) ? r.evidence : [];
    // Pass row's zone to provenanceFor so explicit-zone-match wins
    // over agent-shifted entries. e.g., Eat The Weeds (Florida, 9a)
    // is regional ONLY on 9a; on 7a (where the agent shifted it)
    // it's classified as shifted.
    const supporting = ev
      .map(e => ({ ...e, _provenance: provenanceFor(e?.source, e?.summary, r.zone_code) }))
      .filter(e => e?.supports?.start_doy != null && e?.supports?.end_doy != null);

    if (supporting.length === 0) { skippedNoSupports++; continue; }

    // For nut species (frost-driven by nut-frost-fix), rederive only
    // overrides when there's explicit-zone-match regional evidence.
    // Without strong evidence, preserve nut-frost-fix's value.
    if (isNutSpecies) {
      const strongRegional = supporting.filter((e) => e._provenance === 'regional');
      if (strongRegional.length === 0) {
        skippedNoSupports++;
        continue;
      }
    }

    const regional = supporting.filter(e => e._provenance === 'regional');
    // Split iNat by sample size: anchor-quality (>=30 obs) vs thin (drops to 'soft' / generic).
    const inat     = supporting.filter(
      (e) => e._provenance === 'empirical_inat' &&
             (e?.supports?.n_obs ?? 0) >= MIN_INAT_ANCHOR_OBS
    );
    const inatThin = supporting.filter(
      (e) => e._provenance === 'empirical_inat' &&
             (e?.supports?.n_obs ?? 0) < MIN_INAT_ANCHOR_OBS
    );
    const generic  = supporting.filter(e => e._provenance === 'generic');
    const shifted  = supporting.filter(e => e._provenance === 'shifted');

    let pool;
    let poolKind;
    const wrongStage = INAT_WRONG_STAGE.has(r.scientific_name);
    if (regional.length > 0 && inat.length > 0 && !wrongStage) {
      // Both real-observation sources present — envelope them together
      // so the synthesized window captures the union of "ripe per
      // forager" and "visible-on-plant per iNat", which gives a
      // smoother across-zone curve (avoids step jumps when one zone
      // has only regional and the next has only iNat).
      pool = [...regional, ...inat];
      poolKind = 'regional+inat';
    } else if (regional.length > 0) {
      pool = regional;
      poolKind = wrongStage && inat.length > 0
        ? 'regional (iNat excluded — wrong-stage species)'
        : 'regional';
    } else if (inat.length > 0 && !wrongStage) {
      // Sanity guards on iNat-only re-derives. iNat zone-binning lumps
      // cross-country observations into one USDA zone (e.g. zone 7b
      // spans CA, OR, NC, GA — wildly different fruit timing).
      const inatStart = Math.min(...inat.map(e => e.supports.start_doy));
      const inatEnd   = Math.max(...inat.map(e => e.supports.end_doy));
      const span      = inatEnd - inatStart;
      if (span > 150) {
        skippedNoRealObs++;
        continue;
      }
      if (r.peak_doy != null) {
        const newMid = Math.round((inatStart + inatEnd) / 2);
        if (Math.abs(newMid - r.peak_doy) > 30) {
          skippedNoRealObs++;
          continue;
        }
      }
      pool = inat;
      poolKind = 'inat';
    } else if (generic.length > 0 || inatThin.length > 0) {
      pool = [...generic, ...inatThin];
      poolKind = inatThin.length > 0 && generic.length === 0 ? 'inat-thin' : 'generic';
    } else {
      // Only shifted estimates available — never let them drive the synthesized DOY.
      skippedNoRealObs++;
      continue;
    }

    // Apply fuzzy-language correction: vague seasonal sources contribute
    // midpoint ± 15 days, not their full agent-derived range, so phrases
    // like "mid-to-late summer" don't manufacture false precision in the
    // envelope.
    const effective = pool.map((e) => effectiveSupports(e, e._provenance === 'empirical_inat')).filter(x => x != null);
    if (effective.length === 0) { skippedNoSupports++; continue; }
    const newStart = Math.min(...effective.map(e => e.start));
    const newEnd   = Math.max(...effective.map(e => e.end));
    const peaks    = effective.map(e => e.peak).filter(p => p != null);
    const newPeak  = peaks.length > 0 ? median(peaks) : Math.round((newStart + newEnd) / 2);
    const fuzzyCount = effective.filter(e => e.fuzzy).length;

    if (newStart === r.start_doy && newEnd === r.end_doy && newPeak === r.peak_doy) {
      unchanged++;
      continue;
    }

    const oldSpan = r.end_doy - r.start_doy;
    const newSpan = newEnd - newStart;
    const delta = newSpan - oldSpan;
    const droppedNote = [];
    if (shifted.length) droppedNote.push(`${shifted.length} shifted`);
    if (poolKind === 'regional' && inat.length) droppedNote.push(`${inat.length} iNat (kept as evidence, not used in envelope)`);
    if ((poolKind === 'regional' || poolKind === 'inat') && generic.length) droppedNote.push(`${generic.length} generic`);
    const droppedStr = droppedNote.length ? ', dropped ' + droppedNote.join(' + ') : '';
    const change = `${r.common_name} ${r.zone_code} ${r.stage}: ${r.start_doy}-${r.end_doy} → ${newStart}-${newEnd} (peak ${r.peak_doy ?? '—'} → ${newPeak}, pool=${poolKind} N=${pool.length}${fuzzyCount > 0 ? `, ${fuzzyCount} fuzzy` : ''}${droppedStr})`;

    if (delta < 0) narrowed.push(change);
    else widened.push(change);

    if (!dryRun) {
      await sql`
        update species_fruiting_windows
           set start_doy = ${newStart},
               end_doy = ${newEnd},
               peak_doy = ${newPeak},
               updated_at = now()
         where id = ${r.id}`;
    }
    touched++;
  }

  console.log('\n=== Re-derive summary ===');
  console.log(`Total rows scanned:    ${rows.length}`);
  console.log(`Already at envelope:   ${unchanged}`);
  console.log(`No supports in evid:   ${skippedNoSupports}`);
  console.log(`Only shifted (kept):   ${skippedNoRealObs}`);
  console.log(`Updated:               ${touched}${dryRun ? ' (DRY RUN — not applied)' : ''}`);
  console.log(`  narrowed:            ${narrowed.length}`);
  console.log(`  widened:             ${widened.length}`);

  console.log('\n--- First 30 narrowed ---');
  for (const c of narrowed.slice(0, 30)) console.log('  ' + c);
  console.log('\n--- First 30 widened ---');
  for (const c of widened.slice(0, 30)) console.log('  ' + c);

  if (!dryRun && touched > 0) {
    console.log('\nRefreshing zone-presence materialized view…');
    await sql`select public.refresh_species_zone_presence()`;
  }
  await sql.end();
})();
