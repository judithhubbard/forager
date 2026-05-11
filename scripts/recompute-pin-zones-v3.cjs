// Per-pin zone recompute via the indexed zone_for_point() lookup.
// The v2 polygon-by-polygon approach was efficient when usda_hardiness_zones
// had only US polygons (most pins already correctly zoned, so the where
// clause filtered to no-ops); with Canadian polygons added, the update
// scans got too slow on dense vertex counts.
//
// This version paginates over pins.climate_zone_id IS NULL, doing a
// single per-row update that uses the GIST index on usda_hardiness_zones
// for an O(log n) point-in-polygon lookup.

const postgres = require('postgres');
const path = require('node:path');
const { config } = require('dotenv');
config({ path: path.resolve(__dirname, '..', '.env.local') });

const BATCH = 5000;

(async () => {
  const sql = postgres(process.env.SUPABASE_DB_URL, {
    ssl: 'require', onnotice: () => undefined, max: 1
  });
  try {
    // Make sure the density trigger is re-enabled (the v2 run disabled it).
    await sql`alter table public.pins enable trigger tg_pin_density_track_upd`;

    const startUnzoned = await sql`
      select count(*)::int as n from public.pins where climate_zone_id is null
    `;
    console.log(`pins with NULL climate_zone_id at start: ${startUnzoned[0].n.toLocaleString()}`);

    let totalUpdated = 0;
    let lastId = '00000000-0000-0000-0000-000000000000';
    let batches = 0;

    while (true) {
      // Keyset pagination on id so we don't repeat scanning the table.
      const ids = await sql`
        select id from public.pins
         where climate_zone_id is null and id > ${lastId}
         order by id
         limit ${BATCH}
      `;
      if (ids.length === 0) break;
      lastId = ids[ids.length - 1].id;

      const t0 = Date.now();
      // Subquery evaluates zone_for_point once per pin, not once per
      // (pin × climate_zones) pair. ~10x faster than the join form.
      const updated = await sql`
        update public.pins p
           set climate_zone_id = (
             select cz.id from public.climate_zones cz
              where cz.code = public.zone_for_point(
                ST_X(p.location::geometry),
                ST_Y(p.location::geometry)
              )
              limit 1
           )
         where p.id = any(${ids.map((r) => r.id)})
           and p.climate_zone_id is null
        returning p.id
      `;
      const dt = Date.now() - t0;
      totalUpdated += updated.length;
      batches++;
      if (batches % 5 === 0 || updated.length < ids.length) {
        console.log(
          `batch ${batches}: scanned ${ids.length} pins, zoned ${updated.length} in ${dt}ms (running ${totalUpdated.toLocaleString()})`
        );
      }
    }

    console.log(`\nTotal pins zoned: ${totalUpdated.toLocaleString()}`);

    const sample = await sql`
      select cz.code, count(*)::int as n
        from public.pins p
        join public.climate_zones cz on cz.id = p.climate_zone_id
       group by cz.code order by n desc limit 15
    `;
    console.log('\nTop zones by pin count:');
    for (const r of sample) console.log(`  ${r.code.padEnd(4)} ${r.n.toLocaleString()}`);
    const stillNull = await sql`select count(*)::int as n from public.pins where climate_zone_id is null`;
    console.log(`\nPins still unzoned (outside any polygon — Mexico/HI/AK/etc.): ${stillNull[0].n.toLocaleString()}`);
  } finally {
    await sql.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
