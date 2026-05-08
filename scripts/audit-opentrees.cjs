// Audit opentrees-* pins for suspicious coordinates. Each source
// targeted a specific city, so pins should cluster near that city.
// Outliers indicate schema-detection picked the wrong columns
// (lat/lng swapped, the wrong "X"/"Y" columns picked, or coordinates
// in feet/projected SRS instead of WGS84 degrees).

const postgres = require('postgres');
const { config } = require('dotenv');
const path = require('path');
config({ path: path.resolve(__dirname, '..', '.env.local') });

const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined });

// Approximate centroids for the cities we imported (subset — the
// problematic ones we'll see surface).
const CENTROIDS = {
  'opentrees-edmonton':            { lat: 53.5461,  lng: -113.4938 },
  'opentrees-calgary':             { lat: 51.0447,  lng: -114.0719 },
  'opentrees-winnipeg':            { lat: 49.8951,  lng: -97.1384 },
  'opentrees-ottawa':              { lat: 45.4215,  lng: -75.6972 },
  'opentrees-moncton':             { lat: 46.0878,  lng: -64.7782 },
  'opentrees-providence':          { lat: 41.8240,  lng: -71.4128 },
  'opentrees-cupertino':           { lat: 37.3230,  lng: -122.0322 },
  'opentrees-oxnard':              { lat: 34.1975,  lng: -119.1771 },
  'opentrees-three_rivers':        { lat: 44.9619,  lng: -93.4619 }, // Three Rivers Park District, MN
  'opentrees-mountain_view':       { lat: 37.3861,  lng: -122.0839 },
  'opentrees-richardson':          { lat: 32.9483,  lng: -96.7299 },
  'opentrees-sioux_falls':         { lat: 43.5446,  lng: -96.7311 },
  'opentrees-charlottesville_nc':  { lat: 35.5982,  lng: -82.5515 }, // labelled NC but src is Charlottesville VA
  'opentrees-weston_fl':           { lat: 26.1003,  lng: -80.3997 },
  'opentrees-west_chester_pa':     { lat: 39.9601,  lng: -75.6058 },
  'opentrees-champaign_il':        { lat: 40.1164,  lng: -88.2434 },
  'opentrees-st_augustine_fl':     { lat: 29.8946,  lng: -81.3145 },
  'opentrees-bozeman_mt':          { lat: 45.6770,  lng: -111.0429 },
  'opentrees-nichols_arboretum':   { lat: 42.2770,  lng: -83.7191 }, // Ann Arbor
  'opentrees-unt':                 { lat: 33.2148,  lng: -97.1331 }, // U North Texas, Denton TX
  'opentrees-westerville_oh':      { lat: 40.1262,  lng: -82.9290 },
  'opentrees-escondido_ca':        { lat: 33.1192,  lng: -117.0864 },
  'opentrees-auburn_me':           { lat: 44.0979,  lng: -70.2312 },
  'opentrees-cape_coral_fl':       { lat: 26.5629,  lng: -81.9495 },
  'opentrees-naperville_il':       { lat: 41.7508,  lng: -88.1535 }
};

(async () => {
  // Per-source distance distribution
  const r = await sql`
    select import_source,
           count(*)::int as n,
           min(ST_Y(location::geometry)) as min_lat,
           max(ST_Y(location::geometry)) as max_lat,
           min(ST_X(location::geometry)) as min_lng,
           max(ST_X(location::geometry)) as max_lng
      from public.pins
     where import_source like 'opentrees-%'
     group by import_source
     order by n desc
  `;
  console.log(`source                              pins      lat range            lng range`);
  for (const x of r) {
    const src = String(x.import_source).padEnd(36);
    const n = String(x.n).padStart(7);
    const lr = `${Number(x.min_lat).toFixed(2)}..${Number(x.max_lat).toFixed(2)}`.padEnd(16);
    const gr = `${Number(x.min_lng).toFixed(2)}..${Number(x.max_lng).toFixed(2)}`.padEnd(16);
    const c = CENTROIDS[x.import_source];
    const flag = c
      ? (Math.abs((Number(x.min_lat) + Number(x.max_lat))/2 - c.lat) > 1
         || Math.abs((Number(x.min_lng) + Number(x.max_lng))/2 - c.lng) > 1
         ? '  ← MISLOCATED' : '')
      : '';
    console.log(`${src}${n}  ${lr}  ${gr}${flag}`);
  }

  // Pins in the ocean: rough check via lat between -1 and 1, or
  // anywhere far from US/Canada landmass.
  const ocean = await sql`
    select import_source, count(*)::int as n
      from public.pins
     where import_source like 'opentrees-%'
       and (
         ST_Y(location::geometry) between -10 and 10  -- equatorial / open-ocean
         or ST_X(location::geometry) > 50    -- east of Europe (definitely wrong for US/CA)
         or ST_X(location::geometry) < -180  -- impossible
         or ST_Y(location::geometry) > 60    -- way north (probably wrong for US/southern Canada)
         or ST_Y(location::geometry) < 20    -- south of Mexico (wrong for US/CA)
       )
     group by import_source
     order by n desc
  `;
  if (ocean.length > 0) {
    console.log(`\n⚠ Coordinates in suspect zones (open ocean / wrong continent):`);
    for (const x of ocean) console.log(`  ${x.import_source.padEnd(36)} ${x.n}`);
  }

  await sql.end();
})();
