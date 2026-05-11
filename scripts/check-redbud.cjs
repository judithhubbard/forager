const postgres = require('postgres');
const { config } = require('dotenv');
const path = require('path');
config({ path: path.resolve(__dirname, '..', '.env.local') });
const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined });
(async () => {
  const r = await sql`select scientific_name, common_name, safety_notes, toxicity_notes, usage_notes, harvest_tips, forage_parts from species where scientific_name = 'Cercis canadensis'`;
  for (const x of r) {
    console.log(`scientific: ${x.scientific_name}`);
    console.log(`common:     ${x.common_name}`);
    console.log(`forage_parts: ${JSON.stringify(x.forage_parts)}`);
    console.log(`safety_notes: ${JSON.stringify(x.safety_notes)}`);
    console.log(`toxicity_notes: ${JSON.stringify(x.toxicity_notes)}`);
    console.log(`usage_notes: ${(x.usage_notes || '').slice(0, 200)}`);
    console.log(`harvest_tips: ${(x.harvest_tips || '').slice(0, 200)}`);
  }
  await sql.end();
})();
