const postgres = require('postgres');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { config: loadEnv } = require('dotenv');
loadEnv({ path: resolve(process.cwd(), '.env.local') });
const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined });
async function main() {
  const sqlText = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260507000044_clarify_toxicity_prose.sql'), 'utf8');
  console.log('Applying migration 44 (clarify toxicity prose)…');
  await sql.unsafe(sqlText);
  await sql`insert into supabase_migrations.schema_migrations (version) values ('20260507000044') on conflict (version) do nothing`;
  await sql.end();
  console.log('Done.');
}
main().catch(e => { console.error(e); process.exit(1); });
