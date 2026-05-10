// Enforce cross-zone monotonicity via Pool Adjacent Violators (PAV).
//
// Per (species, stage) with non-zero direction (heat-driven or frost-
// driven), the synthesized start_doy / end_doy / peak_doy should be
// monotonic across zones. Where two adjacent zones violate the
// expected direction, average them — iterated until convergence.
// This is standard isotonic regression.
//
// Heat-driven (direction = -1): warmer zones should be EARLIER.
// Frost-driven (direction = +1): warmer zones should be LATER.
//
// Applied independently to start_doy, end_doy, peak_doy. Touches
// all rows with direction != 0; species/stages with no zone signal
// (mushroom_flush, root_dig, bark_strip) are skipped.
//
// Idempotent — re-running on already-monotonic data is a no-op.

'use strict';

const fs = require('node:fs');
const env = fs.readFileSync('/Users/jk/Dropbox/Claude/forager/.env.local', 'utf8');
const SUPABASE_DB_URL = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim();
const sql = require('/Users/jk/Dropbox/Claude/forager/node_modules/postgres')(
  SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined }
);

const ZONE_NUM = {
  '0a':0,'0b':1,'1a':2,'1b':3,'2a':4,'2b':5,'3a':6,'3b':7,
  '4a':8,'4b':9,'5a':10,'5b':11,'6a':12,'6b':13,'7a':14,'7b':15,
  '8a':16,'8b':17,'9a':18,'9b':19,'10a':20,'10b':21,'11a':22,'11b':23,
  '12a':24,'12b':25,'13a':26,'13b':27
};

// Mirror nut-frost-fix's NUT_SPECIES table for direction consistency.
// Anything nut-frost-fix anchors with a positive offset-from-frost
// is frost-driven for monotonicity purposes (warmer = later).
const FROST_DRIVEN_RIPE = new Set([
  'Fagus grandifolia', 'Diospyros virginiana', 'Vaccinium macrocarpon',
  'Castanea dentata', 'Castanea mollissima', 'Castanea sativa',
  'Castanea sp.',
  'Quercus alba', 'Quercus macrocarpa',
  'Carya ovata', 'Carya laciniosa', 'Carya illinoinensis',
  'Juglans nigra', 'Juglans cinerea', 'Juglans regia',
  // Hazelnuts: nut-frost-fix anchors them with offset -14 (drop
  // before frost), but the per-zone curve still follows first-frost
  // timing (warmer = later first frost = later harvest). Treat as
  // frost-driven for monotonic purposes.
  'Corylus americana', 'Corylus cornuta'
  // Castanea pumila is heat-driven (chinkapin-fix); not in this list.
]);

const STAGE_DIRECTION = {
  ripe: -1, ripening: -1, green: -1, past: 0,
  flowering: -1, flower_harvest: -1,
  shoot: -1, leaf: -1,
  sap_run: -1,
  root_dig: 0, mushroom_flush: 0, bark_strip: 0,
  bare: 0, unknown: 0
};

function directionFor(scientificName, stage) {
  if (stage === 'ripe' && FROST_DRIVEN_RIPE.has(scientificName)) return +1;
  return STAGE_DIRECTION[stage] ?? 0;
}

/** Pool Adjacent Violators — iteratively averages adjacent values
 *  whose direction violates the expected sign. Returns the
 *  monotonic-corrected sequence. */
function pav(values, direction) {
  // direction = -1 → expected delta <= 0 (decreasing as zone num grows)
  // direction = +1 → expected delta >= 0 (increasing)
  // Violation: delta has the wrong sign for the expected direction.
  // delta * direction > 0 indicates SAME-sign (correct), so violation
  // is when delta * direction < 0 (opposite sign, ignoring zero).
  const v = values.slice();
  let changed = true;
  let iter = 0;
  while (changed && iter++ < 50) {
    changed = false;
    for (let i = 1; i < v.length; i++) {
      if (v[i] == null || v[i - 1] == null) continue;
      const delta = v[i] - v[i - 1];
      // Violation when delta and direction have opposite signs.
      if (delta * direction < 0) {
        const avg = Math.round((v[i] + v[i - 1]) / 2);
        v[i - 1] = avg;
        v[i] = avg;
        changed = true;
      }
    }
  }
  return v;
}

(async () => {
  // Pull all rows joined with species + zone, group by (species, stage).
  const rows = await sql`
    select w.id, w.species_id, s.scientific_name, s.common_name,
           w.stage, cz.code as zone_code,
           w.start_doy, w.end_doy, w.peak_doy
      from species_fruiting_windows w
      join species s on s.id = w.species_id
      join climate_zones cz on cz.id = w.climate_zone_id
     where s.is_forageable = true
     order by s.scientific_name, w.stage, cz.code`;

  const groups = new Map();
  for (const r of rows) {
    const k = `${r.species_id}::${r.stage}`;
    let arr = groups.get(k);
    if (!arr) { arr = []; groups.set(k, arr); }
    arr.push(r);
  }

  let totalChanged = 0;
  let groupsTouched = 0;
  for (const [, grp] of groups) {
    const sample = grp[0];
    const direction = directionFor(sample.scientific_name, sample.stage);
    if (direction === 0) continue;
    if (grp.length < 2) continue;
    // Sort by zone numeric.
    const decorated = grp
      .filter(r => ZONE_NUM[r.zone_code] != null)
      .sort((a, b) => ZONE_NUM[a.zone_code] - ZONE_NUM[b.zone_code]);
    if (decorated.length < 2) continue;

    const starts = pav(decorated.map(r => r.start_doy), direction);
    const ends   = pav(decorated.map(r => r.end_doy),   direction);
    const peaks  = pav(decorated.map(r => r.peak_doy),  direction);

    let groupChanged = false;
    for (let i = 0; i < decorated.length; i++) {
      const r = decorated[i];
      if (starts[i] === r.start_doy && ends[i] === r.end_doy && peaks[i] === r.peak_doy) continue;
      await sql`
        update species_fruiting_windows
           set start_doy = ${starts[i]},
               end_doy   = ${ends[i]},
               peak_doy  = ${peaks[i]},
               updated_at = now()
         where id = ${r.id}`;
      totalChanged++;
      groupChanged = true;
    }
    if (groupChanged) groupsTouched++;
  }

  console.log(`Monotonic enforcement: ${totalChanged} rows changed across ${groupsTouched} (species, stage) groups.`);
  await sql.end();
})();
