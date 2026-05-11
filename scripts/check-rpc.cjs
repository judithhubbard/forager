// Call the live RPC with the user's likely z15 bbox over Ithaca
// and check whether f322b8fa is returned.
const postgres = require('postgres');
const { config } = require('dotenv');
const path = require('path');
config({ path: path.resolve(__dirname, '..', '.env.local') });
const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined });
(async () => {
  // ~z15 bbox roughly centered on Ithaca downtown, 1km × 0.5km
  const bbox = { minLng: -76.51, minLat: 42.43, maxLng: -76.48, maxLat: 42.46 };
  console.log(`Bbox: ${JSON.stringify(bbox)}`);

  const out = await sql`
    select count(*)::int as n,
           bool_or(id::text like 'f322b8fa%') as has_target
      from public.public_pins_bbox(
        ${bbox.minLng}::float8, ${bbox.minLat}::float8,
        ${bbox.maxLng}::float8, ${bbox.maxLat}::float8,
        2500, 15
      )
  `;
  console.log(`At z15: ${out[0].n} pins returned, contains f322b8fa: ${out[0].has_target}`);

  const out16 = await sql`
    select count(*)::int as n,
           bool_or(id::text like 'f322b8fa%') as has_target
      from public.public_pins_bbox(
        ${bbox.minLng}::float8, ${bbox.minLat}::float8,
        ${bbox.maxLng}::float8, ${bbox.maxLat}::float8,
        2500, 16
      )
  `;
  console.log(`At z16: ${out16[0].n} pins returned, contains f322b8fa: ${out16[0].has_target}`);

  // Total eligible pins in bbox (no cap, no decimation)
  const total = await sql`
    select count(*)::int as n
      from public.pins
     where visibility = 'public'
       and location && ST_MakeEnvelope(
             ${bbox.minLng}, ${bbox.minLat}, ${bbox.maxLng}, ${bbox.maxLat}, 4326
           )
  `;
  console.log(`Eligible pins in bbox (no cap): ${total[0].n}`);

  // Verify target is in bbox
  const target = await sql`
    select id, ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat,
           ST_X(location::geometry) between ${bbox.minLng} and ${bbox.maxLng}
             and ST_Y(location::geometry) between ${bbox.minLat} and ${bbox.maxLat} as in_bbox
      from public.pins
     where id::text like 'f322b8fa%'
  `;
  console.log(`Target ${target[0].id}: in_bbox=${target[0].in_bbox} loc=(${Number(target[0].lat).toFixed(6)}, ${Number(target[0].lng).toFixed(6)})`);

  await sql.end();
})();
