// Diagnose the RLS / grants / function setup.
// Run with: npx tsx scripts/diagnose.ts
//
// Prints whether the membership exists, whether helpers work,
// and whether the authenticated role has the necessary grants.

import postgres from 'postgres';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  const userId = process.env.FORAGER_DEV_USER_ID;
  if (!dbUrl) throw new Error('SUPABASE_DB_URL missing.');
  if (!userId) throw new Error('FORAGER_DEV_USER_ID missing.');

  const sql = postgres(dbUrl, { ssl: 'require', onnotice: () => undefined });

  console.log('--- 1. Membership row ----------------------------');
  const membership = await sql<{ user_id: string; region_id: string; role: string }[]>`
    select user_id, region_id, role from public.region_memberships;
  `;
  console.log(JSON.stringify(membership, null, 2));

  console.log('\n--- 2. is_region_member returns true? -----------');
  const ithaca = await sql<{ id: string }[]>`
    select id from public.regions where name = 'Ithaca shared' limit 1;
  `;
  if (ithaca.length === 0) {
    console.log('!! Ithaca shared region not found.');
    await sql.end();
    return;
  }
  const isMember = await sql<{ result: boolean }[]>`
    select public.is_region_member(${userId}::uuid, ${ithaca[0].id}::uuid) as result;
  `;
  console.log('is_region_member =>', isMember[0].result);

  console.log('\n--- 3. table-level grants on region_memberships ---');
  const tableGrants = await sql<{ grantee: string; privilege_type: string }[]>`
    select grantee, privilege_type
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'region_memberships'
    order by grantee, privilege_type;
  `;
  console.log(JSON.stringify(tableGrants, null, 2));

  console.log('\n--- 4. EXECUTE on is_region_member ---------------');
  const fnGrants = await sql<{ grantee: string; privilege_type: string }[]>`
    select grantee, privilege_type
    from information_schema.role_routine_grants
    where routine_schema = 'public' and routine_name = 'is_region_member'
    order by grantee;
  `;
  console.log(JSON.stringify(fnGrants, null, 2));

  console.log('\n--- 5. Simulate the failing query as authenticated ---');
  // Set role + JWT claims to simulate what supabase-js does for this user.
  await sql.begin(async (txn) => {
    await txn`set local role authenticated`;
    await txn.unsafe(`set local request.jwt.claims to '${JSON.stringify({ sub: userId, email: 'sim@example.test' })}'`);
    try {
      const rows = await txn<{ role: string; region_id: string }[]>`
        select role, region_id from public.region_memberships order by joined_at asc;
      `;
      console.log(`SELECT returned ${rows.length} row(s):`);
      console.log(JSON.stringify(rows, null, 2));
    } catch (err) {
      const e = err as { message?: string; code?: string };
      console.log('SELECT errored:', e.code, e.message);
    }
  });

  await sql.end();
}

main().catch((err) => {
  console.error('Diagnose failed:', err);
  process.exit(1);
});
