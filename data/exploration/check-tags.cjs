const postgres = require('postgres');
const { config } = require('dotenv');
const path = require('path');
config({ path: path.resolve(__dirname, '../../.env.local') });
const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined });
(async () => {
  const r = await sql`
    select scientific_name, common_name, interest_tags, forage_parts
      from species
     where scientific_name in (
       'Pinus strobus', 'Pinus edulis', 'Tsuga canadensis', 'Tilia americana',
       'Acer saccharum', 'Acer rubrum', 'Quercus alba'
     )
     order by scientific_name
  `;
  for (const x of r) {
    console.log(`${x.scientific_name}:`);
    console.log(`  category: ${x.category}`);
    console.log(`  forage_parts: ${JSON.stringify(x.forage_parts)}`);
    console.log(`  interest_tags: ${JSON.stringify(x.interest_tags)}`);
  }
  await sql.end();
})();
