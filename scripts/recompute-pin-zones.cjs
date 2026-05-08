// Batched recompute of pins.climate_zone_id after the USDA 2023
// polygon swap (apply-usda-2023.cjs ran the polygon insert but its
// single-statement UPDATE on 2.2M rows hit the statement timeout).
// Process in chunks of 50k, sleeping briefly between batches so we
// don't lock the table for too long at a stretch.

const postgres = require('postgres');
const path = require('node:path');
const { config } = require('dotenv');

config({ path: path.resolve(__dirname, '..', '.env.local') });

const BATCH = 50000;

(async () => {
  const sql = postgres(process.env.SUPABASE_DB_URL, {
    ssl: 'require', onnotice: () => undefined, max: 1
  });
  try {
    const total = await sql`select count(*)::int as n from public.pins`;
    console.log(`Recomputing climate_zone_id for ${total[0].n.toLocaleString()} pins…`);

    await sql`alter table public.pins disable trigger tg_pin_density_track_upd`;
    let processed = 0;
    let totalChanged = 0;
    while (true) {
      const batch = await sql`
        with target as (
          select p.id
            from public.pins p
           where (p.climate_zone_id is null
                  or p.climate_zone_id <> coalesce(
                       (select cz.id from public.climate_zones cz
                          where cz.code = public.zone_for_point(
                            ST_X(p.location::geometry),
                            ST_Y(p.location::geometry)
                          ) limit 1),
                       p.climate_zone_id))
           limit ${BATCH}
        )
        update public.pins p
           set climate_zone_id = (
             select cz.id from public.climate_zones cz
              where cz.code = public.zone_for_point(
                      ST_X(p.location::geometry),
                      ST_Y(p.location::geometry)
                    )
              limit 1
           )
          from target
         where p.id = target.id
        returning p.id
      `;
      processed += BATCH;
      totalChanged += batch.length;
      console.log(`  batch ${(processed / BATCH).toLocaleString()}: ${batch.length.toLocaleString()} updated (running total ${totalChanged.toLocaleString()})`);
      if (batch.length === 0) break;
    }
    await sql`alter table public.pins enable trigger tg_pin_density_track_upd`;

    // Spot check
    const ithaca = await sql`select public.zone_for_point(-76.5, 42.45) as zone`;
    console.log(`\nIthaca centroid (-76.5, 42.45) is now zone ${ithaca[0].zone}`);
    const sample = await sql`
      select cz.code, count(*)::int as n
        from public.pins p
        join public.climate_zones cz on cz.id = p.climate_zone_id
       group by cz.code order by n desc limit 12
    `;
    console.log('Top zones by pin count:');
    for (const r of sample) console.log(`  ${r.code.padEnd(4)} ${r.n.toLocaleString()}`);
  } finally {
    await sql.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
