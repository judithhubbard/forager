// Allegheny chinkapin (Castanea pumila) — heat-driven harvest.
//
// Originally lumped with other chestnuts in nut-frost-fix using a
// frost-driven offset of -25d from first frost. That happened to
// produce roughly-correct values for cold and medium zones (5b-7b)
// by coincidence — heat-accumulation by Sept equals first-frost
// minus 25 days in those zones — but it broke at warm zones (9a)
// where first frost arrives weeks AFTER the actual harvest.
//
// All cited sources for chinkapin describe heat-driven Aug-Sep
// harvest across the species's range, with no requirement for frost
// triggering:
//   - Eat The Weeds (Florida 9a): "main harvest August through September"
//   - USDA Forest Service Silvics: "ripen in early autumn"
//   - NC State Extension Plant Toolbox: ripens fall
//   - Wikipedia: "late summer to early fall"
//
// This script anchors chinkapin at zone 7a peak DOY 272 (Sep 29 —
// matching the cited "early autumn" for the species's center of
// range), heat-driven (warmer = earlier, -7d per warmer half-zone).

'use strict';

const fs = require('node:fs');
const env = fs.readFileSync('/Users/jk/Dropbox/Claude/forager/.env.local', 'utf8');
const SUPABASE_DB_URL = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim();
const sql = require('/Users/jk/Dropbox/Claude/forager/node_modules/postgres')(
  SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined }
);

const ZONE_NUM = {
  '5a': 10, '5b': 11, '6a': 12, '6b': 13,
  '7a': 14, '7b': 15, '8a': 16, '8b': 17, '9a': 18
};
const ANCHOR_ZONE_NUM = 14; // 7a
const ANCHOR_PEAK = 272;    // Sep 29
const PER_HALF_ZONE_SHIFT = -7; // heat-driven (warmer earlier)
const HALF_WINDOW = 21;

(async () => {
  const sp = await sql`select id from species where scientific_name = 'Castanea pumila'`;
  if (sp.length === 0) { console.error('Chinkapin not in DB'); process.exit(1); }
  const wins = await sql`
    select w.id, cz.code, w.start_doy, w.end_doy, w.peak_doy
      from species_fruiting_windows w
      join climate_zones cz on cz.id = w.climate_zone_id
     where w.species_id = ${sp[0].id} and w.stage = 'ripe'
     order by cz.code`;
  let updated = 0;
  for (const w of wins) {
    const zoneNum = ZONE_NUM[w.code];
    if (zoneNum == null) continue;
    const peak = Math.max(1, Math.min(366, ANCHOR_PEAK + (zoneNum - ANCHOR_ZONE_NUM) * PER_HALF_ZONE_SHIFT));
    const start = Math.max(1, peak - HALF_WINDOW);
    const end = Math.min(366, peak + HALF_WINDOW);
    if (w.peak_doy === peak && w.start_doy === start && w.end_doy === end) continue;
    await sql`
      update species_fruiting_windows
         set start_doy = ${start}, end_doy = ${end}, peak_doy = ${peak},
             confidence = 'regional_guide'::public.window_confidence,
             updated_at = now()
       where id = ${w.id}`;
    console.log(`  ${w.code}: ${w.start_doy}-${w.end_doy}/peak ${w.peak_doy} → ${start}-${end}/peak ${peak}`);
    updated++;
  }
  console.log(`\nChinkapin: ${updated} rows updated.`);
  await sql.end();
})();
