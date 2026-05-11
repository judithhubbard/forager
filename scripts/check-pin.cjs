const postgres = require('postgres');
const { config } = require('dotenv');
const path = require('path');
config({ path: path.resolve(__dirname, '..', '.env.local') });
const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined });
(async () => {
  const id = process.argv[2] || 'f58b975e';
  const r = await sql`
    select p.id, p.import_source, p.import_external_id, p.region_id, r.name as region_name,
           ST_Y(p.location::geometry) as lat, ST_X(p.location::geometry) as lng,
           p.species_id, s.scientific_name, s.common_name,
           p.created_at, p.updated_at, p.visibility, p.status
      from public.pins p
      left join public.regions r on r.id = p.region_id
      left join public.species s on s.id = p.species_id
     where p.id::text like ${id + '%'}
     limit 5
  `;
  for (const x of r) console.log(JSON.stringify(x, null, 2));
  await sql.end();
})();
