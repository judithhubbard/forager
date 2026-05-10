// Cleanup: strip stale auto-generated boilerplate from window notes.
//
// The notes column should hold human-meaningful guidance (forager
// tips, region quirks, calibration revision history). Several legacy
// scripts (species-web-crawl, inat-phenology, an old rederive) wrote
// auto-generated boilerplate into notes that duplicates info already
// in the evidence array. Examples:
//
//   "Synthesized from 2 fact(s); base zone 5b; window 4a: DOY 234-294 peak 257."
//   "iNaturalist phenology empirical: N=124, bias-corrected p15/p50/p85 = 169/206/231..."
//   "NPN n=50, sites=10, range 238-306"
//
// These appear either as the full note (drop entirely) or appended to
// manually-authored prose (strip the boilerplate suffix, keep prose).
//
// The boilerplate from current pipeline scripts (frost-driven, complex-
// unify, sap-flow) is contextually meaningful and is NOT stripped.
//
// Idempotent.

'use strict';

const fs = require('node:fs');
const env = fs.readFileSync('/Users/jk/Dropbox/Claude/forager/.env.local', 'utf8');
const SUPABASE_DB_URL = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim();
const sql = require('/Users/jk/Dropbox/Claude/forager/node_modules/postgres')(
  SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined }
);

// Boilerplate fragments to strip. Each pattern matches the boilerplate
// either as a full note or as a suffix appended to prose.
const STRIP_PATTERNS = [
  // Old rederive: "Synthesized from N fact(s); base zone X; window Y: DOY a-b[ peak c]."
  /\s*Synthesized from \d+ fact\(s\);\s*base zone [0-9a-z]+;\s*window [0-9a-z]+:\s*DOY \d+-\d+(?:\s*peak \d+)?\.\s*$/,
  // iNat phenology empirical line — bias-corrected long form
  /\s*iNaturalist phenology empirical:\s*N=\d+,\s*bias-corrected p15\/p50\/p85\s*=\s*\d+\/\d+\/\d+\.\s*Raw p10=\d+,\s*p90=\d+\.\s*$/,
  // iNat phenology empirical line — older short form
  /\s*iNaturalist phenology empirical:\s*N=\d+,\s*p10\/p50\/p90\s*=\s*\d+\/\d+\/\d+\.\s*$/,
  // NPN brief
  /\s*NPN n=\d+,\s*sites=\d+,\s*range \d+-\d+\s*$/,
  // Great Morel sightings brief
  /\s*The Great Morel:\s*n_sightings=\d+,\s*zips=\d+,\s*years=\d+,\s*range \d+-\d+\s*$/
];

function clean(note) {
  if (!note) return note;
  let s = note;
  for (const pat of STRIP_PATTERNS) {
    s = s.replace(pat, '');
  }
  s = s.trim();
  return s.length === 0 ? null : s;
}

(async () => {
  const rows = await sql`
    select w.id, w.notes
      from species_fruiting_windows w
      join species s on s.id = w.species_id
     where w.notes is not null and w.notes != '' and s.is_forageable = true`;

  let nulled = 0, trimmed = 0, unchanged = 0;
  for (const r of rows) {
    const cleaned = clean(r.notes);
    if (cleaned === r.notes) { unchanged++; continue; }
    if (cleaned === null) {
      await sql`update species_fruiting_windows set notes = null, updated_at = now() where id = ${r.id}`;
      nulled++;
    } else {
      await sql`update species_fruiting_windows set notes = ${cleaned}, updated_at = now() where id = ${r.id}`;
      trimmed++;
    }
  }
  console.log(`Notes cleanup: ${nulled} fully-removed, ${trimmed} suffix-stripped, ${unchanged} unchanged. (Total checked: ${rows.length})`);
  await sql.end();
})();
