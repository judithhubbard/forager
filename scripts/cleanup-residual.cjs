// Final residual cleanup of opentrees imports.
//   - Nichols Arboretum: source CSV has Latitude/Longitude columns
//     but the values are stored swapped in the data. Each row has
//     Latitude = -83.72 (actually a longitude) and Longitude = 42.27
//     (actually a latitude). Re-importing with a forced swap would
//     work but the dataset is small (2,174 pins in Ann Arbor); just
//     delete and skip.
//   - Sioux Falls: 3 pins have positive longitude (sign flip in
//     the source). Delete them.

const postgres = require('postgres');
const { config } = require('dotenv');
const path = require('path');
config({ path: path.resolve(__dirname, '..', '.env.local') });
const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined });

(async () => {
  await sql`alter table public.pins disable trigger tg_gate_public_pins`;
  await sql`alter table public.pins disable trigger tg_pin_density_track_ins`;
  await sql`alter table public.pins disable trigger tg_pin_density_track_upd`;
  await sql`alter table public.pins disable trigger tg_pin_density_track_del`;

  const arb = await sql`delete from public.pins where import_source = 'opentrees-nichols_arboretum' returning 1`;
  console.log(`Deleted ${arb.length.toLocaleString()} Nichols Arboretum pins (data was inverted at source)`);

  await sql`delete from public.import_runs where import_source_id = 'opentrees-nichols_arboretum'`;
  await sql`delete from public.import_sources where id = 'opentrees-nichols_arboretum'`;

  // Sioux Falls outliers: positive longitude pins are sign-flipped at source
  const sf = await sql`
    delete from public.pins
     where import_source = 'opentrees-sioux_falls'
       and ST_X(location::geometry) > 0
     returning 1
  `;
  console.log(`Deleted ${sf.length.toLocaleString()} Sioux Falls sign-flipped pins`);

  await sql`alter table public.pins enable trigger tg_gate_public_pins`;
  await sql`alter table public.pins enable trigger tg_pin_density_track_ins`;
  await sql`alter table public.pins enable trigger tg_pin_density_track_upd`;
  await sql`alter table public.pins enable trigger tg_pin_density_track_del`;

  console.log('\nRefreshing pin density grid…');
  await sql`select public.refresh_pin_density()`;

  const total = await sql`select count(*)::int as n from public.pins`;
  const ot = await sql`select count(*)::int as n from public.pins where import_source like 'opentrees-%'`;
  console.log(`Total pins: ${total[0].n.toLocaleString()} (opentrees-*: ${ot[0].n.toLocaleString()})`);

  await sql.end();
})();
