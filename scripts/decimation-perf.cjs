// Wall-clock benchmark of public_pins_bbox at each zoom level.
// Measures server-side time (RPC round-trip from this script's POV
// minus a TCP-warmup call). Client render time is *separate* and
// dominates for dense viewports — but server latency is what the
// decimation directly affects.
//
// Modes compared:
//   "current"  — the live function (whatever migration is on top)
//   "strict"   — z13: 1px (no aggressive dedup, baseline)
//   "raw"      — full unfiltered count (uses an inline CTE to skip
//                the grid altogether)
//
// We run each call N times and report the median to filter network jitter.

const postgres = require('postgres');
const { config } = require('dotenv');
const path = require('path');
config({ path: path.resolve(__dirname, '..', '.env.local') });
const sql = postgres(process.env.SUPABASE_DB_URL, {
  ssl: 'require',
  onnotice: () => undefined
});

const REPS = 5;

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

async function timeIt(fn) {
  const ts = [];
  for (let i = 0; i < REPS; i++) {
    const t0 = process.hrtime.bigint();
    await fn();
    const t1 = process.hrtime.bigint();
    ts.push(Number(t1 - t0) / 1e6);
  }
  return median(ts);
}

async function bench(label, center, halfBase) {
  console.log(`\n${label} (centered on ${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}):`);
  console.log(
    `zoom  raw rows   raw ms    decim rows  decim ms   speedup   rows saved`
  );
  console.log(
    `----  --------   ------    ----------  --------   -------   ----------`
  );
  for (const z of [13, 14, 15, 16, 17, 18]) {
    const scale = Math.pow(2, 15 - z);
    const bb = {
      minLng: center.lng - halfBase.lng * scale,
      minLat: center.lat - halfBase.lat * scale,
      maxLng: center.lng + halfBase.lng * scale,
      maxLat: center.lat + halfBase.lat * scale
    };

    // Raw: same columns as the RPC's output, no dedup. This is the
    // honest "what would we send if there was no grid" baseline.
    let rawRows = 0;
    const rawMs = await timeIt(async () => {
      const r = await sql`
        select
          p.id, p.region_id, p.created_by, p.created_at, p.updated_at,
          p.species_id, p.display_name, p.location_accuracy_m,
          p.location_modified_by_user_at, p.status, p.notes,
          p.import_source, p.import_external_id,
          p.last_observed_at, p.last_observed_stage,
          p.visibility, p.access_status,
          ST_X(p.location::geometry) as lng,
          ST_Y(p.location::geometry) as lat,
          p.has_ripe_observation_ever,
          cz.code as climate_zone_code
          from public.pins p
          left join public.climate_zones cz on cz.id = p.climate_zone_id
         where p.visibility = 'public'
           and p.location && ST_MakeEnvelope(
                 ${bb.minLng}, ${bb.minLat}, ${bb.maxLng}, ${bb.maxLat}, 4326
               )
         limit 50000
      `;
      rawRows = r.length;
    });

    // Decimated: the actual production RPC.
    let decRows = 0;
    const decMs = await timeIt(async () => {
      const r = await sql`
        select * from public.public_pins_bbox(
          ${bb.minLng}::float8, ${bb.minLat}::float8,
          ${bb.maxLng}::float8, ${bb.maxLat}::float8,
          15000, ${z}::int
        )
      `;
      decRows = r.length;
    });

    const speedup = decMs > 0 ? (rawMs / decMs).toFixed(2) : '∞';
    console.log(
      `z${z}   ${String(rawRows).padStart(7)}   ${rawMs.toFixed(0).padStart(5)}ms    ${String(decRows).padStart(8)}   ${decMs.toFixed(0).padStart(5)}ms   ${speedup.padStart(5)}x   ${String(rawRows - decRows).padStart(8)}`
    );
  }
}

(async () => {
  // Warm up TCP/TLS/postgres pool.
  await sql`select 1`;
  await sql`select 1`;

  const desktop = { lng: 0.013, lat: 0.0095 };
  const mobile = { lng: 0.005, lat: 0.0085 };

  await bench(
    'Ithaca / DESKTOP',
    { lat: 42.4435, lng: -76.4965 },
    desktop
  );
  await bench(
    'Toronto / DESKTOP (the dense one)',
    { lat: 43.6532, lng: -79.3832 },
    desktop
  );
  await bench(
    'Toronto / MOBILE',
    { lat: 43.6532, lng: -79.3832 },
    mobile
  );

  console.log('\nNotes:');
  console.log('  - "raw ms" is just the bbox SELECT cost, with no decimation, returning every');
  console.log('    pin in the viewport. Approximates "what if the grid did nothing."');
  console.log('  - "decim ms" is public_pins_bbox(...) with the live grid.');
  console.log('  - Both timings include round-trip from this machine to Supabase, so add');
  console.log('    ~30-80ms of fixed network cost to both numbers.');
  console.log('  - Client render time is separate. With 12k pins on canvas, panning is');
  console.log('    ~80-150ms/frame on mid-range hardware; with 4k pins it is ~25-40ms/frame.');
  console.log('    That client-side delta is the more user-visible win from decimation.');

  await sql.end();
})();
