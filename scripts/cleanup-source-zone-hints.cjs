// Cleanup: remove evidence entries from zones outside the source's
// known regional coverage.
//
// The existing cleanup-cross-zone-evidence script handles sources that
// EXPLICITLY tag their zone in the summary (e.g., "(zone 7b)"). This
// script handles the harder case: regional sources that don't tag
// their zone but are clearly biased to a specific climate band.
// Examples:
//   - Backyard Forager: mid-Atlantic (zones 6b-7a)
//   - Practical Self Reliance: VT (zones 4a-5b)
//   - Northern Woodlands: VT/NH (zones 4a-5b)
//   - Tyrant Farms: SC (zones 7b-8a)
//
// Each entry below specifies a source-name match and the zones the
// source's data plausibly covers. Evidence on zones outside that range
// is removed, since attaching VT-zone-4 timing to zone-7b rows is just
// noise.
//
// Idempotent. Runs after cleanup-cross-zone-evidence.

'use strict';

const fs = require('node:fs');
const env = fs.readFileSync('/Users/jk/Dropbox/Claude/forager/.env.local', 'utf8');
const SUPABASE_DB_URL = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim();
const sql = require('/Users/jk/Dropbox/Claude/forager/node_modules/postgres')(
  SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined }
);

// Source-name substring (case-insensitive) → zone codes the source
// plausibly covers. A source's evidence is kept only on rows whose
// zone is in this list. Sources NOT in this table are not affected
// by this cleanup (they may still be filtered by cleanup-cross-zone-
// evidence if their summary explicitly names a zone).
//
// Zone ranges err on the slightly-generous side: a VT source extends
// down to 4a even though its actual region is 4b/5a; rejecting only
// the truly wrong-band attachments.
const SOURCE_ZONE_HINTS = [
  // ── Mid-Atlantic / Northeast forager voices ──
  {
    match: 'backyard forager',
    zones: ['5a','5b','6a','6b','7a'],
    note: 'Mid-Atlantic forager (Ellen Zachos)'
  },
  {
    match: 'practical self reliance',
    zones: ['3b','4a','4b','5a','5b'],
    note: 'Vermont (Ashley Adamant)'
  },
  {
    match: 'northern woodlands',
    zones: ['3b','4a','4b','5a','5b'],
    note: 'VT/NH forest magazine'
  },
  {
    match: 'tyrant farms',
    zones: ['7a','7b','8a','8b'],
    note: 'South Carolina'
  },
  // ── Metro fruit-ripening guides (very local) ──
  {
    match: 'toronto metro',
    zones: ['5b','6a','6b'],
    note: 'Toronto Not Far From The Tree'
  },
  {
    match: 'not far from the tree',
    zones: ['5b','6a','6b'],
    note: 'Toronto NFFTT (alt match)'
  },
  {
    match: 'ottawa metro',
    zones: ['4b','5a','5b'],
    note: 'Ottawa Hidden Harvest'
  },
  {
    match: 'hidden harvest ottawa',
    zones: ['4b','5a','5b'],
    note: 'Ottawa HH (alt match)'
  },
  {
    match: 'philadelphia metro',
    zones: ['6b','7a','7b'],
    note: 'Philadelphia POP'
  },
  {
    match: 'philadelphia orchard project',
    zones: ['6b','7a','7b'],
    note: 'POP (alt match)'
  },
  {
    match: 'seattle metro',
    zones: ['7b','8a','8b'],
    note: 'Seattle CityFruit'
  },
  {
    match: 'cityfruit',
    zones: ['7b','8a','8b'],
    note: 'CityFruit (alt match)'
  },
  // ── State-level extensions / wildflower guides ──
  {
    match: 'minnesota wildflowers',
    zones: ['3a','3b','4a','4b','5a'],
    note: 'Minnesota cold-zone'
  },
  {
    match: 'university of vermont extension',
    zones: ['3b','4a','4b','5a','5b'],
    note: 'UVM Extension'
  },
  {
    match: 'university of maine cooperative extension',
    zones: ['3b','4a','4b','5a'],
    note: 'UMaine Extension'
  },
  {
    match: 'nc state extension',
    zones: ['6b','7a','7b','8a'],
    note: 'NC State Extension'
  },
  {
    match: 'cornell maple program',
    zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a'],
    note: 'Cornell maple (Northeast range)'
  },
  {
    match: 'vermont maple sugar makers',
    zones: ['3a','3b','4a','4b','5a','5b'],
    note: 'VT maple sugar producers'
  },
  // ── California (covers 8b-10b) ──
  {
    match: 'ucanr',
    zones: ['8a','8b','9a','9b','10a','10b'],
    note: 'University of California ANR'
  },
  {
    match: 'uc anr',
    zones: ['8a','8b','9a','9b','10a','10b'],
    note: 'UC ANR (alt match)'
  },
  {
    match: 'uc ipm',
    zones: ['8a','8b','9a','9b','10a','10b'],
    note: 'UC IPM'
  },
  {
    match: 'california apricot council',
    zones: ['8a','8b','9a','9b','10a'],
    note: 'CA Apricot Council'
  },
  // ── Florida-specific ──
  {
    match: 'pickyourown.org florida',
    zones: ['8b','9a','9b','10a'],
    note: 'PickYourOwn Florida'
  },
  {
    match: 'foraging texas',
    zones: ['7b','8a','8b','9a'],
    note: 'Texas-specific forager'
  }
];

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
    const zoneLower = r.zone_code.toLowerCase();
    const filtered = ev.filter((e) => {
      const src = (e?.source ?? '').toLowerCase();
      const hint = SOURCE_ZONE_HINTS.find(h => src.includes(h.match));
      if (!hint) return true;       // unknown source — keep
      return hint.zones.includes(zoneLower);
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

  console.log(`Source-zone-hint cleanup: ${totalRemoved} entries removed across ${rowsTouched} rows.`);
  await sql.end();
})();
