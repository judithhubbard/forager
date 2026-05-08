// Generate frost-offset harvest windows for every USDA zone, based
// on the curated 5b/6a Ithaca windows. Each window stage gets
// anchored to last-spring-frost or first-fall-frost (whichever is
// closer) in the source zone, then translated to other zones via
// their own NOAA frost-date normals.
//
// Heuristic: stages keyed off spring growth (flowering, sap, green-
// shoot) anchor to last-spring-frost. Stages keyed off late-summer
// or fall (ripe fruit, mushroom fruiting) anchor to first-fall-
// frost. Mid-summer stages (mid-fruiting) anchor to whichever is
// closer to the start_doy.

const postgres = require('postgres');
const { config } = require('dotenv');
const path = require('path');
config({ path: path.resolve(__dirname, '..', '.env.local') });
const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined });

(async () => {
  // 1. Load curated windows from source zones (5b + 6a)
  const sourceZoneCodes = ['5b', '6a'];
  const sourceFrost = {};
  const allFrost = {};
  const frostRows = await sql`select zone_code, last_spring_frost_doy, first_fall_frost_doy from public.zone_frost_dates`;
  for (const r of frostRows) {
    allFrost[r.zone_code] = {
      lsf: r.last_spring_frost_doy,
      fff: r.first_fall_frost_doy
    };
    if (sourceZoneCodes.includes(r.zone_code)) sourceFrost[r.zone_code] = allFrost[r.zone_code];
  }
  console.log(`Source zones: ${Object.keys(sourceFrost).join(', ')}`);
  console.log(`Target zones: ${Object.keys(allFrost).filter(z => !sourceZoneCodes.includes(z)).join(', ')}`);

  const zoneIdByCode = {};
  for (const r of await sql`select code, id from public.climate_zones`) {
    zoneIdByCode[r.code] = r.id;
  }
  // After migration 59 region_id is nullable on species_fruiting_windows.
  // Frost-offset rows are keyed strictly by climate_zone_id, not any
  // particular region. Set region_id = NULL.

  // 2. Load curated windows
  const curated = await sql`
    select sfw.id as window_id, sfw.species_id, cz.code as zone_code,
           sfw.stage, sfw.start_doy, sfw.end_doy
      from public.species_fruiting_windows sfw
      join public.climate_zones cz on cz.id = sfw.climate_zone_id
     where sfw.confidence = 'curated'
       and cz.code = any(${sourceZoneCodes})
  `;
  console.log(`\nLoaded ${curated.length} curated source windows.`);

  // 3. For each curated window, compute the offset relative to the
  //    closer frost anchor. Then for each target zone, compute new
  //    start/end DOY by applying the offset to that zone's anchor.
  function chooseAnchor(start_doy, lsf, fff) {
    // If the start is closer to spring frost than fall frost, anchor
    // to spring. Otherwise to fall.
    return Math.abs(start_doy - lsf) <= Math.abs(start_doy - fff) ? 'lsf' : 'fff';
  }
  function clampDoy(d) {
    if (d < 1) return 1;
    if (d > 365) return 365;
    return Math.round(d);
  }

  const targetZones = Object.keys(allFrost).filter(z => !sourceZoneCodes.includes(z));
  const proposals = [];
  for (const w of curated) {
    const src = sourceFrost[w.zone_code];
    const anchor = chooseAnchor(w.start_doy, src.lsf, src.fff);
    const start_offset = w.start_doy - (anchor === 'lsf' ? src.lsf : src.fff);
    const end_offset = w.end_doy - (anchor === 'lsf' ? src.lsf : src.fff);
    for (const tz of targetZones) {
      const tgt = allFrost[tz];
      const tgtAnchor = anchor === 'lsf' ? tgt.lsf : tgt.fff;
      const newStart = clampDoy(tgtAnchor + start_offset);
      const newEnd = clampDoy(tgtAnchor + end_offset);
      // Sanity: end must come after start (or wrap); for now skip
      // any window that crosses the year boundary.
      if (newEnd < newStart) continue;
      proposals.push({
        species_id: w.species_id,
        zone_code: tz,
        zone_id: zoneIdByCode[tz],
        stage: w.stage,
        start_doy: newStart,
        end_doy: newEnd
      });
    }
  }
  // Dedup: a species can have rows for both 5b and 6a; pick the
  // newer (smaller-zone-distance) source. For target zone tz with
  // numeric label N(tz), pick the source zone whose numeric label
  // is closest. Cheap heuristic: average the two source zones'
  // proposals.
  const merged = new Map();
  for (const p of proposals) {
    const key = `${p.species_id}|${p.zone_code}|${p.stage}`;
    if (!merged.has(key)) {
      merged.set(key, { ...p, count: 1 });
    } else {
      const m = merged.get(key);
      m.start_doy = Math.round((m.start_doy * m.count + p.start_doy) / (m.count + 1));
      m.end_doy   = Math.round((m.end_doy   * m.count + p.end_doy)   / (m.count + 1));
      m.count++;
    }
  }
  const finalRows = Array.from(merged.values());
  console.log(`\nGenerated ${finalRows.length} candidate frost-offset windows for ${targetZones.length} target zones.`);

  // 4. Delete-then-insert. The species_fruiting_windows table has
  //    no unique constraint on (species_id, climate_zone_id, stage),
  //    so ON CONFLICT can't be used. Drop existing non-curated rows
  //    in the target zones first, then bulk-insert.
  await sql`
    delete from public.species_fruiting_windows
     where confidence <> 'curated'
       and climate_zone_id in (
         select id from public.climate_zones where code = any(${targetZones})
       )
  `;
  console.log(`Cleared previous non-curated rows in target zones.`);

  let inserted = 0;
  // Bulk insert in chunks of 200
  const CHUNK = 200;
  for (let i = 0; i < finalRows.length; i += CHUNK) {
    const slice = finalRows.slice(i, i + CHUNK);
    const ins = await sql`
      insert into public.species_fruiting_windows
        (species_id, climate_zone_id, stage, start_doy, end_doy, confidence)
      select * from unnest(
        ${slice.map(r => r.species_id)}::uuid[],
        ${slice.map(r => r.zone_id)}::uuid[],
        ${slice.map(r => r.stage)}::stage[],
        ${slice.map(r => r.start_doy)}::int[],
        ${slice.map(r => r.end_doy)}::int[],
        ${slice.map(() => 'frost_offset')}::window_confidence[]
      )
      returning id
    `;
    inserted += ins.length;
  }
  console.log(`Wrote ${inserted} window rows.`);

  // 5. Summary
  const summary = await sql`
    select cz.code, sfw.confidence, count(*)::int as n
      from public.species_fruiting_windows sfw
      join public.climate_zones cz on cz.id = sfw.climate_zone_id
     group by cz.code, sfw.confidence
     order by cz.code, sfw.confidence
  `;
  console.log('\nWindow coverage by zone × confidence:');
  for (const r of summary) {
    console.log(`  ${r.code.padEnd(4)} ${r.confidence.padEnd(20)} ${r.n}`);
  }

  await sql.end();
})().catch(e => { console.error(e); process.exit(1); });
