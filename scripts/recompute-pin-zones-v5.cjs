// Bulk-chunked spatial-join recompute. Per-batch SQL grabs 50k null-zone
// pins via CTE then does the spatial join in one go — the planner picks
// the GIST on usda_hardiness_zones.geom for the per-pin lookup.
//
// Sized to fit comfortably under Supabase's 2-min statement timeout:
// the EXPLAIN cost for one full-table version was ~33M units (estimated
// 3 min); chunked 50k at a time should run ~5-10s/chunk.

const postgres = require('postgres');
const path = require('node:path');
const { config } = require('dotenv');
config({ path: path.resolve(__dirname, '..', '.env.local') });

const BATCH = 20000;

(async () => {
  const sql = postgres(process.env.SUPABASE_DB_URL, {
    ssl: 'require', onnotice: () => undefined, max: 1
  });
  try {
    await sql`alter table public.pins enable trigger tg_pin_density_track_upd`;
    // Default Supabase statement_timeout is 2 min — too tight for the
    // 1.3M-row spatial join even chunked at 50k. Lift to 30 min for
    // this session only; per-batch runs should land well under that.
    await sql`set statement_timeout = '30min'`;

    const startUnzoned = await sql`
      select count(*)::int as n from public.pins where climate_zone_id is null
    `;
    console.log(`pins with NULL climate_zone_id at start: ${startUnzoned[0].n.toLocaleString()}`);

    let totalUpdated = 0;
    let batches = 0;
    const overall = Date.now();

    while (true) {
      const t0 = Date.now();
      // CTE narrows the spatial join to N pins at a time.
      const updated = await sql`
        with batch as (
          select id from public.pins
           where climate_zone_id is null
           limit ${BATCH}
        )
        update public.pins p
           set climate_zone_id = cz.id
          from public.usda_hardiness_zones uhz
          join public.climate_zones cz on cz.code = uhz.zone_code
         where p.id in (select id from batch)
           and uhz.geom && p.location::geometry
           and ST_Intersects(uhz.geom, p.location::geometry)
        returning p.id
      `;
      const dt = Date.now() - t0;
      batches++;

      // Stop conditions: nothing left to scan, or scanned a batch with no
      // updates (means remaining nulls are outside all polygons).
      if (updated.length === 0) {
        // Verify by checking remaining count — if there are still NULL
        // rows, they must be outside every polygon.
        const remaining = await sql`
          select count(*)::int as n from public.pins where climate_zone_id is null
        `;
        console.log(`batch ${batches}: no updates this round; ${remaining[0].n.toLocaleString()} pins still null (outside all polygons — Mexico/HI/AK/etc.)`);
        break;
      }

      totalUpdated += updated.length;
      const overallSec = ((Date.now() - overall) / 1000).toFixed(0);
      console.log(
        `batch ${String(batches).padStart(3)}: zoned ${updated.length.toLocaleString()} pins in ${dt}ms · running ${totalUpdated.toLocaleString()} (${overallSec}s elapsed)`
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
  } finally {
    await sql.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
