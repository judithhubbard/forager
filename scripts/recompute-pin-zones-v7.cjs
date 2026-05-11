// Per-polygon recompute using the geography GIST on pins.location.
// Each polygon update fits comfortably under the 2-min statement
// timeout even for the bigger NRCan zones (3a-5b cover most of
// Canada and have the most pins). Geography form was 220x cheaper
// than geometry-cast in EXPLAIN; the per-polygon split adds
// resilience: if one polygon errors the rest still finish.

const postgres = require('postgres');
const path = require('node:path');
const { config } = require('dotenv');
config({ path: path.resolve(__dirname, '..', '.env.local') });

(async () => {
  const sql = postgres(process.env.SUPABASE_DB_URL, {
    ssl: 'require', onnotice: () => undefined, max: 1
  });
  try {
    await sql`alter table public.pins enable trigger tg_pin_density_track_upd`;

    const startUnzoned = await sql`
      select count(*)::int as n from public.pins where climate_zone_id is null
    `;
    console.log(`pins with NULL climate_zone_id at start: ${startUnzoned[0].n.toLocaleString()}`);

    // Iterate every polygon (USDA + NRCan); per-polygon UPDATE only
    // touches pins where ST_Covers matches AND climate_zone_id is null.
    // Most USDA polygons hit 0 pins (already zoned in earlier runs);
    // the NRCan polygons do the real work.
    const polys = await sql`
      select uhz.id as poly_id, uhz.zone_code, uhz.source, cz.id as cz_id
        from public.usda_hardiness_zones uhz
        join public.climate_zones cz on cz.code = uhz.zone_code
       order by uhz.source, uhz.zone_code
    `;
    console.log(`Iterating ${polys.length} polygons…\n`);

    let totalUpdated = 0;
    const overall = Date.now();

    for (const p of polys) {
      const t0 = Date.now();
      try {
        const r = await sql`
          update public.pins pin
             set climate_zone_id = ${p.cz_id}
            from public.usda_hardiness_zones uhz
           where uhz.id = ${p.poly_id}
             and pin.climate_zone_id is null
             and ST_Covers(uhz.geom::geography, pin.location)
          returning pin.id
        `;
        totalUpdated += r.length;
        const dt = Date.now() - t0;
        const tag = `${p.source ?? 'USDA-2023'} ${p.zone_code}`;
        console.log(
          `  ${tag.padEnd(20)} updated ${String(r.length).padStart(7)} in ${String(dt).padStart(5)}ms · running ${totalUpdated.toLocaleString()}`
        );
      } catch (e) {
        console.error(`  ${p.source ?? '?'} ${p.zone_code} FAILED: ${e.message}`);
      }
    }

    const totalSec = ((Date.now() - overall) / 1000).toFixed(1);
    console.log(`\nTotal pins zoned: ${totalUpdated.toLocaleString()} in ${totalSec}s`);

    const sample = await sql`
      select cz.code, count(*)::int as n
        from public.pins p
        join public.climate_zones cz on cz.id = p.climate_zone_id
       group by cz.code order by n desc limit 15
    `;
    console.log('\nTop zones by pin count:');
    for (const r of sample) console.log(`  ${r.code.padEnd(4)} ${r.n.toLocaleString()}`);
    const stillNull = await sql`select count(*)::int as n from public.pins where climate_zone_id is null`;
    console.log(`\nPins still unzoned (outside any polygon): ${stillNull[0].n.toLocaleString()}`);
  } finally {
    await sql.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
