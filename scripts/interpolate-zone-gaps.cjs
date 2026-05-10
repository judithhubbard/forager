// Fill interior zone gaps by linear interpolation between flanking
// rows. Only fills "interior" gaps — zones with rows on BOTH sides.
// Does NOT extrapolate beyond the species's observed range (we don't
// know if the species grows there).
//
// For each (species, stage), walks through zones in numeric order:
//   - If zone has a row: skip
//   - If zone has no row but rows exist on both lower and upper sides
//     within MAX_GAP zones: INSERT interpolated row
//     (peak, start, end all linearly interpolated)
//   - If zone has no row and either side is missing: skip (can't tell
//     if species grows there)
//
// Idempotent. Runs after smooth-across-zones, before enforce-monotonic.
//
// Confidence on interpolated rows: 'observation_derived' (mid-tier;
// not as strong as cited but better than 'unknown').

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
  '9a': 18, '9b': 19, '10a': 20, '10b': 21
};
const ZONE_CODES_BY_NUM = Object.fromEntries(Object.entries(ZONE_NUM).map(([k,v]) => [v, k]));
const ALL_ZONE_NUMS = Object.values(ZONE_NUM).sort((a,b) => a - b);

// Maximum allowed gap (in half-zones) between flanking rows. Larger
// gaps suggest the species doesn't grow in the missing band; don't fill.
const MAX_GAP = 4;

(async () => {
  // Pull every (species, stage) combo with rows.
  const rows = await sql`
    select s.id as species_id, s.scientific_name, w.stage,
           cz.id as zone_id, cz.code as zone_code,
           w.start_doy, w.end_doy, w.peak_doy, w.confidence, w.notes
      from species s
      join species_fruiting_windows w on w.species_id = s.id
      join climate_zones cz on cz.id = w.climate_zone_id
     where s.is_forageable = true`;

  // Map: speciesId+stage → array of {x, code, start, end, peak, ...}
  const groups = new Map();
  for (const r of rows) {
    const k = `${r.species_id}::${r.stage}`;
    let arr = groups.get(k);
    if (!arr) { arr = []; groups.set(k, arr); }
    if (ZONE_NUM[r.zone_code] != null) {
      arr.push({ x: ZONE_NUM[r.zone_code], code: r.zone_code, ...r });
    }
  }

  // Cache zone IDs by code (for inserts).
  const zoneRows = await sql`select id, code from climate_zones`;
  const zoneIdByCode = Object.fromEntries(zoneRows.map(z => [z.code, z.id]));

  let totalFilled = 0, totalGroups = 0, totalSkippedTooFar = 0;

  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    group.sort((a, b) => a.x - b.x);
    const presentNums = new Set(group.map(p => p.x));
    const minX = group[0].x, maxX = group[group.length - 1].x;

    // Walk every zone-number between min and max; identify interior gaps.
    for (let x = minX + 1; x < maxX; x++) {
      if (presentNums.has(x)) continue;
      // Find flanking present zones.
      const lower = group.filter(p => p.x < x).slice(-1)[0];
      const upper = group.find(p => p.x > x);
      if (!lower || !upper) continue;
      const span = upper.x - lower.x;
      if (span > MAX_GAP) { totalSkippedTooFar++; continue; }

      // Linear interpolate.
      const t = (x - lower.x) / span;
      const lerp = (a, b) => Math.round(a + (b - a) * t);
      const peak = lerp(lower.peak_doy, upper.peak_doy);
      const start = lerp(lower.start_doy, upper.start_doy);
      const end = lerp(lower.end_doy, upper.end_doy);

      const code = ZONE_CODES_BY_NUM[x];
      const zoneId = zoneIdByCode[code];
      if (!zoneId) continue;

      // Insert only if not present (manual check — no usable unique
      // constraint on this combo).
      const existing = await sql`
        select id from species_fruiting_windows
         where species_id = ${lower.species_id}
           and climate_zone_id = ${zoneId}
           and stage = ${lower.stage}::public.stage`;
      if (existing.length > 0) continue;
      await sql`
        insert into species_fruiting_windows
          (species_id, climate_zone_id, stage, start_doy, end_doy, peak_doy, confidence, notes)
        values
          (${lower.species_id}, ${zoneId}, ${lower.stage}::public.stage,
           ${start}, ${end}, ${peak},
           'observation_derived'::public.window_confidence,
           ${'Interpolated from flanking zones (' + lower.code + ', ' + upper.code + ').'})`;
      totalFilled++;
    }
    totalGroups++;
  }

  console.log(`Gap interpolation: ${totalFilled} rows filled across ${totalGroups} (species, stage) groups; ${totalSkippedTooFar} gaps too wide (>${MAX_GAP} half-zones) — left empty.`);

  if (totalFilled > 0) {
    console.log('Refreshing zone-presence materialized view…');
    await sql`select public.refresh_species_zone_presence()`;
  }
  await sql.end();
})();
