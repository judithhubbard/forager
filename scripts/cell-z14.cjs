const postgres = require('postgres');
const { config } = require('dotenv');
const path = require('path');
config({ path: path.resolve(__dirname, '..', '.env.local') });
const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined });
(async () => {
  const t = (await sql`
    select id, ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat
      from public.pins where id::text like '98b2678e%' limit 1
  `)[0];
  // z14 cell = 0.0016°. Find all pins in target's z14 cell.
  const cell14 = await sql`
    select id::text as id, hashtextextended(id::text, 0) as h
      from public.pins
     where visibility = 'public'
       and ST_AsText(ST_SnapToGrid(location::geometry, 0.0016, 0.0016)) =
           ST_AsText(ST_SnapToGrid(ST_SetSRID(ST_MakePoint(${t.lng}, ${t.lat}), 4326), 0.0016, 0.0016))
     order by h
  `;
  console.log(`Target ${t.id.slice(0,8)} at (${Number(t.lat).toFixed(6)}, ${Number(t.lng).toFixed(6)})`);
  console.log(`z14 cell (180m): ${cell14.length} pins`);
  for (const p of cell14.slice(0, 10)) {
    console.log(`  ${p.id.slice(0,8)} h=${p.h}${p.id.startsWith('98b2678e') ? '  ← TARGET' : ''}`);
  }
  console.log(`Winner: ${cell14[0].id.slice(0,8)} ${cell14[0].id.startsWith('98b2678e') ? '(target)' : '(NOT target — that is why it disappears at z14)'}`);
  await sql.end();
})();
