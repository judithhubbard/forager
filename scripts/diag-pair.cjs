// Compare two pins user reports are both visible at z15.
// If decimation works, two pins within 45m should land in the same
// cell and only one should render. If both render, something is
// off (different cells despite proximity, or both are passing
// through region path while public path is the only decimated one).

const postgres = require('postgres');
const { config } = require('dotenv');
const path = require('path');
config({ path: path.resolve(__dirname, '..', '.env.local') });
const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined });

(async () => {
  const ids = ['1827defd', 'c04fba98'];
  const pins = [];
  for (const idp of ids) {
    const r = (await sql`
      select id, ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat,
             import_source, region_id, visibility, status,
             ST_AsText(ST_SnapToGrid(location::geometry, 0.0004, 0.0004)) as cell15,
             ST_AsText(ST_SnapToGrid(location::geometry, 0.00020, 0.00020)) as cell16,
             hashtextextended(id::text, 0) as h
        from public.pins where id::text like ${idp + '%'} limit 1
    `)[0];
    if (!r) { console.log(`${idp}: not found`); continue; }
    pins.push(r);
  }
  if (pins.length !== 2) { await sql.end(); return; }
  const [a, b] = pins;
  const distM = Math.sqrt(
    Math.pow((Number(b.lng) - Number(a.lng)) * 82200, 2) +
    Math.pow((Number(b.lat) - Number(a.lat)) * 111320, 2)
  );
  console.log(`A: ${a.id.slice(0,8)} loc=(${Number(a.lat).toFixed(6)}, ${Number(a.lng).toFixed(6)}) vis=${a.visibility} src=${a.import_source}`);
  console.log(`   z15 cell=${a.cell15}  z16 cell=${a.cell16}  hash=${a.h}`);
  console.log(`B: ${b.id.slice(0,8)} loc=(${Number(b.lat).toFixed(6)}, ${Number(b.lng).toFixed(6)}) vis=${b.visibility} src=${b.import_source}`);
  console.log(`   z15 cell=${b.cell15}  z16 cell=${b.cell16}  hash=${b.h}`);
  console.log(`\nDistance: ${distM.toFixed(1)}m apart`);
  console.log(`Same z15 cell? ${a.cell15 === b.cell15 ? 'YES — only one should render' : 'NO — both render legitimately'}`);
  console.log(`Same z16 cell? ${a.cell16 === b.cell16 ? 'YES' : 'NO'}`);

  await sql.end();
})();
