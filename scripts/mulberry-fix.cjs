// Red mulberry (Morus rubra) — heat-driven harvest anchored to
// Cornell Cooperative Extension + Practical Self Reliance: peak
// harvest in zone 6a is ~Jun 24 (DOY 175). Mulberries ripen
// significantly before blackberries; current pipeline had a
// step-jump in the cold-zone gradient making 5b/6a/6b all ~Jul 15.

'use strict';

const fs = require('node:fs');
const env = fs.readFileSync('/Users/jk/Dropbox/Claude/forager/.env.local', 'utf8');
const SUPABASE_DB_URL = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim();
const sql = require('/Users/jk/Dropbox/Claude/forager/node_modules/postgres')(
  SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined }
);

const ZONE_NUM = {
  '5a': 10, '5b': 11, '6a': 12, '6b': 13,
  '7a': 14, '7b': 15, '8a': 16, '8b': 17, '9a': 18, '9b': 19, '10a': 20
};
const ANCHOR_ZONE_NUM = 12; // 6a
const ANCHOR_PEAK = 175;    // Jun 24
const PER_HALF_ZONE_SHIFT = -7; // heat-driven (warmer earlier)
const HALF_WINDOW = 18;

(async () => {
  const sp = await sql`select id from species where scientific_name = 'Morus rubra'`;
  if (sp.length === 0) { console.error('Red mulberry not in DB'); process.exit(1); }
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
  console.log(`\nRed mulberry: ${updated} rows updated.`);
  await sql.end();
})();
