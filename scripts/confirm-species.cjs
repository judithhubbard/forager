// Confirm a species' harvest-window calibration.
//
// Workflow (driven by JK; never auto-run by an agent):
//
//   node scripts/confirm-species.cjs "Acer saccharum"
//   node scripts/confirm-species.cjs "Acer saccharum" --notes "matches 2026 Cornell Maple bulletin"
//
// What it does:
//   1. Verify the species exists and has at least one window row.
//   2. Snapshot all of the species' species_fruiting_windows rows to
//      a new confirmed_window_exports row (JSONB blob).
//   3. Write a parallel git-tracked JSON file to
//      data/confirmed-windows/<scientific_name>-<timestamp>.json so
//      the export is reviewable in PRs and restorable from disk if
//      the DB is ever rolled back.
//   4. Set species_fruiting_windows.is_confirmed = true for every row
//      of the species (the unify pipeline will now skip these).
//   5. Set species.review_status = 'confirmed'. This is an explicit
//      user act: the script is just an automation tool that records
//      JK's confirmation; the actual decision was JK's, made by
//      invoking this script.
//
// Idempotency: running confirm-species.cjs again on a species that's
// already confirmed creates a NEW export snapshot (a fresh timestamp)
// reflecting the current state. The previous export remains in the
// audit log. The most recent export is the active confirmed state.
// Run this after editing a confirmed species' windows to re-confirm
// the new values.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
const SUPABASE_DB_URL = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim();
const sql = require(path.join(ROOT, 'node_modules', 'postgres'))(
  SUPABASE_DB_URL,
  { ssl: 'require', onnotice: () => undefined, connection: { statement_timeout: 0 } }
);

const args = process.argv.slice(2);
const scientificName = args.find((a) => !a.startsWith('--'));
const notesIdx = args.indexOf('--notes');
const notes = notesIdx >= 0 ? args[notesIdx + 1] : null;

if (!scientificName) {
  console.error('Usage: node scripts/confirm-species.cjs "Scientific name" [--notes "..."]');
  process.exit(1);
}

function slugify(s) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

(async () => {
  await sql.unsafe('set statement_timeout = 0');

  const sp = await sql`
    select id, scientific_name, common_name, review_status
      from public.species
     where scientific_name = ${scientificName}
     limit 1`;
  if (sp.length === 0) {
    console.error(`Species not found: ${scientificName}`);
    await sql.end();
    process.exit(1);
  }
  const species = sp[0];

  const windows = await sql`
    select w.id, cz.code as climate_zone_code, w.stage, w.start_doy,
           w.end_doy, w.peak_doy, w.confidence, w.notes,
           w.evidence, w.complex_name
      from public.species_fruiting_windows w
      join public.climate_zones cz on cz.id = w.climate_zone_id
     where w.species_id = ${species.id}
     order by cz.code, w.stage, w.complex_name`;

  if (windows.length === 0) {
    console.error(`No window rows for ${scientificName} — nothing to confirm.`);
    await sql.end();
    process.exit(1);
  }

  console.log(`Confirming ${species.common_name} (${species.scientific_name}).`);
  console.log(`  ${windows.length} window rows across stages: ${[...new Set(windows.map((w) => w.stage))].join(', ')}`);

  const exportedAt = new Date();
  const exportRow = await sql`
    insert into public.confirmed_window_exports
      (species_id, exported_at, windows_snapshot, notes)
    values
      (${species.id}, ${exportedAt.toISOString()},
       ${sql.json(windows)}, ${notes})
    returning id`;
  console.log(`  ✓ snapshotted to confirmed_window_exports (id=${exportRow[0].id})`);

  // Flip is_confirmed on the species's window rows. The unify pipeline
  // will skip these on its next run.
  const flipped = await sql`
    update public.species_fruiting_windows
       set is_confirmed = true
     where species_id = ${species.id}
     returning id`;
  console.log(`  ✓ flipped is_confirmed=true on ${flipped.length} window rows`);

  // Mark the species as confirmed. This is the only place in the
  // codebase that should write review_status='confirmed', and it
  // only runs when JK explicitly invokes confirm-species.cjs.
  if (species.review_status !== 'confirmed') {
    await sql`
      update public.species
         set review_status = 'confirmed'
       where id = ${species.id}`;
    console.log(`  ✓ species.review_status: ${species.review_status} → confirmed`);
  } else {
    console.log(`  ✓ species.review_status was already confirmed (re-export)`);
  }

  // Git-tracked JSON backup so the export is reviewable in PRs
  // and restorable from disk. Filename includes scientific name +
  // ISO timestamp so successive exports stack rather than overwrite.
  const dumpDir = path.join(ROOT, 'data', 'confirmed-windows');
  fs.mkdirSync(dumpDir, { recursive: true });
  const stamp = exportedAt.toISOString().replace(/[:.]/g, '-');
  const filename = `${slugify(species.scientific_name)}-${stamp}.json`;
  const dumpPath = path.join(dumpDir, filename);
  const payload = {
    scientific_name: species.scientific_name,
    common_name: species.common_name,
    species_id: species.id,
    exported_at: exportedAt.toISOString(),
    notes,
    n_windows: windows.length,
    windows
  };
  fs.writeFileSync(dumpPath, JSON.stringify(payload, null, 2) + '\n');
  console.log(`  ✓ git-tracked JSON dump: data/confirmed-windows/${filename}`);

  await sql.end();
  console.log(`\nConfirmed. The unify pipeline will leave ${species.scientific_name} alone on future runs.`);
  console.log(`Re-run this script anytime you edit the windows to re-confirm with the new values.`);
})().catch((err) => {
  console.error('confirm-species failed:', err);
  sql.end();
  process.exit(2);
});
