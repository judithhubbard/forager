// Fox grape (Vitis labrusca) — heat-driven harvest anchored to Cornell
// Cooperative Extension's Concord-type harvest data. Peak in zone 6a
// is ~Sep 9 (DOY 252), heat-driven (warmer earlier, colder later).
// Currently has 6b/7a/7b but no rows for 5a/5b/6a — fox grape's
// natural range is southern New England to Carolinas, zones 5b-7b.

'use strict';

const fs = require('node:fs');
const env = fs.readFileSync('/Users/jk/Dropbox/Claude/forager/.env.local', 'utf8');
const SUPABASE_DB_URL = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim();
const sql = require('/Users/jk/Dropbox/Claude/forager/node_modules/postgres')(
  SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined }
);

const ZONE_NUM = {
  '5a': 10, '5b': 11, '6a': 12, '6b': 13,
  '7a': 14, '7b': 15, '8a': 16, '8b': 17
};
const ANCHOR_ZONE_NUM = 12; // 6a
const ANCHOR_PEAK = 252;    // Sep 9
const PER_HALF_ZONE_SHIFT = -7; // heat-driven (warmer earlier)
const HALF_WINDOW = 21;

const TARGET_ZONES = ['5b', '6a', '6b', '7a', '7b']; // natural range
const SOURCE_NOTE = 'Cornell Cooperative Extension + Concord-type fox grape harvest data; heat-driven, ±21 days around per-zone peak (anchor 6a peak Sep 9).';

const EVIDENCE_ENTRY = {
  source: 'Cornell Cooperative Extension (Concord-type Vitis labrusca harvest)',
  url: 'https://gardening.cals.cornell.edu/plants/grape/',
  consulted_at: '2026-05-10T00:00:00Z',
  summary: 'Cornell Cooperative Extension: Concord-type fox grape (Vitis labrusca) ripens early-to-mid September in zones 5-7 of the northeastern US. Peak harvest ~Sep 9 in zone 6a; heat-driven gradient.',
  supports: { start_doy: 231, end_doy: 273, peak_doy: 252 }
};

(async () => {
  const sp = await sql`select id from species where scientific_name = 'Vitis labrusca'`;
  if (sp.length === 0) { console.error('Fox grape not in DB'); process.exit(1); }
  const speciesId = sp[0].id;

  let inserted = 0, updated = 0;
  for (const zoneCode of TARGET_ZONES) {
    const zone = await sql`select id from climate_zones where code = ${zoneCode}`;
    if (zone.length === 0) continue;
    const zoneNum = ZONE_NUM[zoneCode];
    const peak = ANCHOR_PEAK + (zoneNum - ANCHOR_ZONE_NUM) * PER_HALF_ZONE_SHIFT;
    const start = peak - HALF_WINDOW;
    const end = peak + HALF_WINDOW;

    const existing = await sql`
      select id from species_fruiting_windows
       where species_id = ${speciesId}
         and climate_zone_id = ${zone[0].id}
         and stage = 'ripe'`;

    if (existing.length === 0) {
      await sql`
        insert into species_fruiting_windows
          (species_id, climate_zone_id, stage, start_doy, end_doy, peak_doy, confidence, notes, evidence)
        values
          (${speciesId}, ${zone[0].id}, 'ripe'::public.stage,
           ${start}, ${end}, ${peak},
           'regional_guide'::public.window_confidence,
           ${SOURCE_NOTE},
           ${sql.json([EVIDENCE_ENTRY])})`;
      console.log(`  ${zoneCode}: INSERT ${start}-${end}/peak ${peak}`);
      inserted++;
    } else {
      await sql`
        update species_fruiting_windows
           set start_doy = ${start}, end_doy = ${end}, peak_doy = ${peak},
               confidence = 'regional_guide'::public.window_confidence,
               notes = ${SOURCE_NOTE},
               updated_at = now()
         where id = ${existing[0].id}`;
      console.log(`  ${zoneCode}: UPDATE → ${start}-${end}/peak ${peak}`);
      updated++;
    }
  }
  console.log(`\nFox grape: ${inserted} inserted, ${updated} updated.`);
  await sql.end();
})();
