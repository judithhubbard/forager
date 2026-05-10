// Pawpaw (Asimina triloba) — heat-driven harvest anchored to cited
// regional sources (KSU Pawpaw Program, Ohio State Extension, Eat
// The Weeds, Practical Self Reliance).
//
// Pawpaw fruit develops on the tree May-Aug, ripens (turns soft and
// drops) Aug-Sep depending on zone. iNat's "Fruiting" annotation
// captures the developing-on-tree stage starting in May, biasing
// the synthesized window 6+ weeks earlier than actual harvest.
//
// Per KSU Pawpaw Program (Kentucky State University, the canonical
// pawpaw research center) + Ohio State Extension: peak harvest in
// zone 6a is mid-September (~Sep 15 / DOY 258). Heat-driven, ~7 days
// per warmer half-zone (warmer ripens earlier).

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
const ANCHOR_ZONE_NUM = 12; // 6a
const ANCHOR_PEAK = 258;    // Sep 15 (KSU + OSU)
const PER_HALF_ZONE_SHIFT = -7; // heat-driven (warmer earlier)
const HALF_WINDOW = 21;

(async () => {
  const sp = await sql`select id from species where scientific_name = 'Asimina triloba'`;
  if (sp.length === 0) { console.error('Pawpaw not in DB'); process.exit(1); }
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
    const peak = ANCHOR_PEAK + (zoneNum - ANCHOR_ZONE_NUM) * PER_HALF_ZONE_SHIFT;
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
  console.log(`\nPawpaw: ${updated} rows updated.`);
  await sql.end();
})();
