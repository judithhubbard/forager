// Cleanup: remove evidence entries where the source explicitly names
// a SPECIFIC zone in its parenthetical (e.g., "(Florida, zone 9a)")
// but the entry has been attached to OTHER zones via the chestnut-
// crawl / blog-evidence-crawl agent's per-zone shifting.
//
// The pattern to clean: the same source quote appears on multiple
// zones with shifted supports values, even though the source's quote
// only claims to describe ONE zone. The shifted DOY values are agent
// projections — not what the source actually said for those zones.
//
// Rule: when an evidence entry's SOURCE field contains an explicit
// zone reference (e.g., "(... zone 9a)" or "(... zones 7a, 7b)"),
// and the row's zone is NOT in the source's named zones, remove
// the entry from that row.
//
// Sources without explicit zone references (e.g., "USDA Silvics",
// "Wikipedia", "NC State Extension") are NOT affected — they don't
// claim to be zone-specific, so per-zone copies are reasonable.
//
// Idempotent.

'use strict';

const fs = require('node:fs');
const env = fs.readFileSync('/Users/jk/Dropbox/Claude/forager/.env.local', 'utf8');
const SUPABASE_DB_URL = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim();
const sql = require('/Users/jk/Dropbox/Claude/forager/node_modules/postgres')(
  SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined }
);

/** Extract zone codes the source explicitly claims to cover. Looks
 *  for "zone Xy" or "zones Xy, Y'z" patterns in the source's text
 *  (which typically appears at the start of the summary as the
 *  attribution parenthetical, e.g. "Green Deane (Eat The Weeds,
 *  Florida, zone 9a):" — the zone is "9a"). */
function extractClaimedZones(source, summary) {
  // Look in both source name and the leading parenthetical of the summary.
  const text = `${source ?? ''} ${(summary ?? '').slice(0, 250)}`;
  const matches = [...text.matchAll(/\bzones?\s+([0-9]+[ab])\b/gi)];
  return new Set(matches.map((m) => m[1].toLowerCase()));
}

(async () => {
  const rows = await sql`
    select w.id, cz.code as zone_code,
           coalesce(w.evidence, '[]'::jsonb) as evidence
      from species_fruiting_windows w
      join species s on s.id = w.species_id
      join climate_zones cz on cz.id = w.climate_zone_id
     where s.is_forageable = true`;

  let totalRemoved = 0;
  let rowsTouched = 0;
  for (const r of rows) {
    const ev = Array.isArray(r.evidence) ? r.evidence : [];
    const filtered = ev.filter((e) => {
      const zones = extractClaimedZones(e?.source, e?.summary);
      if (zones.size === 0) return true; // generic source, keep
      return zones.has(r.zone_code.toLowerCase());
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

  console.log(`Cross-zone evidence cleanup: ${totalRemoved} entries removed across ${rowsTouched} rows.`);
  await sql.end();
})();
