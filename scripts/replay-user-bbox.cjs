// Replay the user's exact request from devtools.
const postgres = require('postgres');
const { config } = require('dotenv');
const path = require('path');
config({ path: path.resolve(__dirname, '..', '.env.local') });
const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined });
(async () => {
  // From the user's devtools payload:
  const params = {
    p_min_lng: -76.51308059692384,
    p_min_lat: 42.435525137221845,
    p_max_lng: -76.48252487182619,
    p_max_lat: 42.452594621767815,
    p_max_rows: 12000,
    p_zoom: 18
  };
  console.log('Replay params:', params);

  const result = await sql`
    select bool_or(id::text like '98b2678e%') as has_target,
           count(*)::int as n
      from public.public_pins_bbox(
        ${params.p_min_lng}::float8,
        ${params.p_min_lat}::float8,
        ${params.p_max_lng}::float8,
        ${params.p_max_lat}::float8,
        ${params.p_max_rows}::int,
        ${params.p_zoom}::int
      )
  `;
  console.log(`Result: ${result[0].n} rows, contains 98b2678e: ${result[0].has_target}`);

  // Sanity: target lat/lng vs bbox?
  const target = (await sql`
    select id, ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng,
           ST_Y(location::geometry) between ${params.p_min_lat} and ${params.p_max_lat} as lat_in,
           ST_X(location::geometry) between ${params.p_min_lng} and ${params.p_max_lng} as lng_in
      from public.pins where id::text like '98b2678e%' limit 1
  `)[0];
  console.log(`Target: (${Number(target.lat).toFixed(6)}, ${Number(target.lng).toFixed(6)})  lat_in=${target.lat_in}  lng_in=${target.lng_in}`);

  // Find target's position in the result (PostgREST may cap at 1000 by default)
  const ranked = await sql`
    select id::text as id
      from public.public_pins_bbox(
        ${params.p_min_lng}::float8, ${params.p_min_lat}::float8,
        ${params.p_max_lng}::float8, ${params.p_max_lat}::float8,
        ${params.p_max_rows}::int, ${params.p_zoom}::int
      )
  `;
  const idx = ranked.findIndex((r) => r.id.startsWith('98b2678e'));
  console.log(`Target position in result: ${idx + 1} of ${ranked.length}`);
  if (idx + 1 > 1000) console.log(`  → BEYOND PostgREST default 1000-row cap!`);

  await sql.end();
})();
