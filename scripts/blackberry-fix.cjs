// Allegheny blackberry — re-derive cold-zone synthesized DOY from
// real-observation evidence only (excluding the agent-shifted Wikipedia
// estimate). The Wikipedia entries are kept on the rows but their
// supports.start_doy/end_doy were ad-hoc shifts (e.g., +28d from base
// 6a -> 4a), not values Wikipedia itself claims. Per the user's
// feedback memory: shifted estimates fill gaps; they don't compete
// with real observations.
//
// Real-observation sources for cold zones:
//   Forager Chef, Minnesota Wildflowers, Practical Self Reliance, iNat
// Generic / non-real: Wikipedia, Curious By Nature.
//
// Per zone, we recompute start_doy/end_doy as the envelope of
// real-observation supports, ignoring shifted estimates. We also
// fix the review_notes to drop the misattributed "DID reflect
// microclimate variance" claim.
//
// Idempotent.

'use strict';

const fs = require('node:fs');
const env = fs.readFileSync('/Users/jk/Dropbox/Claude/forager/.env.local', 'utf8');
const SUPABASE_DB_URL = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim();
const sql = require('/Users/jk/Dropbox/Claude/forager/node_modules/postgres')(
  SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined }
);

function isShiftedEstimate(ev) {
  const s = ev?.summary ?? '';
  return /\[zone-shift|\(interpreted:/i.test(s);
}

function isInat(ev) {
  return (ev?.source ?? '').toLowerCase().startsWith('inaturalist');
}

(async () => {
  const sp = await sql`
    select id, scientific_name, review_notes
      from species where scientific_name = 'Rubus allegheniensis'`;
  const species = sp[0];

  const wins = await sql`
    select w.id, cz.code, w.start_doy, w.end_doy, w.peak_doy,
           coalesce(w.evidence, '[]'::jsonb) as evidence
      from species_fruiting_windows w
      join climate_zones cz on cz.id = w.climate_zone_id
     where w.species_id = ${species.id}
       and cz.code in ('4a','4b','5a','5b')
     order by cz.code`;

  console.log('Recomputing real-observation envelopes:');
  let updated = 0;
  for (const w of wins) {
    const ev = Array.isArray(w.evidence) ? w.evidence : [];
    // Real-observation supports: regional sources with non-shifted
    // supports, plus iNat (also a real regional observation source).
    const realObs = ev.filter(e => {
      if (!e?.supports?.start_doy || !e?.supports?.end_doy) return false;
      if (isShiftedEstimate(e)) return false;
      return true;
    });

    if (realObs.length === 0) {
      console.log(`  ${w.code}  no real observations, skipping`);
      continue;
    }

    const newStart = Math.min(...realObs.map(e => e.supports.start_doy));
    const newEnd   = Math.max(...realObs.map(e => e.supports.end_doy));
    const newPeak  = Math.round((newStart + newEnd) / 2);

    const sourcesUsed = realObs.map(e => e.source).join(', ');
    const wasShifted = ev.some(isShiftedEstimate);

    if (w.start_doy === newStart && w.end_doy === newEnd && w.peak_doy === newPeak) {
      console.log(`  ${w.code}  already at envelope ${newStart}-${newEnd} peak ${newPeak} — skip`);
      continue;
    }

    await sql`
      update species_fruiting_windows
         set start_doy = ${newStart},
             end_doy = ${newEnd},
             peak_doy = ${newPeak},
             updated_at = now()
       where id = ${w.id}`;
    console.log(`  ${w.code}  ${w.start_doy}-${w.end_doy} -> ${newStart}-${newEnd} peak ${newPeak}` +
                `  (real obs: ${sourcesUsed}` +
                (wasShifted ? '; shifted-Wikipedia preserved as evidence but excluded from envelope' : '') + ')');
    updated++;
  }

  // Fix the review notes line — replace the misattributed claim.
  const oldLine = '[2026-05-09 revert] Per user feedback, DB rows widened to envelope all sources (Wikipedia + Minnesota Wildflowers + others) rather than override. Cold-zone spread reflects real microclimate variance.';
  const newLine = '[2026-05-09 revert] Initially widened DB rows to envelope all sources, including a shifted-Wikipedia estimate. User clarified: shifted estimates should fill gaps, not compete with real observations. Re-narrowed cold-zone (4a/4b/5a/5b) DOYs to the envelope of real regional observations (Forager Chef MN, Minnesota Wildflowers, Practical Self Reliance VT, iNat). Wikipedia citation preserved on the rows but its agent-shifted DOY is no longer used in the synthesized envelope.';

  if ((species.review_notes ?? '').includes(oldLine)) {
    const fixed = species.review_notes.replace(oldLine, newLine);
    await sql`update species set review_notes = ${fixed} where id = ${species.id}`;
    console.log('Review notes updated.');
  } else {
    console.log('Review notes did not contain the old line — skipping note rewrite.');
  }

  console.log(`Updated ${updated} window rows.`);
  await sql.end();
})();
