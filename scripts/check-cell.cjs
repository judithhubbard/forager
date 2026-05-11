const postgres = require('postgres');
const { config } = require('dotenv');
const path = require('path');
config({ path: path.resolve(__dirname, '..', '.env.local') });
const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined });
(async () => {
  const target = await sql`
    select id, ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat,
           import_source, species_id, visibility
      from public.pins
     where id::text like 'f322b8fa%'
     limit 1
  `;
  if (target.length === 0) { console.log('not found'); await sql.end(); return; }
  const t = target[0];
  console.log(`Target pin: ${t.id}`);
  console.log(`  loc: ${t.lat}, ${t.lng}`);
  console.log(`  visibility: ${t.visibility}, import_source: ${t.import_source}`);

  // Pins in same z15 (45m / 0.0004°) cell
  const neighbors = await sql`
    select id::text as id,
           ST_X(location::geometry) as lng,
           ST_Y(location::geometry) as lat,
           hashtextextended(id::text, 0) as h
      from public.pins
     where visibility = 'public'
       and ST_AsText(ST_SnapToGrid(location::geometry, 0.0004, 0.0004)) =
           ST_AsText(ST_SnapToGrid(ST_SetSRID(ST_MakePoint(${t.lng}, ${t.lat}), 4326), 0.0004, 0.0004))
     order by h
  `;
  console.log(`  ${neighbors.length} pins in same z15 cell, sorted by hash:`);
  for (const n of neighbors.slice(0, 10)) {
    const distM = Math.sqrt(
      Math.pow((Number(n.lng) - Number(t.lng)) * 82200, 2) +
      Math.pow((Number(n.lat) - Number(t.lat)) * 111320, 2)
    );
    const flag = n.id.startsWith('f322b8fa') ? '  ← TARGET' : '';
    console.log(`    ${n.id.slice(0, 8)} at (${Number(n.lat).toFixed(6)}, ${Number(n.lng).toFixed(6)}) — ${distM.toFixed(1)}m away${flag}`);
  }
  console.log(`  hash winner: ${neighbors[0].id}`);
  await sql.end();
})();
