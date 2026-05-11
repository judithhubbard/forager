const postgres = require('postgres');
const { config } = require('dotenv');
const path = require('path');
config({ path: path.resolve(__dirname, '../../.env.local') });
const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined });
(async () => {
  const r = await sql`
    select unnest(forage_parts) as part, count(*)::int as n
      from species
     group by 1
     order by 2 desc
  `;
  for (const x of r) console.log(`  ${x.part.padEnd(15)} ${x.n}`);
  await sql.end();
})();
