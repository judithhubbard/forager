// Per-pin zone recompute via direct spatial join. zone_for_point() in
// v3 wasn't being inlined by the planner — each evaluation triggered
// its own GIST query, but the outer UPDATE had no plan visibility into
// that, so 5000 pins took >5 minutes per batch.
//
// This version does the spatial join inline so the planner sees the
// GIST on usda_hardiness_zones.geom and uses it for a hash/index spatial
// join across the batch in one pass.

const postgres = require('postgres');
const path = require('node:path');
const { config } = require('dotenv');
config({ path: path.resolve(__dirname, '..', '.env.local') });

const BATCH = 2000;

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

    let totalUpdated = 0;
    let lastId = '00000000-0000-0000-0000-000000000000';
    let batches = 0;
    const overall = Date.now();

    while (true) {
      const ids = await sql`
        select id from public.pins
         where climate_zone_id is null and id > ${lastId}
         order by id
         limit ${BATCH}
      `;
      if (ids.length === 0) break;
      lastId = ids[ids.length - 1].id;

      const t0 = Date.now();
      const updated = await sql`
        update public.pins p
           set climate_zone_id = cz.id
          from public.usda_hardiness_zones uhz
          join public.climate_zones cz on cz.code = uhz.zone_code
         where p.id = any(${ids.map((r) => r.id)})
           and p.climate_zone_id is null
           and uhz.geom && p.location::geometry
           and ST_Intersects(uhz.geom, p.location::geometry)
        returning p.id
      `;
      const dt = Date.now() - t0;
      totalUpdated += updated.length;
      batches++;
      const overallSec = ((Date.now() - overall) / 1000).toFixed(0);
      console.log(
        `batch ${String(batches).padStart(4)}: scanned ${ids.length}, zoned ${String(updated.length).padStart(4)} in ${String(dt).padStart(4)}ms · running ${totalUpdated.toLocaleString()} (${overallSec}s elapsed)`
      );
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
