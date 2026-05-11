// One-shot bulk recompute via geography-typed spatial join.
//
// The previous versions all used `ST_Intersects(uhz.geom, p.location::geometry)`,
// which casts pins.location (geography) to geometry and prevents postgres
// from using the existing geography GIST on pins.location. EXPLAIN cost
// for that plan: 33M units → ~5h actual.
//
// `ST_Covers(uhz.geom::geography, p.location)` keeps both sides as geography
// so the planner picks Nested Loop with Index Scan on pins_location_idx,
// per polygon. EXPLAIN cost: 153k units (220x cheaper). Runs in minutes.

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
    await sql`set statement_timeout = '30min'`;

    const startUnzoned = await sql`
      select count(*)::int as n from public.pins where climate_zone_id is null
    `;
    console.log(`pins with NULL climate_zone_id at start: ${startUnzoned[0].n.toLocaleString()}`);

    const t0 = Date.now();
    const updated = await sql`
      update public.pins p
         set climate_zone_id = cz.id
        from public.usda_hardiness_zones uhz
        join public.climate_zones cz on cz.code = uhz.zone_code
       where p.climate_zone_id is null
         and ST_Covers(uhz.geom::geography, p.location)
      returning p.id
    `;
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\nUpdated ${updated.length.toLocaleString()} pins in ${dt}s`);

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
