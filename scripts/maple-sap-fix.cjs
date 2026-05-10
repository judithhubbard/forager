// Sap-flow direction fix for maples.
//
// Sap flow is heat-driven: warmer zones thaw earlier in spring, so
// peak sap flow happens earlier. Cornell Maple Program + UVM Extension
// place peak sap flow in zone 5a around late Feb-early March (DOY ~60),
// shifting ~7 days per half-zone (earlier warmer, later colder).
//
// The original Phase A migration generated three maple species with
// the direction inverted (warmer zones LATER) — the regression test
// harness flagged sugar maple 5a as Mar 23 vs the expected Mar 1.
// Box elder and silver maple were correctly oriented; sugar maple,
// red maple, and amur maple were inverted.
//
// This script rebuilds sap_run rows for those three species using
// the correct heat-driven direction anchored at 5a peak DOY 60.

'use strict';

const fs = require('node:fs');
const env = fs.readFileSync('/Users/jk/Dropbox/Claude/forager/.env.local', 'utf8');
const SUPABASE_DB_URL = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim();
const sql = require('/Users/jk/Dropbox/Claude/forager/node_modules/postgres')(
  SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined }
);

// Anchor: zone 5a peak DOY 60 (Mar 1). Heat-driven, -7 days per
// warmer half-zone, +7 per colder half-zone.
const ZONE_NUM = {
  '3a':6, '3b':7, '4a':8, '4b':9, '5a':10, '5b':11,
  '6a':12, '6b':13, '7a':14, '7b':15, '8a':16, '8b':17
};
const ANCHOR_ZONE_NUM = 10; // 5a
const ANCHOR_PEAK = 60;     // Mar 1
const PER_HALF_ZONE_SHIFT = -7; // days per warmer half-zone (heat-driven)
const HALF_WINDOW = 20;

const TARGETS = [
  { sci: 'Acer saccharum', common: 'Sugar maple' },
  { sci: 'Acer rubrum',    common: 'Red maple' },
  { sci: 'Acer ginnala',   common: 'Amur maple' }
];

(async () => {
  let totalUpdated = 0;
  for (const t of TARGETS) {
    const sp = await sql`select id from species where scientific_name = ${t.sci}`;
    if (sp.length === 0) continue;
    console.log(`\n${t.common} (${t.sci}):`);
    const wins = await sql`
      select w.id, cz.code, w.start_doy, w.end_doy, w.peak_doy
        from species_fruiting_windows w
        join climate_zones cz on cz.id = w.climate_zone_id
       where w.species_id = ${sp[0].id} and w.stage = 'sap_run'
       order by cz.code`;
    for (const w of wins) {
      const zoneNum = ZONE_NUM[w.code];
      if (zoneNum == null) continue;
      const peak = ANCHOR_PEAK + (zoneNum - ANCHOR_ZONE_NUM) * PER_HALF_ZONE_SHIFT;
      const start = peak - HALF_WINDOW;
      const end = peak + HALF_WINDOW;
      if (w.peak_doy === peak && w.start_doy === start && w.end_doy === end) {
        console.log(`  ${w.code}: already at ${start}-${end}/peak ${peak} — skip`);
        continue;
      }
      await sql`
        update species_fruiting_windows
           set start_doy = ${start}, end_doy = ${end}, peak_doy = ${peak},
               updated_at = now()
         where id = ${w.id}`;
      console.log(`  ${w.code}: ${w.start_doy}-${w.end_doy}/peak ${w.peak_doy} → ${start}-${end}/peak ${peak}`);
      totalUpdated++;
    }
  }
  console.log(`\nTotal updated: ${totalUpdated}`);
  await sql.end();
})();
