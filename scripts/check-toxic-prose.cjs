const postgres = require('postgres');
const { config } = require('dotenv');
const path = require('path');
config({ path: path.resolve(__dirname, '..', '.env.local') });
const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined });
(async () => {
  const r = await sql`
    select scientific_name, common_name, toxicity_notes
      from species
     where toxicity_notes is not null
       and (toxicity_notes ilike 'Only %' or toxicity_notes ilike 'just %'
            or toxicity_notes ilike '% are edible%'
            or toxicity_notes ilike '% is edible%')
     order by scientific_name
  `;
  console.log(`${r.length} species with potentially-misleading toxicity_notes:\n`);
  for (const x of r) {
    console.log(`${x.scientific_name} (${x.common_name})`);
    console.log(`  ${x.toxicity_notes}\n`);
  }
  await sql.end();
})();
