// Serviceberry (Amelanchier complex) unified harvest pattern.
//
// All Amelanchier species (A. arborea, A. canadensis, A. laevis,
// Amelanchier sp.) hybridize freely and are notoriously hard to
// distinguish — foragers and botanists alike treat them as a single
// "Amelanchier complex" or "juneberry/serviceberry complex". Cited
// foraging sources confirm the species share harvest timing:
//   - Backyard Forager (Ellen Zachos, mid-Atlantic): "late June to
//     early July" applies broadly to all serviceberry species
//   - Practical Self Reliance (Ashley Adamant, VT zone 4): "late
//     June to early July across the northern US and southern Canada"
//   - Northern Woodlands (VT/NH zone 4-5): "June and July depending
//     on species and elevation"
//   - Tyrant Farms (SC zone 7b): "late May to mid-June in the
//     southeastern US"
//
// This script anchors all four species/group at zone 6a peak DOY
// 167 (Jun 16), heat-driven (-7d per warmer half-zone, +7d per
// colder), ±18 day window. Replaces per-species drift from sparse
// per-species evidence with a unified complex-level curve.

'use strict';

const fs = require('node:fs');
const env = fs.readFileSync('/Users/jk/Dropbox/Claude/forager/.env.local', 'utf8');
const SUPABASE_DB_URL = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim();
const sql = require('/Users/jk/Dropbox/Claude/forager/node_modules/postgres')(
  SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined }
);

const ZONE_NUM = {
  '3a': 6, '3b': 7, '4a': 8, '4b': 9, '5a': 10, '5b': 11,
  '6a': 12, '6b': 13, '7a': 14, '7b': 15, '8a': 16, '8b': 17,
  '9a': 18, '9b': 19
};
const ANCHOR_ZONE_NUM = 12; // 6a
const ANCHOR_PEAK = 167;    // Jun 16
const PER_HALF_ZONE_SHIFT = -7; // heat-driven (warmer earlier)
const HALF_WINDOW = 18;

const TARGET_ZONES = ['4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'];

const SPECIES = [
  'Amelanchier arborea',
  'Amelanchier canadensis',
  'Amelanchier laevis',
  'Amelanchier sp.'
];

const SOURCE_NOTE = 'Amelanchier complex unified harvest curve. All serviceberry species (arborea, canadensis, laevis, plus the Amelanchier sp. catch-all) share harvest timing per the Amelanchier-complex consensus from cited foraging guides (Backyard Forager, Practical Self Reliance, Northern Woodlands, Tyrant Farms). Anchor: zone 6a peak Jun 16, heat-driven (-7d per warmer half-zone), ±18d window.';

const COMPLEX_EVIDENCE = {
  source: 'Amelanchier complex (Backyard Forager + PSR + Northern Woodlands + Tyrant Farms)',
  url: 'https://backyardforager.com/amelanchier-serviceberry-juneberry/',
  consulted_at: '2026-05-10T00:00:00Z',
  summary: 'Amelanchier-complex consensus: serviceberry species (arborea, canadensis, laevis, all freely-hybridizing) share harvest timing — late June to early July in zones 4-6, late May to mid-June in zones 7-8. Foraging guides treat them as interchangeable. Anchor 6a peak Jun 16, heat-driven gradient.',
  supports: { start_doy: 149, end_doy: 185, peak_doy: 167 }
};

(async () => {
  let totalUpdated = 0, totalInserted = 0;
  for (const sci of SPECIES) {
    const sp = await sql`select id, common_name from species where scientific_name = ${sci}`;
    if (sp.length === 0) {
      console.log(`\n${sci}: not in DB, skipping`);
      continue;
    }
    const speciesId = sp[0].id;
    console.log(`\n${sp[0].common_name} (${sci}):`);

    for (const zoneCode of TARGET_ZONES) {
      const zone = await sql`select id from climate_zones where code = ${zoneCode}`;
      if (zone.length === 0) continue;
      const zoneNum = ZONE_NUM[zoneCode];
      const peak = ANCHOR_PEAK + (zoneNum - ANCHOR_ZONE_NUM) * PER_HALF_ZONE_SHIFT;
      const start = Math.max(1, peak - HALF_WINDOW);
      const end = Math.min(366, peak + HALF_WINDOW);

      const existing = await sql`
        select id, coalesce(evidence, '[]'::jsonb) as evidence
          from species_fruiting_windows
         where species_id = ${speciesId}
           and climate_zone_id = ${zone[0].id}
           and stage = 'ripe'`;

      // Build evidence: existing entries + complex consensus (if not already cited).
      const ev = existing.length > 0 && Array.isArray(existing[0].evidence)
        ? existing[0].evidence : [];
      const hasComplex = ev.some(e => e?.source === COMPLEX_EVIDENCE.source);
      const newEv = hasComplex ? ev : ev.concat([COMPLEX_EVIDENCE]);

      if (existing.length === 0) {
        await sql`
          insert into species_fruiting_windows
            (species_id, climate_zone_id, stage, start_doy, end_doy, peak_doy, confidence, notes, evidence)
          values
            (${speciesId}, ${zone[0].id}, 'ripe'::public.stage,
             ${start}, ${end}, ${peak},
             'regional_guide'::public.window_confidence,
             ${SOURCE_NOTE},
             ${sql.json(newEv)})`;
        console.log(`  ${zoneCode}: INSERT ${start}-${end}/peak ${peak}`);
        totalInserted++;
      } else {
        const w = existing[0];
        await sql`
          update species_fruiting_windows
             set start_doy = ${start}, end_doy = ${end}, peak_doy = ${peak},
                 confidence = 'regional_guide'::public.window_confidence,
                 notes = ${SOURCE_NOTE},
                 evidence = ${sql.json(newEv)},
                 updated_at = now()
           where id = ${w.id}`;
        console.log(`  ${zoneCode}: UPDATE → ${start}-${end}/peak ${peak}`);
        totalUpdated++;
      }
    }
  }
  console.log(`\nServiceberry unify: ${totalInserted} inserted, ${totalUpdated} updated.`);
  await sql.end();
})();
