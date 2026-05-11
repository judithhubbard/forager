const postgres = require('postgres');
const { config } = require('dotenv');
const path = require('path');
config({ path: path.resolve(__dirname, '..', '.env.local') });
const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined });
(async () => {
  const t = (await sql`
    select id, ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat,
           import_source, region_id, visibility, status,
           hashtextextended(id::text, 0) as h
      from public.pins where id::text like '98b2678e%' limit 1
  `)[0];
  if (!t) { console.log('not found'); await sql.end(); return; }
  console.log(`Target: ${t.id}\n  loc=(${Number(t.lat).toFixed(6)}, ${Number(t.lng).toFixed(6)})  vis=${t.visibility}  status=${t.status}  src=${t.import_source}`);

  // Replay the user's exact request from devtools.
  const halfLng = 0, halfLat = 0;
  void halfLng; void halfLat;
  const bbox = {
    minLng: Number(t.lng) - halfLng, minLat: Number(t.lat) - halfLat,
    maxLng: Number(t.lng) + halfLng, maxLat: Number(t.lat) + halfLat
  };
  const inResult = await sql`
    select bool_or(id::text like '98b2678e%') as has_target,
           count(*)::int as n
      from public.public_pins_bbox(
        ${bbox.minLng}::float8, ${bbox.minLat}::float8,
        ${bbox.maxLng}::float8, ${bbox.maxLat}::float8,
        12000, 15
      )
  `;
  console.log(`\npublic_pins_bbox(z=15, max=12000): ${inResult[0].n} rows, contains target: ${inResult[0].has_target}`);

  const cellPins = await sql`
    select id::text as id, hashtextextended(id::text, 0) as h
      from public.pins
     where visibility = 'public'
       and ST_AsText(ST_SnapToGrid(location::geometry, 0.0004, 0.0004)) =
           ST_AsText(ST_SnapToGrid(ST_SetSRID(ST_MakePoint(${t.lng}, ${t.lat}), 4326), 0.0004, 0.0004))
     order by h
  `;
  console.log(`\nz15 cell members (sorted by hash):`);
  for (const p of cellPins.slice(0, 10)) {
    console.log(`  ${p.id.slice(0, 8)}... h=${p.h}${p.id.startsWith('98b2678e') ? '  ← TARGET' : ''}`);
  }
  console.log(`Cell has ${cellPins.length} pins; winner is ${cellPins[0].id.slice(0, 8)}`);

  // What position is target in the bbox results, ranked by hash?
  const ranked = await sql`
    select id::text as id
      from public.public_pins_bbox(
        ${bbox.minLng}::float8, ${bbox.minLat}::float8,
        ${bbox.maxLng}::float8, ${bbox.maxLat}::float8,
        15000, 15
      )
  `;
  const idx = ranked.findIndex((r) => r.id.startsWith('98b2678e'));
  console.log(`\nPosition of target in z15 result: ${idx >= 0 ? idx + 1 : '<not in result>'} of ${ranked.length}`);

  // What's in target's cell at z16 (smaller — 22m)?
  const cell16 = await sql`
    select id::text as id, hashtextextended(id::text, 0) as h
      from public.pins
     where visibility = 'public'
       and ST_AsText(ST_SnapToGrid(location::geometry, 0.0002, 0.0002)) =
           ST_AsText(ST_SnapToGrid(ST_SetSRID(ST_MakePoint(${t.lng}, ${t.lat}), 4326), 0.0002, 0.0002))
     order by h
  `;
  console.log(`\nz16 cell members:`);
  for (const p of cell16.slice(0, 5)) {
    console.log(`  ${p.id.slice(0, 8)}... h=${p.h}${p.id.startsWith('98b2678e') ? '  ← TARGET' : ''}`);
  }
  console.log(`z16 cell winner: ${cell16[0].id.slice(0, 8)}${cell16[0].id.startsWith('98b2678e') ? ' (target)' : ' (NOT target)'}`);

  await sql.end();
})();
