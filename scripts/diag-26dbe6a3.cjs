const postgres = require('postgres');
const { createClient } = require('@supabase/supabase-js');
const { config } = require('dotenv');
const path = require('path');
config({ path: path.resolve(__dirname, '..', '.env.local') });

const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined });
const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.PUBLIC_SUPABASE_ANON_KEY);

(async () => {
  const t = (await sql`
    select id, ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat,
           import_source, region_id, visibility, status
      from public.pins where id::text like '26dbe6a3%' limit 1
  `)[0];
  if (!t) { console.log('not found'); await sql.end(); return; }
  console.log(`Target: ${t.id}\n  loc=(${Number(t.lat).toFixed(6)}, ${Number(t.lng).toFixed(6)})  vis=${t.visibility}  status=${t.status}  src=${t.import_source}`);

  // What's in target's z15 cell? Grid 0.0004° = 45m
  const cell15 = await sql`
    select id::text as id, hashtextextended(id::text, 0) as h
      from public.pins
     where visibility = 'public'
       and ST_AsText(ST_SnapToGrid(location::geometry, 0.0004, 0.0004)) =
           ST_AsText(ST_SnapToGrid(ST_SetSRID(ST_MakePoint(${t.lng}, ${t.lat}), 4326), 0.0004, 0.0004))
     order by h
  `;
  console.log(`\nz15 cell (45m): ${cell15.length} pins`);
  for (const p of cell15.slice(0, 5)) {
    console.log(`  ${p.id.slice(0, 8)} h=${p.h}${p.id.startsWith('26dbe6a3') ? '  ← TARGET' : ''}`);
  }
  console.log(`Cell winner: ${cell15[0].id.slice(0,8)} ${cell15[0].id.startsWith('26dbe6a3') ? '(target)' : '(NOT target)'}`);

  // Now simulate the actual client call via Supabase JS at z15 with pagination
  // Bbox: a typical desktop z15 viewport centered on target
  const halfLng = 0.025, halfLat = 0.011;
  const bbox = {
    minLng: Number(t.lng) - halfLng, minLat: Number(t.lat) - halfLat,
    maxLng: Number(t.lng) + halfLng, maxLat: Number(t.lat) + halfLat
  };
  console.log(`\nSimulating z15 client call with pagination...`);
  const PAGE = 1000;
  const all = [];
  for (let offset = 0; offset < 12000; offset += PAGE) {
    const upper = Math.min(offset + PAGE - 1, 11999);
    const { data, error } = await supabase
      .rpc('public_pins_bbox', {
        p_min_lng: bbox.minLng, p_min_lat: bbox.minLat,
        p_max_lng: bbox.maxLng, p_max_lat: bbox.maxLat,
        p_max_rows: 12000, p_zoom: 15
      })
      .range(offset, upper);
    if (error) { console.log('  ERROR:', error); break; }
    all.push(...(data || []));
    console.log(`  page offset=${offset}: ${data?.length} rows`);
    if ((data?.length ?? 0) < PAGE) break;
  }
  const has = all.find((r) => r.id?.startsWith('26dbe6a3'));
  console.log(`Total fetched: ${all.length} rows, contains target: ${!!has}`);

  await sql.end();
})();
