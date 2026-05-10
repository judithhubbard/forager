// Clear duplicate sidecar-region text from species_fruiting_windows.notes.
//
// The migrate-regional-sidecar.cjs script added Philadelphia metro,
// Seattle metro, Toronto metro, Ottawa metro, and California UCANR
// entries to the evidence JSONB array. But the same regions had
// existing free-text in the notes column from before the migration,
// e.g.:
//
//   notes: "Philadelphia metro — JUL-AUG per calendar (blackberry)"
//
// That's now duplicated — the same source is in evidence (cited
// properly with supports DOY) AND lingering in notes. The notes
// version is what shows up in the calibration viewer's "Notes"
// section, making it look like the source isn't in evidence.
//
// This script clears notes that match the sidecar-region prefix
// pattern AND have a matching source in evidence (safety check —
// don't blow away notes that aren't actually duplicated).
//
// Idempotent.

'use strict';

const fs = require('node:fs');
const env = fs.readFileSync('/Users/jk/Dropbox/Claude/forager/.env.local', 'utf8');
const SUPABASE_DB_URL = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim();
const sql = require('/Users/jk/Dropbox/Claude/forager/node_modules/postgres')(
  SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined }
);

const REGIONS = [
  'Philadelphia metro',
  'Seattle metro',
  'Toronto metro',
  'Ottawa metro',
  'California (UCANR statewide)'
];

(async () => {
  let cleared = 0, skippedNoMatch = 0;
  for (const region of REGIONS) {
    const rows = await sql`
      select id, notes, coalesce(evidence, '[]'::jsonb) as evidence
        from species_fruiting_windows
       where notes ilike ${'%' + region + '%'}`;
    for (const r of rows) {
      // Safety: only clear if the same region IS in the evidence array.
      const ev = Array.isArray(r.evidence) ? r.evidence : [];
      const inEvidence = ev.some(e => (e?.source ?? '').includes(region));
      if (!inEvidence) {
        skippedNoMatch++;
        continue;
      }
      // Strip the sidecar-region line from notes. If notes contains ONLY
      // sidecar text, set to NULL. Otherwise, remove the matching line.
      const notes = r.notes ?? '';
      const lines = notes.split(/\n/);
      const remaining = lines.filter(line => !line.includes(region));
      const newNotes = remaining.join('\n').trim() || null;
      if (newNotes === r.notes) continue;
      await sql`
        update species_fruiting_windows
           set notes = ${newNotes},
               updated_at = now()
         where id = ${r.id}`;
      cleared++;
    }
    console.log(`  ${region}: ${rows.length} rows touched, ${cleared} cleared`);
  }
  console.log(`\nTotal: ${cleared} cleared, ${skippedNoMatch} skipped (no matching evidence)`);
  await sql.end();
})();
