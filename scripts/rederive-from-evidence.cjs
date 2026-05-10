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

function provenanceFor(source, summary) {
  const src = (source || '').toLowerCase();
  if (src.startsWith('inaturalist')) return 'empirical_inat';
  const s = summary || '';
  if (/\[zone-shift|\(interpreted:/i.test(s)) return 'shifted';
  if (/\b(zone\s*[0-9]+[ab]?|VT|ME|NH|MA|NY|PA|MN|WI|MI|OH|IL|CA|FL|TX|GA|NC|SC|VA|MD|WA|OR|CO|UT|AZ|NM|Vermont|Maine|Minnesota|Wisconsin|California|Florida|northern New England|Upper Midwest|southeastern|Pacific Northwest|Mid-Atlantic)\b/.test(s)) return 'regional';
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
    const ev = Array.isArray(r.evidence) ? r.evidence : [];
    const supporting = ev
      .map(e => ({ ...e, _provenance: provenanceFor(e?.source, e?.summary) }))
      .filter(e => e?.supports?.start_doy != null && e?.supports?.end_doy != null);

    if (supporting.length === 0) { skippedNoSupports++; continue; }

    const regional = supporting.filter(e => e._provenance === 'regional');
    const inat     = supporting.filter(e => e._provenance === 'empirical_inat');
    const generic  = supporting.filter(e => e._provenance === 'generic');
    const shifted  = supporting.filter(e => e._provenance === 'shifted');

    let pool;
    let poolKind;
    if (regional.length > 0) {
      pool = regional;
      poolKind = 'regional';
    } else if (inat.length > 0) {
      // Sanity guards on iNat-only re-derives. iNat zone-binning lumps
      // cross-country observations into one USDA zone (e.g. zone 7b
      // spans CA, OR, NC, GA — wildly different fruit timing). And
      // iNat 'Fruiting' annotations don't differentiate green vs ripe
      // fruit, so percentile ranges over-stretch the harvest window.
      const inatStart = Math.min(...inat.map(e => e.supports.start_doy));
      const inatEnd   = Math.max(...inat.map(e => e.supports.end_doy));
      const span      = inatEnd - inatStart;
      // Skip if the iNat range spans >150 days (multi-region noise).
      if (span > 150) {
        skippedNoRealObs++;
        continue;
      }
      // If a curated peak already exists, don't let iNat shift it by
      // more than 30 days — iNat alone shouldn't catastrophically
      // relocate a window that was previously synthesized from other
      // sources. When peak_doy is null, this gate doesn't apply (truly
      // fresh row, iNat fills it in).
      if (r.peak_doy != null) {
        const newMid = Math.round((inatStart + inatEnd) / 2);
        if (Math.abs(newMid - r.peak_doy) > 30) {
          skippedNoRealObs++;
          continue;
        }
      }
      pool = inat;
      poolKind = 'inat';
    } else if (generic.length > 0) {
      pool = generic;
      poolKind = 'generic';
    } else {
      // Only shifted estimates available — never let them drive the synthesized DOY.
      skippedNoRealObs++;
      continue;
    }

    const newStart = Math.min(...pool.map(e => e.supports.start_doy));
    const newEnd   = Math.max(...pool.map(e => e.supports.end_doy));
    const peaks    = pool.map(e => e.supports.peak_doy).filter(p => p != null);
    const newPeak  = peaks.length > 0 ? median(peaks) : Math.round((newStart + newEnd) / 2);

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
    const change = `${r.common_name} ${r.zone_code} ${r.stage}: ${r.start_doy}-${r.end_doy} → ${newStart}-${newEnd} (peak ${r.peak_doy ?? '—'} → ${newPeak}, pool=${poolKind} N=${pool.length}${droppedStr})`;

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
