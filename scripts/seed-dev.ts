// Populate dev DB with ~10 fake pins for UI work.
//
// Run with: npm run seed:dev
//
// Prereqs:
//   1. `npm run seed` has been run (creates Ithaca region + species + windows).
//   2. You've signed up via the app once. Find your auth.users.id (Supabase
//      dashboard → Authentication → Users → click your user → copy UUID),
//      and set:
//          FORAGER_DEV_USER_ID=<your-uuid>
//      either inline (`FORAGER_DEV_USER_ID=... npm run seed:dev`) or in
//      .env.local.
//
// This script:
//   - Ensures your user is an admin of the Ithaca region.
//   - Inserts ~10 fake pins around Cornell/Ithaca, idempotent on
//     (region, species, display_name).

import postgres from 'postgres';
import 'dotenv/config';

const FAKE_PINS: Array<{
  scientific_name: string;
  lng: number;
  lat: number;
  display_name?: string;
  notes?: string;
}> = [
  { scientific_name: 'Amelanchier laevis',  lng: -76.4853, lat: 42.4528, display_name: 'Triphammer serviceberry' },
  { scientific_name: 'Cornus mas',          lng: -76.4795, lat: 42.4499, display_name: 'Plant Sci cornelian cherry' },
  { scientific_name: 'Morus rubra',         lng: -76.4814, lat: 42.4427, display_name: 'Cascadilla mulberry' },
  { scientific_name: 'Asimina triloba',     lng: -76.4736, lat: 42.4509, display_name: 'Bailey pawpaw',     notes: 'Pawpaw grove south of Bailey Hall' },
  { scientific_name: 'Juglans nigra',       lng: -76.4880, lat: 42.4477, display_name: 'Slope walnut' },
  { scientific_name: 'Sambucus canadensis', lng: -76.5031, lat: 42.4462, display_name: 'Stewart Park elder', notes: 'Edge of Stewart Park near the lakefront' },
  { scientific_name: 'Carya ovata',         lng: -76.4521, lat: 42.4557, display_name: 'East Hill hickory' },
  { scientific_name: 'Prunus serotina',     lng: -76.4929, lat: 42.4391, display_name: 'Gorge cherry' },
  { scientific_name: 'Diospyros virginiana',lng: -76.4748, lat: 42.4530, display_name: 'Botanic Garden persimmon' },
  { scientific_name: 'Crataegus',           lng: -76.4805, lat: 42.4405, display_name: 'Cascadilla hawthorn' }
];

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  const userId = process.env.FORAGER_DEV_USER_ID;
  if (!dbUrl) throw new Error('SUPABASE_DB_URL missing.');
  if (!userId) {
    console.error(
      'FORAGER_DEV_USER_ID not set. Sign up via the app first, then export your auth.users.id:\n' +
        '  FORAGER_DEV_USER_ID=<uuid> npm run seed:dev'
    );
    process.exit(1);
  }

  const sql = postgres(dbUrl, { ssl: 'require', onnotice: () => undefined });

  const region = await sql<{ id: string }[]>`
    select id from regions where name = 'Ithaca shared' limit 1
  `;
  if (region.length === 0) {
    throw new Error('Ithaca shared region not found. Run `npm run seed` first.');
  }
  const regionId = region[0].id;

  // Ensure dev user is an admin member.
  await sql`
    insert into region_memberships (user_id, region_id, role)
    values (${userId}, ${regionId}, 'admin')
    on conflict (user_id, region_id) do update set role = 'admin'
  `;
  console.log(`  region_membership: ${userId} is admin of Ithaca shared`);

  let inserted = 0;
  let skipped = 0;
  for (const p of FAKE_PINS) {
    const sp = await sql<{ id: string }[]>`
      select id from species where scientific_name = ${p.scientific_name} limit 1
    `;
    if (sp.length === 0) {
      console.warn(`  ! species missing: ${p.scientific_name}`);
      continue;
    }

    const existing = await sql<{ id: string }[]>`
      select id from pins
       where region_id = ${regionId}
         and species_id = ${sp[0].id}
         and display_name is not distinct from ${p.display_name ?? null}
       limit 1
    `;
    if (existing.length > 0) {
      skipped++;
      continue;
    }

    await sql`
      insert into pins (region_id, created_by, species_id, display_name, notes, location, status)
      values (
        ${regionId},
        ${userId},
        ${sp[0].id},
        ${p.display_name ?? null},
        ${p.notes ?? null},
        ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326)::geography,
        'active'
      )
    `;
    inserted++;
  }

  console.log(`Done. ${inserted} pins inserted, ${skipped} skipped.`);
  await sql.end();
}

main().catch((err) => {
  console.error('seed:dev failed:', err);
  process.exit(1);
});
