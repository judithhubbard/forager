// Backfill pins.climate_zone_id by running zone_for_point on each
// pin's location and matching against climate_zones.code. Paginated
// so it doesn't blow the per-statement timeout.
//
// Idempotent: only updates pins where climate_zone_id is null. Safe
// to re-run after later imports add new pins (the trigger from
// migration 23 maintains zone on insert/update-of-location, but
// in-flight pins from before the trigger landed need this script).
//
// Run:
//   npm run backfill:pin-zones

import postgres from 'postgres';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: resolve(process.cwd(), '.env.local') });
loadEnv({ path: resolve(process.cwd(), '.env') });

async function main(): Promise<void> {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) throw new Error('SUPABASE_DB_URL missing.');
  const sql = postgres(dbUrl, { ssl: 'require', onnotice: () => undefined });
  try {
    const { remaining } = (await sql<{ remaining: number }[]>`
      select count(*)::int as remaining
        from public.pins where climate_zone_id is null
    `)[0];
    console.log(`Pins missing climate_zone_id: ${remaining}`);

    // Iterate via id-cursor so we process every still-null pin
    // exactly once. If we paged via `where climate_zone_id is null
    // limit N` instead, an unlucky page that's all out-of-dataset
    // (Toronto, Alaska) would yield zero matches and prematurely
    // exit the loop while in-dataset pins on a later page sat
    // unprocessed. Cursor-paged is deterministic.
    const BATCH = 5000;
    let updated = 0;
    let pass = 0;
    let cursor = '00000000-0000-0000-0000-000000000000';
    while (true) {
      pass++;
      const t = Date.now();
      const r = await sql<{ id: string; matched: boolean }[]>`
        with batch as (
          select p.id, public.zone_for_point(
            ST_X(p.location::geometry),
            ST_Y(p.location::geometry)
          ) as zc
            from public.pins p
           where p.climate_zone_id is null
             and p.id > ${cursor}::uuid
           order by p.id
           limit ${BATCH}
        ),
        upd as (
          update public.pins p
             set climate_zone_id = cz.id
            from batch b
            join public.climate_zones cz on cz.code = b.zc
           where p.id = b.id
          returning p.id
        )
        select b.id, (u.id is not null) as matched
          from batch b
          left join upd u on u.id = b.id
         order by b.id
      `;
      if (r.length === 0) break;
      const matched = r.filter((row) => row.matched).length;
      updated += matched;
      cursor = r[r.length - 1].id;
      console.log(
        `  pass ${pass}: matched ${matched}/${r.length} ` +
        `(${updated} updated total) ${Date.now() - t}ms`
      );
    }
    console.log(`\nDone. ${updated} pins matched a USDA zone.`);

    // Show what's null and where they cluster.
    const orphans = await sql`
      select coalesce(import_source, '(user)') as src, count(*)::int as n
        from public.pins where climate_zone_id is null
        group by 1 order by 2 desc limit 10`;
    console.log('Pins still without a zone (outside USDA dataset):');
    console.table(orphans);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('Pin-zone backfill failed:', err);
  process.exit(1);
});
