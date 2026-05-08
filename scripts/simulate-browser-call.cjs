// Simulate the browser's exact PostgREST call via Supabase JS
// (same package the client uses), with the same .range() + body
// the deployed bundle is sending. Verifies whether the response
// actually contains pin 98b2678e end-to-end.

const { createClient } = require('@supabase/supabase-js');
const { config } = require('dotenv');
const path = require('node:path');

config({ path: path.resolve(__dirname, '..', '.env.local') });

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.PUBLIC_SUPABASE_ANON_KEY
);

(async () => {
  // User's exact bbox from devtools.
  const params = {
    p_min_lng: -76.51308059692384,
    p_min_lat: 42.435525137221845,
    p_max_lng: -76.48252487182619,
    p_max_lat: 42.452594621767815,
    p_max_rows: 12000,
    p_zoom: 16  // user said they're at z16
  };

  console.log('Calling supabase.rpc(public_pins_bbox).range(0, 11999)…');
  const { data, error, status, statusText } = await supabase
    .rpc('public_pins_bbox', params)
    .range(0, 11999);

  if (error) {
    console.log(`ERROR ${status} ${statusText}:`, error);
    return;
  }
  console.log(`Returned ${data.length} rows; status ${status}`);
  const found = data.find((r) => r.id?.startsWith('98b2678e'));
  console.log(`Contains 98b2678e: ${!!found}`);
  if (found) console.log(`  pos in response: ${data.findIndex(r => r.id === found.id) + 1}`);

  // Also: try without zoom param (defaults server-side to 18) to
  // simulate stale bundle behavior — should also work because of
  // .range(0, 11999).
  const { data: data2, error: e2 } = await supabase
    .rpc('public_pins_bbox', { ...params, p_zoom: 18 })
    .range(0, 11999);
  if (e2) console.log(`zoom=18 ERROR:`, e2);
  else {
    const f2 = data2.find((r) => r.id?.startsWith('98b2678e'));
    console.log(`At p_zoom=18 + range(0,11999): ${data2.length} rows, contains target: ${!!f2}`);
  }

  // Bare call (no .range) — should silently truncate to 1000
  const { data: data3 } = await supabase
    .rpc('public_pins_bbox', { ...params, p_zoom: 18 });
  const f3 = data3?.find((r) => r.id?.startsWith('98b2678e'));
  console.log(`At p_zoom=18 NO range: ${data3?.length} rows, contains target: ${!!f3} ← old behavior`);
})();
