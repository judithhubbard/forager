const postgres = require('postgres');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { config: loadEnv } = require('dotenv');
loadEnv({ path: resolve(process.cwd(), '.env.local') });
const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined });
async function main() {
  const sqlText = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260507000042_tier5b_followup.sql'),
    'utf8'
  );
  console.log('Applying migration 42 (Tier-5b)…');
  await sql.unsafe(sqlText);
  await sql`insert into supabase_migrations.schema_migrations (version) values ('20260507000042') on conflict (version) do nothing`;
  const totals = await sql`select count(*)::int as n from public.species`;
  console.log(`Total species after Tier-5b: ${totals[0].n}`);
  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
