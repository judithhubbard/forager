// RLS / policy security audit for the Forager Supabase DB.
//
// Inspects every table and policy in the public schema and flags
// configurations that could leak data or allow unauthorized writes.
// Read-only — never modifies the DB.
//
// Severity levels:
//   ERROR   — a real risk (e.g. anon role has INSERT, or a user-data
//             table has `using (true)` for SELECT). Exit 1.
//   WARNING — review needed (e.g. table has 0 policies — only the
//             service role can read it, which might be intentional
//             but worth confirming for user-facing tables). Exit 2
//             (only if no ERRORs).
//   INFO    — FYI (e.g. a SECURITY DEFINER function exists).
//
// Usage:
//   node scripts/audit-rls.cjs              # text output
//   node scripts/audit-rls.cjs --json       # machine-readable
//   node scripts/audit-rls.cjs --strict     # treat WARNING as ERROR
//
// Designed to run in CI: fail the build on ERROR so an accidental
// `using (true)` on pins or profiles is caught before merge.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
const SUPABASE_DB_URL = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim();
const sql = require(path.join(ROOT, 'node_modules', 'postgres'))(
  SUPABASE_DB_URL,
  { ssl: 'require', onnotice: () => undefined }
);

const args = process.argv.slice(2);
const wantJson = args.includes('--json');
const strict = args.includes('--strict');

// Tables that are intentionally world-readable (public reference
// data). A `using (true)` SELECT policy here is fine; on any other
// table it's a leak risk. Keep this allow-list small and explicit —
// every entry is a security decision.
const PUBLIC_REFERENCE_TABLES = new Set([
  'climate_zones',
  'regions',          // names + bounds are public-readable
  'region_climate_zones',
  'region_seasonal_shifts',
  'species',
  'species_fruiting_windows',
  'species_invasive_flags',
  'usda_hardiness_zones',
  'zone_frost_dates',
  'import_sources',
  'pin_density_grid',
  // 'pins', 'observations', 'photos' are NOT here — they have RLS
  // logic per-row (visibility='public' or membership-based).
]);

// Tables holding user-private data. If anon has any access, that's
// almost always a leak.
const USER_PRIVATE_TABLES = new Set([
  'profiles',
  'user_species_preferences',
  'user_fruiting_window_overrides',
  'invitations',
  'notifications',
  'feedback_reports',
  'watchlist',
  'comments',
  'ux_events'
]);

// Tables expected to be service-role-only (zero RLS policies, RLS
// on = no one can read via PostgREST). Build artifacts or
// admin-only audit logs.
const SERVICE_ROLE_ONLY_TABLES = new Set([
  'confirmed_window_exports',
  'pin_grid_z13',
  'pin_grid_z14',
  'import_runs'
]);

const findings = []; // { severity, table, policy, cmd, issue, detail }
function add(severity, table, policy, cmd, issue, detail) {
  findings.push({ severity, table, policy: policy ?? null, cmd: cmd ?? null, issue, detail: detail ?? null });
}

