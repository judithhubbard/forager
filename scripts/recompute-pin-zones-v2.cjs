// Faster pin-zone recompute via per-polygon updates. The previous
// per-row `zone_for_point()` call was O(N pins × polygon checks)
// and tripped the statement timeout. With 19 zones in the new
// dataset, doing 19 updates (one per polygon) lets each update
// use the GIST index on usda_hardiness_zones.geom + the GIST on
// pins.location for an efficient spatial join.

const postgres = require('postgres');
const path = require('node:path');
const { config } = require('dotenv');

config({ path: path.resolve(__dirname, '..', '.env.local') });

(async () => {
  const sql = postgres(process.env.SUPABASE_DB_URL, {
    ssl: 'require', onnotice: () => undefined, max: 1
  });
  try {
    const zones = await sql`
      select uhz.zone_code, cz.id as climate_zone_id
        from public.usda_hardiness_zones uhz
        join public.climate_zones cz on cz.code = uhz.zone_code
       order by uhz.zone_code
    `;
    console.log(`Recomputing pin zones across ${zones.length} polygons…`);

    await sql`alter table public.pins disable trigger tg_pin_density_track_upd`;
    let totalChanged = 0;
    for (const z of zones) {
      // Update all pins whose location ST_Within the polygons of
      // this zone. ST_Intersects + && bbox prefilter via GIST is fast.
      const r = await sql`
        update public.pins p
           set climate_zone_id = ${z.climate_zone_id}
          from public.usda_hardiness_zones uhz
         where uhz.zone_code = ${z.zone_code}
           and uhz.geom && p.location::geometry
           and ST_Intersects(uhz.geom, p.location::geometry)
           and (p.climate_zone_id is null
                or p.climate_zone_id <> ${z.climate_zone_id})
        returning p.id
      `;
      totalChanged += r.length;
      console.log(`  ${z.zone_code.padEnd(4)} updated ${r.length.toLocaleString()} pins (running ${totalChanged.toLocaleString()})`);
    }
    await sql`alter table public.pins enable trigger tg_pin_density_track_upd`;

    const sample = await sql`
      select cz.code, count(*)::int as n
        from public.pins p
        join public.climate_zones cz on cz.id = p.climate_zone_id
       group by cz.code order by n desc limit 12
    `;
    console.log('\nTop zones by pin count after recompute:');
    for (const r of sample) console.log(`  ${r.code.padEnd(4)} ${r.n.toLocaleString()}`);
    const unzoned = await sql`select count(*)::int as n from public.pins where climate_zone_id is null`;
    console.log(`Pins still unzoned (outside CONUS polygons): ${unzoned[0].n.toLocaleString()}`);
  } finally {
    await sql.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
