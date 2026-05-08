const postgres = require('postgres');
const { config } = require('dotenv');
const path = require('path');
config({ path: path.resolve(__dirname, '..', '.env.local') });
const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined });
(async () => {
  // User's exact bbox
  const bbox = {
    minLng: -76.51308059692384,
    minLat: 42.435525137221845,
    maxLng: -76.48252487182619,
    maxLat: 42.452594621767815
  };
  for (const z of [13, 14, 15, 16, 17, 18]) {
    const r = await sql`
      select count(*)::int as n
        from public.public_pins_bbox(
          ${bbox.minLng}::float8, ${bbox.minLat}::float8,
          ${bbox.maxLng}::float8, ${bbox.maxLat}::float8,
          15000, ${z}::int
        )
    `;
    const flag = r[0].n > 1000 ? '  ← exceeds 1000 cap' : '';
    console.log(`  z${z}: ${r[0].n} rows${flag}`);
  }
  await sql.end();
})();
