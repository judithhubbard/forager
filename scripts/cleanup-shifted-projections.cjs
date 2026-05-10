// Cleanup: remove evidence entries that are pure agent-shifted
// projections from a base-zone source.
//
// The chestnut-crawl / blog-evidence-crawl agents created entries
// like "Wikipedia" or "USDA NRCS Plant Guide" duplicated across
// every zone for a species, with [zone-shift +/-Nd from base X -> Y]
// markers. Each non-base entry is the agent's per-zone projection
// of the source's central claim. The source itself (Wikipedia,
// USDA NRCS) is generic — it doesn't claim per-zone specifics.
//
// This cleanup keeps the BASE entry (no shift tag, the source's
// original interpretation) and removes the shifted projections.
// Each generic source ends up with ONE entry per species (on its
// base zone), instead of 8-11 redundant projections clogging the
// per-source range bars in the calibration viewer.
//
// Idempotent.

'use strict';

const fs = require('node:fs');
const env = fs.readFileSync('/Users/jk/Dropbox/Claude/forager/.env.local', 'utf8');
const SUPABASE_DB_URL = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim();
const sql = require('/Users/jk/Dropbox/Claude/forager/node_modules/postgres')(
  SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined }
);

/** Parse the [zone-shift +/-Nd from base X -> Y] marker. Returns
 *  { base: 'X', target: 'Y', shift: Nd } or null if no marker. */
function parseShiftTag(summary) {
  if (!summary) return null;
  const m = summary.match(/\[zone-shift\s+([+-]?\d+)d\s+from\s+base\s+([0-9]+[ab]?)\s*->\s*([0-9]+[ab]?)\s*\]/i);
  if (!m) return null;
  return { shift: parseInt(m[1], 10), base: m[2].toLowerCase(), target: m[3].toLowerCase() };
}

(async () => {
  // For each row, identify shifted-projection entries and remove them.
  // A shifted-projection entry is one with a [zone-shift] tag where
  // the row's zone matches the tag's `target` AND target != base.
  const rows = await sql`
    select w.id, cz.code as zone_code, coalesce(w.evidence, '[]'::jsonb) as evidence
      from species_fruiting_windows w
      join species s on s.id = w.species_id
      join climate_zones cz on cz.id = w.climate_zone_id
     where s.is_forageable = true`;

  let totalRemoved = 0;
  let rowsTouched = 0;
  for (const r of rows) {
    const ev = Array.isArray(r.evidence) ? r.evidence : [];
    const filtered = ev.filter((e) => {
      const tag = parseShiftTag(e?.summary);
      if (!tag) return true; // no shift tag → keep (base or non-shifted entry)
      if (tag.base === tag.target) return true; // base==target (shift +0d) is base entry, keep
      // Shifted projection: target != base, this row IS the target
      // (i.e., the shifted copy that doesn't belong elsewhere).
      // Remove it — the base-zone copy already exists on the base row.
      return false;
    });
    if (filtered.length === ev.length) continue;
    const removed = ev.length - filtered.length;
    await sql`
      update species_fruiting_windows
         set evidence = ${sql.json(filtered)},
             updated_at = now()
       where id = ${r.id}`;
    totalRemoved += removed;
    rowsTouched++;
  }

  console.log(`Shifted-projection cleanup: ${totalRemoved} entries removed across ${rowsTouched} rows.`);
  await sql.end();
})();
