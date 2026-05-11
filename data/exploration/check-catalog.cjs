const postgres = require('postgres');
const { config } = require('dotenv');
const path = require('path');
config({ path: path.resolve(__dirname, '../../.env.local') });
const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined });
(async () => {
  const r = await sql`
    select scientific_name, common_name from species
     where lower(scientific_name) similar to '(pinus|picea|tsuga|ulmus|fraxinus|populus|tilia|salix|larix|acer|abies|betula|quercus|gleditsia)%'
     order by scientific_name
  `;
  for (const x of r) console.log(`  ${x.scientific_name.padEnd(30)} (${x.common_name})`);
  await sql.end();
})();
