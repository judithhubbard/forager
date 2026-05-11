const postgres = require('postgres');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { config: loadEnv } = require('dotenv');
loadEnv({ path: resolve(process.cwd(), '.env.local') });
const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined });
async function main() {
  const sqlText = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260507000043_dryad_tighten_outliers.sql'),
    'utf8'
  );
  console.log('Counting Dryad pins beyond 30km from city centroid (pre-cleanup)…');
  const before = await sql`
    select count(*)::int as n_total,
           count(*) filter (where dist_m > 30000)::int as n_over_30
      from (
        select p.id,
               ST_Distance(p.location,
                 ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography) as dist_m
          from public.pins p
          join (values
            ('dryad-trees-rochester', 43.1566, -77.6088),
            ('dryad-trees-houston', 29.7604, -95.3698),
            ('dryad-trees-des-moines', 41.5868, -93.6250),
            ('dryad-trees-milwaukee', 43.0389, -87.9065)
          ) as c(src, lat, lng) on c.src = p.import_source
      ) q
  `;
  console.log(`  sample 4 cities: ${before[0].n_over_30} over 30km of ${before[0].n_total}`);

  console.log('Applying migration 43 (tighten Dryad outliers)…');
  await sql.unsafe(sqlText);
  await sql`insert into supabase_migrations.schema_migrations (version) values ('20260507000043') on conflict (version) do nothing`;
  const after = await sql`select count(*)::int as n from public.pins where import_source like 'dryad-trees-%'`;
  console.log(`Total Dryad pins after cleanup: ${after[0].n.toLocaleString()}`);
  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
