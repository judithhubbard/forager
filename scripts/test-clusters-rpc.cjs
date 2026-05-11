// Test the cluster RPC via Supabase JS at z15 over Ithaca bbox.
const { createClient } = require('@supabase/supabase-js');
const { config } = require('dotenv');
const path = require('path');
config({ path: path.resolve(__dirname, '..', '.env.local') });
const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.PUBLIC_SUPABASE_ANON_KEY);
(async () => {
  const params = {
    p_min_lng: -76.51308,
    p_min_lat: 42.435525,
    p_max_lng: -76.482524,
    p_max_lat: 42.452594,
    p_zoom: 15
  };
  const { data, error, status } = await supabase
    .rpc('pin_clusters_bbox', params)
    .range(0, 999);
  if (error) { console.log(`ERROR ${status}:`, error); return; }
  console.log(`Returned ${data.length} rows; status ${status}`);
  if (data.length) {
    console.log('First 3 rows:');
    for (const r of data.slice(0, 3)) console.log('  ', r);
  }
})();
