// Delete opentrees-* pins from sources where coordinate detection
// went wrong. Keeps the few that imported cleanly (Edmonton, Calgary,
// Escondido, etc.). The importer will be fixed to validate coords +
// prefer POINT WKT before re-running on the bad sources.
//
// "Bad" = max|lat| > 90 OR max|lng| > 180 OR coordinates clearly
// not in the city's region. From the audit:

const postgres = require('postgres');
const { config } = require('dotenv');
const path = require('path');
config({ path: path.resolve(__dirname, '..', '.env.local') });

const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined });

// Sources to wipe (lat/lng range was -90..90 / -180..180, indicating
// random / nonsense coordinates). Keep edmonton, calgary, escondido,
// west_chester_pa, providence (cupertino is partial — wipe it too;
// re-import will be cleaner).
const BAD_SOURCES = [
  'opentrees-winnipeg',
  'opentrees-ottawa',
  'opentrees-sioux_falls',
  'opentrees-naperville_il',
  'opentrees-bozeman_mt',
  'opentrees-champaign_il',
  'opentrees-three_rivers',
  'opentrees-charlottesville_nc',
  'opentrees-auburn_me',
  'opentrees-richardson',
  'opentrees-nichols_arboretum',
  'opentrees-cupertino',
  'opentrees-oxnard',
  'opentrees-weston_fl',
  'opentrees-moncton',
  'opentrees-st_augustine_fl'
];

(async () => {
  await sql`alter table public.pins disable trigger tg_gate_public_pins`;
  await sql`alter table public.pins disable trigger tg_pin_density_track_ins`;
  await sql`alter table public.pins disable trigger tg_pin_density_track_upd`;
  await sql`alter table public.pins disable trigger tg_pin_density_track_del`;

  for (const src of BAD_SOURCES) {
    const r = await sql`delete from public.pins where import_source = ${src} returning 1`;
    console.log(`  ✗ ${src.padEnd(36)} deleted ${r.length.toLocaleString()}`);
  }

  // Also drop their import_runs + import_sources rows so a re-run
  // creates fresh state.
  for (const src of BAD_SOURCES) {
    await sql`delete from public.import_runs where import_source_id = ${src}`;
    await sql`delete from public.import_sources where id = ${src}`;
  }

  await sql`alter table public.pins enable trigger tg_gate_public_pins`;
  await sql`alter table public.pins enable trigger tg_pin_density_track_ins`;
  await sql`alter table public.pins enable trigger tg_pin_density_track_upd`;
  await sql`alter table public.pins enable trigger tg_pin_density_track_del`;

  console.log('\nRefreshing pin density grid…');
  await sql`select public.refresh_pin_density()`;

  const total = await sql`select count(*)::int as n from public.pins where import_source like 'opentrees-%'`;
  console.log(`Remaining opentrees-* pins: ${total[0].n.toLocaleString()}`);
  await sql.end();
})();
