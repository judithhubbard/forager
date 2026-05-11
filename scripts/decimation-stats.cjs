// Show pin-decimation impact at each zoom level for an Ithaca-area
// viewport. Reports raw pin count vs. post-decimation count.

const postgres = require('postgres');
const { config } = require('dotenv');
const path = require('path');
config({ path: path.resolve(__dirname, '..', '.env.local') });
const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined });

async function statsFor(label, center, halfBase) {
  console.log(`\n${label} (centered on ${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}):`);
  console.log(`zoom  bbox            raw pins   after decim   filtered   rate`);
  console.log(`----  --------------  ---------  ------------  ---------  -----`);
  for (const z of [13, 14, 15, 16, 17, 18]) {
    const scale = Math.pow(2, 15 - z);
    const bbox = {
      minLng: center.lng - halfBase.lng * scale,
      minLat: center.lat - halfBase.lat * scale,
      maxLng: center.lng + halfBase.lng * scale,
      maxLat: center.lat + halfBase.lat * scale
    };
    const rawRes = await sql`
      select count(*)::int as n
        from public.pins p
       where p.visibility = 'public'
         and p.location && ST_MakeEnvelope(
               ${bbox.minLng}, ${bbox.minLat}, ${bbox.maxLng}, ${bbox.maxLat}, 4326
             )
    `;
    const raw = rawRes[0].n;
    const decRes = await sql`
      select count(*)::int as n
        from public.public_pins_bbox(
          ${bbox.minLng}::float8, ${bbox.minLat}::float8,
          ${bbox.maxLng}::float8, ${bbox.maxLat}::float8,
          15000, ${z}::int
        )
    `;
    const dec = decRes[0].n;
    const filtered = raw - dec;
    const rate = raw > 0 ? ((filtered / raw) * 100).toFixed(1) : '0.0';
    const bboxKm = `${(bbox.maxLng - bbox.minLng) * 82.2 | 0}km×${(bbox.maxLat - bbox.minLat) * 111.3 | 0}km`;
    console.log(
      `z${z}   ${bboxKm.padEnd(14)}  ${String(raw).padStart(7)}    ${String(dec).padStart(8)}   ${String(filtered).padStart(7)}   ${rate.padStart(4)}%`
    );
  }
}

(async () => {
  // Desktop ~1024×768 → ~3km × 2km at z15 in Ithaca latitude.
  // Mobile  ~375×667  → ~1.1km × 1.7km at z15 (narrower but tall).
  const desktop = { lng: 0.013, lat: 0.0095 };
  const mobile = { lng: 0.005, lat: 0.0085 };
  await statsFor(
    'Ithaca / DESKTOP',
    { lat: 42.4435, lng: -76.4965 },
    desktop
  );
  await statsFor(
    'Ithaca / MOBILE',
    { lat: 42.4435, lng: -76.4965 },
    mobile
  );
  await statsFor(
    'Toronto / DESKTOP',
    { lat: 43.6532, lng: -79.3832 },
    desktop
  );
  await statsFor(
    'Toronto / MOBILE',
    { lat: 43.6532, lng: -79.3832 },
    mobile
  );
  await sql.end();
})();
