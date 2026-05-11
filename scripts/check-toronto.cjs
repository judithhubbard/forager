// Investigate why Toronto pins are visible to anon but not to authed
// users. Checks: pin counts in region, public_pins_bbox results, and
// regions-table RLS policies.

const postgres = require('postgres');
const { config } = require('dotenv');
const path = require('path');
config({ path: path.resolve(__dirname, '..', '.env.local') });

const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined });

(async () => {
  // 1. How many Toronto pins exist?
  const counts = await sql`
    select region_id, r.name, count(*)::int as n,
           count(*) filter (where p.visibility = 'public')::int as n_public
      from public.pins p
      join public.regions r on r.id = p.region_id
     where r.name ilike '%toronto%'
     group by region_id, r.name
  `;
  console.log('Toronto regions + pin counts:');
  for (const x of counts) console.log(`  ${x.name}: ${x.n} pins (${x.n_public} public)`);

  // 2. Test public_pins_bbox over a Toronto-area viewport.
  // Toronto bbox roughly: -79.7 .. -79.1, 43.55 .. 43.85
  const bbox = await sql`
    select count(*)::int as n
      from public.public_pins_bbox(-79.7, 43.55, -79.1, 43.85, 1000)
  `;
  console.log(`\npublic_pins_bbox over Toronto bbox: ${bbox[0].n} rows (postgres-role call)`);

  // 3. Inspect public_pins_bbox function's SECURITY mode and signature
  const fnDef = await sql`
    select pg_get_functiondef(p.oid) as def
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'public_pins_bbox'
  `;
  if (fnDef.length > 0) {
    const def = fnDef[0].def;
    const lines = def.split('\n').slice(0, 40);
    console.log('\npublic_pins_bbox definition (first 40 lines):');
    for (const l of lines) console.log(`  ${l}`);
  }

  // 4. Test RLS: simulate an authed user (any) reading regions
  // via auth role, see if the toronto region row is visible.
  // We can't easily simulate auth.uid() outside Supabase Auth, but
  // we can check the RLS policies on the regions table.
  const policies = await sql`
    select polname, polcmd, polroles::regrole[]::text[] as roles, pg_get_expr(polqual, polrelid) as using_expr
      from pg_policy
      join pg_class c on c.oid = polrelid
     where c.relname = 'regions'
     order by polname
  `;
  console.log(`\nregions RLS policies (${policies.length}):`);
  for (const p of policies) {
    console.log(`  ${p.polname} (${p.polcmd}, roles=${p.roles.join(',')}): ${p.using_expr || '(no qual)'}`);
  }

  // 5. Check v_pin_effective definition — does it inner-join
  // regions in a way that gates visibility?
  const viewDef = await sql`
    select pg_get_viewdef('public.v_pin_effective'::regclass, true) as def
  `;
  console.log('\nv_pin_effective definition (first 60 lines):');
  const vlines = viewDef[0].def.split('\n').slice(0, 60);
  for (const l of vlines) console.log(`  ${l}`);

  await sql.end();
})();