(async () => {
  // 1. Tables in public schema with their RLS state.
  const tables = await sql`
    select c.relname as table_name,
           c.relrowsecurity as rls_on,
           c.relforcerowsecurity as forced,
           (select count(*) from pg_policy where polrelid = c.oid)::int as policy_count
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
     order by c.relname`;

  for (const t of tables) {
    if (t.table_name === 'spatial_ref_sys') continue; // PostGIS system table
    if (!t.rls_on) {
      add('ERROR', t.table_name, null, null, 'rls-disabled',
        'Table has RLS disabled — any authenticated/anon user with PostgREST access can read or write every row.');
      continue;
    }
    if (t.policy_count === 0) {
      if (SERVICE_ROLE_ONLY_TABLES.has(t.table_name)) {
        add('INFO', t.table_name, null, null, 'service-role-only',
          'RLS on + 0 policies = no PostgREST access. Service-role-only as intended.');
      } else if (USER_PRIVATE_TABLES.has(t.table_name)) {
        add('ERROR', t.table_name, null, null, 'private-table-no-policies',
          'User-private table has RLS on but NO policies — feature must be broken (no one can read or write).');
      } else {
        add('WARNING', t.table_name, null, null, 'zero-policies',
          'RLS on + 0 policies. If anon/auth users need to read this, the feature is silently broken. Add an allow-list entry to PUBLIC_REFERENCE_TABLES or SERVICE_ROLE_ONLY_TABLES in audit-rls.cjs if intentional.');
      }
    }
  }

  // 2. Per-policy expression checks.
  const policies = await sql`
    select schemaname, tablename, policyname, cmd, permissive, roles, qual, with_check
      from pg_policies
     where schemaname = 'public'
     order by tablename, policyname`;

  for (const p of policies) {
    const tn = p.tablename;
    const roles = p.roles || [];
    const hasAnon = roles.includes('anon');
    const hasAuth = roles.includes('authenticated');
    const hasPublic = roles.includes('public');

    // Normalize qual / with_check whitespace
    const qual = (p.qual || '').replace(/\s+/g, ' ').trim();
    const check = (p.with_check || '').replace(/\s+/g, ' ').trim();
    const isTrueQual = qual === 'true' || qual === '(true)' || qual === '';
    const isTrueCheck = check === 'true' || check === '(true)' || check === '';

    // (a) anon role with write commands → real risk.
    if (hasAnon && p.cmd !== 'SELECT') {
      add('ERROR', tn, p.policyname, p.cmd, 'anon-write',
        `Policy grants ${p.cmd} to the 'anon' role. Anon users can mutate this table.`);
    }
    // 'public' role applies to BOTH anon + authenticated.
    if (hasPublic && p.cmd !== 'SELECT') {
      add('ERROR', tn, p.policyname, p.cmd, 'public-write',
        `Policy grants ${p.cmd} to the 'public' role (covers anon). Anyone can mutate this table.`);
    }

    // (b) `using (true)` on SELECT for a non-allowlisted table → leak.
    if (p.cmd === 'SELECT' && isTrueQual && !PUBLIC_REFERENCE_TABLES.has(tn)) {
      // Subtle case: pins / observations etc. have one policy each
      // for "where visibility='public'" — but those use a real qual,
      // not 'true'. A literal 'true' qual is the leak signature.
      add('ERROR', tn, p.policyname, p.cmd, 'select-true',
        `SELECT policy has \`using (true)\` — every row is readable by anyone in role(s) [${roles.join(', ')}]. Add the table to PUBLIC_REFERENCE_TABLES if intentional.`);
    }

    // (c) `with_check (true)` on INSERT/UPDATE → anyone in role can
    //     write any row.
    if ((p.cmd === 'INSERT' || p.cmd === 'UPDATE' || p.cmd === 'ALL') && isTrueCheck && check !== '') {
      add('ERROR', tn, p.policyname, p.cmd, 'check-true',
        `${p.cmd} policy has \`with check (true)\` — role(s) [${roles.join(', ')}] can write any row with any values.`);
    }
    if (p.cmd === 'INSERT' && check === '') {
      // INSERT without with_check means anyone in role can insert
      // anything. Always a flag.
      add('ERROR', tn, p.policyname, p.cmd, 'insert-no-check',
        `INSERT policy has NO with_check clause — anyone in role(s) [${roles.join(', ')}] can insert arbitrary rows.`);
    }

    // (d) INSERT/UPDATE on user-private tables that don't reference
    //     auth.uid() at all.
    if (USER_PRIVATE_TABLES.has(tn) && (p.cmd === 'INSERT' || p.cmd === 'UPDATE')) {
      const refsAuth = (check + ' ' + qual).includes('auth.uid()');
      if (!refsAuth) {
        add('WARNING', tn, p.policyname, p.cmd, 'no-auth-uid',
          `Policy on user-private table does not reference auth.uid() — verify it correctly scopes by the user's id.`);
      }
    }

    // (e) DELETE without qual = anyone in role can delete anything.
    if (p.cmd === 'DELETE' && (qual === '' || isTrueQual)) {
      add('ERROR', tn, p.policyname, p.cmd, 'delete-true',
        `DELETE policy has \`using (true)\` (or missing using) — role(s) [${roles.join(', ')}] can delete every row.`);
    }
  }

  // 3. SECURITY DEFINER functions in public schema. They bypass
  //    caller-side RLS, so review each one.
  const secdef = await sql`
    select n.nspname || '.' || p.proname as fn,
           pg_get_function_arguments(p.oid) as args,
           p.prosecdef as is_secdef
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef = true
     order by p.proname`;
  for (const f of secdef) {
    add('INFO', null, f.fn, 'FUNCTION', 'security-definer',
      `SECURITY DEFINER function (${f.args}). Bypasses caller-side RLS — review what tables it reads/writes.`);
  }

  // 4. v_* views that select from user-private tables. Views inherit
  //    the policies of underlying tables, but only when run as the
  //    caller — a SECURITY INVOKER view (default) is fine. Just list
  //    them for awareness.
  const views = await sql`
    select table_name from information_schema.views
     where table_schema = 'public' and table_name like 'v_%'
     order by table_name`;
  if (views.length > 0 && !wantJson) {
    // Don't add as findings; mention in summary only.
  }

  // ---- Output ----
  const byseverity = { ERROR: [], WARNING: [], INFO: [] };
  for (const f of findings) byseverity[f.severity].push(f);

  if (wantJson) {
    console.log(JSON.stringify({
      audited_at: new Date().toISOString(),
      total_tables: tables.length,
      total_policies: policies.length,
      counts: {
        ERROR: byseverity.ERROR.length,
        WARNING: byseverity.WARNING.length,
        INFO: byseverity.INFO.length
      },
      findings
    }, null, 2));
  } else {
    console.log(`RLS audit — ${tables.length} tables, ${policies.length} policies`);
    console.log(`  ${byseverity.ERROR.length} ERROR  ${byseverity.WARNING.length} WARNING  ${byseverity.INFO.length} INFO\n`);
    for (const sev of ['ERROR', 'WARNING', 'INFO']) {
      if (byseverity[sev].length === 0) continue;
      console.log(`=== ${sev} (${byseverity[sev].length}) ===`);
      for (const f of byseverity[sev]) {
        const head = f.table
          ? `[${f.issue}] ${f.table}${f.policy ? ' · ' + f.policy : ''}${f.cmd ? ' (' + f.cmd + ')' : ''}`
          : `[${f.issue}] ${f.policy}`;
        console.log('  ' + head);
        if (f.detail) console.log('    ' + f.detail);
      }
      console.log();
    }
    if (byseverity.ERROR.length === 0 && byseverity.WARNING.length === 0) {
      console.log('✓ No issues.');
    } else {
      console.log(`To allow-list a flagged table as intentional, edit PUBLIC_REFERENCE_TABLES, USER_PRIVATE_TABLES, or SERVICE_ROLE_ONLY_TABLES at the top of scripts/audit-rls.cjs.`);
    }
  }

  await sql.end();
  const exitCode = byseverity.ERROR.length > 0
    ? 1
    : (strict && byseverity.WARNING.length > 0 ? 2 : 0);
  process.exit(exitCode);
})().catch((err) => {
  console.error('audit-rls failed:', err);
  sql.end();
  process.exit(3);
});
