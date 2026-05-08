// Seed initial invasive flags for well-known invasive species among
// the foragable catalog. The Forager species table is small (~160
// edibles) so most "classic" invasives like tree of heaven and
// callery pear aren't represented here — those are inedible. The
// invasive list below covers species that are BOTH foragable AND
// widely considered invasive in the northeastern US / Canada.
//
// Idempotent: skips any (species, region=null, flagger) pair that
// already exists. Run once at deploy or any time to reconcile.

const postgres = require('postgres');
const path = require('node:path');
const { config } = require('dotenv');
config({ path: path.resolve(__dirname, '..', '.env.local') });

// Scientific names — these are stable across catalog edits.
const SEEDS = [
  'Elaeagnus umbellata',     // Autumn olive — aggressive nitrogen-fixer in eastern US/Canada
  'Rubus phoenicolasius',    // Wineberry — Asian Rubus invasive throughout Atlantic states
  'Morus alba'               // White mulberry — outcompetes native red mulberry
];

const SEEDER_EMAIL = 'judith.a.hubbard@gmail.com';

(async () => {
  const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined });
  try {
    const u = await sql`select id from auth.users where email = ${SEEDER_EMAIL} limit 1`;
    if (!u[0]) throw new Error(`seeder user not found: ${SEEDER_EMAIL}`);
    const seederId = u[0].id;

    let inserted = 0, skipped = 0, missing = 0;
    for (const sciName of SEEDS) {
      const sp = await sql`select id, common_name from public.species where scientific_name = ${sciName} limit 1`;
      if (!sp[0]) { console.log(`✗ ${sciName} — not in catalog`); missing++; continue; }
      const r = await sql`
        insert into public.species_invasive_flags
          (species_id, region_id, flagged_by, notes)
        values
          (${sp[0].id}, null, ${seederId}::uuid,
           'Seed flag — widely considered invasive in northeast NA. Edit or remove if context disagrees.')
        on conflict (species_id, region_id, flagged_by) do nothing
        returning id
      `;
      if (r.length > 0) {
        console.log(`✓ ${sciName.padEnd(28)} (${sp[0].common_name}) flagged`);
        inserted++;
      } else {
        console.log(`· ${sciName.padEnd(28)} (${sp[0].common_name}) already flagged`);
        skipped++;
      }
    }
    console.log(`\nDone: ${inserted} inserted, ${skipped} skipped, ${missing} missing.`);

    const counts = await sql`
      select s.common_name, s.invasive_flag_count
        from public.species s
       where s.invasive_flag_count > 0
       order by s.invasive_flag_count desc, s.common_name
    `;
    console.log('\nSpecies with any invasive flag:');
    for (const c of counts) console.log(`  ${String(c.invasive_flag_count).padStart(3)}  ${c.common_name}`);
  } finally {
    await sql.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
