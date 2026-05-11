// Companion cleanup for the 2026-05-10 nut audit (task #82).
//
// Removes stale species_fruiting_windows rows that nut-frost-fix.cjs
// previously created for species now handled by species-complex-unify
// as heat-driven. The unify script upserts on (species_id, zone_id,
// stage) and does NOT delete rows outside its target_zones — so when
// a species is migrated from one mechanism to another, the rows in
// zones outside the new target_zones persist with stale frost-driven
// DOYs.
//
// Affected species (heat-driven in unify after audit):
//   Quercus alba          — target 4a-9a, stale rows beyond
//   Quercus macrocarpa    — target 3a-8b, stale rows at 9a, 9b
//   Juglans nigra         — target 4a-9a, stale row at 9b (DOY 342, frost-anchored)
//   Juglans cinerea       — target 4a-9a, stale rows at 3a, 3b (frost-anchored)
//   Juglans regia         — target 4a-9a, stale row at 10a
//
// Run AFTER species-complex-unify.cjs.

'use strict';

const fs = require('node:fs');
const env = fs.readFileSync('/Users/jk/Dropbox/Claude/forager/.env.local', 'utf8');
const SUPABASE_DB_URL = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim();
const sql = require('/Users/jk/Dropbox/Claude/forager/node_modules/postgres')(
  SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined }
);

// (species, zones-to-purge) — zones outside the new unify target_zones
// that still have stale frost-driven rows.
const STALE = [
  { sci: 'Quercus macrocarpa', purge_zones: ['9a','9b'] },
  { sci: 'Juglans nigra',      purge_zones: ['9b'] },
  { sci: 'Juglans cinerea',    purge_zones: ['3a','3b'] },
  { sci: 'Juglans regia',      purge_zones: ['9b','10a'] }
];

(async () => {
  let totalDeleted = 0;
  for (const { sci, purge_zones } of STALE) {
    const sp = await sql`select id from species where scientific_name = ${sci}`;
    if (sp.length === 0) {
      console.log(`${sci}: not in DB, skipping`);
      continue;
    }
    for (const code of purge_zones) {
      const zone = await sql`select id from climate_zones where code = ${code}`;
      if (zone.length === 0) continue;
      const existing = await sql`
        select id, start_doy, peak_doy, end_doy, confidence, notes
          from species_fruiting_windows
         where species_id = ${sp[0].id}
           and climate_zone_id = ${zone[0].id}
           and stage = 'ripe'`;
      if (existing.length === 0) {
        console.log(`${sci} ${code}: no stale row, skipping`);
        continue;
      }
      const row = existing[0];
      // Safety: only delete rows that look like nut-frost-fix output
      // (notes containing "Frost-driven harvest" or DOY substantially
      // later than the heat-driven projection for that zone).
      const isFrostFix = (row.notes || '').includes('Frost-driven harvest');
      if (!isFrostFix) {
        console.log(`${sci} ${code}: row does not look frost-fix-derived (notes lack 'Frost-driven harvest'), skipping for safety`);
        continue;
      }
      await sql`delete from species_fruiting_windows where id = ${row.id}`;
      console.log(`${sci} ${code}: DELETED stale frost-fix row ${row.start_doy}-${row.end_doy}/peak ${row.peak_doy}`);
      totalDeleted++;
    }
  }
  console.log(`\nTotal: ${totalDeleted} stale rows deleted.`);
  if (totalDeleted > 0) {
    console.log('Refreshing zone-presence materialized view…');
    await sql`select public.refresh_species_zone_presence()`;
  }
  await sql.end();
})();
