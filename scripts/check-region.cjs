const postgres = require('postgres');
const { config } = require('dotenv');
const path = require('path');
config({ path: path.resolve(__dirname, '..', '.env.local') });
const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined });
(async () => {
  const r = await sql`select id, name from regions order by name`;
  for (const x of r) console.log(`  ${x.id}  ${x.name}`);
  await sql.end();
})();
