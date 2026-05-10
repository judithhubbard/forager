// American beech (Fagus grandifolia) — rebuild calibration from
// first-frost climatology + cited silviculture sources.
//
// Background: iNat Fruiting-annotated observations capture beech
// burrs as soon as they're visible on the tree (late May through
// summer), which is NOT the harvest stage for foragers. Beechnuts
// drop after first hard frost (Sept–Nov, frost-driven). Our four
// cited non-iNat sources (USDA Forest Service Silvics, Practical
// Self Reliance, Eat The Weeds, Wikipedia) all converge on "autumn,
// dispersed after first hard frost" — which exactly matches NOAA
// first-frost climatology by zone.
//
// This script:
//   1. Sets per-zone DOY using NOAA first-frost peaks ± 20 days
//   2. Sets confidence='regional_guide' (cited sources, not iNat
//      empirical)
//   3. Adds a row-level note explaining the iNat caveat
//   4. Preserves all existing evidence (including iNat) on rows so
//      the per-source range bars in the viewer show the spread —
//      but iNat no longer drives the synthesized DOY
//
// Idempotent.

'use strict';

const fs = require('node:fs');
const env = fs.readFileSync('/Users/jk/Dropbox/Claude/forager/.env.local', 'utf8');
const SUPABASE_DB_URL = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim();
const sql = require('/Users/jk/Dropbox/Claude/forager/node_modules/postgres')(
  SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined }
);

// First-frost peaks per zone (DOY) — derived from NOAA 1991-2020
// climate normals for first 32°F frost. Fagus grandifolia harvest
// tracks first frost (frost-driven dispersal of burrs), so this
// table is the canonical anchor.
const FROST_PEAKS = {
  '3a': 242, '3b': 248,
  '4a': 255, '4b': 262,
  '5a': 269, '5b': 276,
  '6a': 283, '6b': 290,
  '7a': 297, '7b': 305,
  '8a': 314, '8b': 324
};
const HALF_WINDOW = 20; // ±20 days around peak — matches the Sept-Nov span the cited sources describe

const ROW_NOTE =
  'Frost-driven harvest: beechnut burrs drop after first hard frost. ' +
  'Per-zone peak DOY anchored to NOAA first-frost climatology (1991-2020 normals); ±20 days for the harvest window. ' +
  'Cited consensus from USDA Forest Service Silvics, Eat The Weeds, Practical Self Reliance, and Wikipedia. ' +
  'iNat Fruiting evidence on this row is RETAINED for spread visibility but EXCLUDED from the synthesized DOY: ' +
  'iNat observers tag green burrs visible on the tree (May–Sept), which is the developing stage, not the harvest stage.';

(async () => {
  const sp = await sql`select id from species where scientific_name='Fagus grandifolia'`;
  if (sp.length === 0) { console.error('Fagus grandifolia not in DB'); process.exit(1); }
  const speciesId = sp[0].id;

  const wins = await sql`
    select w.id, cz.code, w.start_doy, w.end_doy, w.peak_doy, w.confidence, w.notes
      from species_fruiting_windows w
      join climate_zones cz on cz.id = w.climate_zone_id
     where w.species_id = ${speciesId}
     order by cz.code`;

  let updated = 0, skipped = 0;
  for (const w of wins) {
    const peak = FROST_PEAKS[w.code];
    if (peak == null) {
      console.log(`  ${w.code}: no frost-peak entry (out of beech natural range), skipping`);
      skipped++;
      continue;
    }
    const start = peak - HALF_WINDOW;
    const end = peak + HALF_WINDOW;
    if (w.start_doy === start && w.end_doy === end && w.peak_doy === peak &&
        w.confidence === 'regional_guide' && (w.notes ?? '').includes('Frost-driven harvest')) {
      console.log(`  ${w.code}: already at ${start}-${end} peak ${peak} regional_guide — skip`);
      skipped++;
      continue;
    }
    await sql`
      update species_fruiting_windows
         set start_doy = ${start},
             end_doy = ${end},
             peak_doy = ${peak},
             confidence = 'regional_guide'::public.window_confidence,
             notes = ${ROW_NOTE},
             updated_at = now()
       where id = ${w.id}`;
    console.log(`  ${w.code}: ${w.start_doy}-${w.end_doy}/peak ${w.peak_doy} → ${start}-${end}/peak ${peak}  (was ${w.confidence}, now regional_guide)`);
    updated++;
  }

  console.log(`\nUpdated ${updated} rows, skipped ${skipped}.`);

  if (updated > 0) {
    console.log('Refreshing zone-presence materialized view…');
    await sql`select public.refresh_species_zone_presence()`;
  }
  await sql.end();
})();
