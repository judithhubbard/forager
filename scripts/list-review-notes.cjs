// Lists every species with non-empty review_notes so I can sweep
// through your in-app feedback in batch. Groups by review_status so
// 'needs_work' bubbles to the top.
'use strict';

const fs = require('node:fs');
const env = fs.readFileSync('/Users/jk/Dropbox/Claude/forager/.env.local', 'utf8');
const SUPABASE_DB_URL = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim();
const sql = require('/Users/jk/Dropbox/Claude/forager/node_modules/postgres')(
  SUPABASE_DB_URL,
  { ssl: 'require', onnotice: () => undefined }
);

(async () => {
  const rows = await sql`
    select s.id, s.scientific_name, s.common_name,
           s.review_status, s.review_notes, s.reviewed_at,
           coalesce(ss.n_distinct_sources, 0) as n_sources
      from public.species s
      left join lateral public.species_source_summary(s.id) ss on true
     where s.review_notes is not null
       and length(trim(s.review_notes)) > 0
     order by case s.review_status
                when 'needs_work' then 0
                when 'unreviewed' then 1
                when 'confirmed' then 2
                else 3
              end,
              s.common_name`;

  const groups = { needs_work: [], unreviewed: [], confirmed: [], other: [] };
  for (const r of rows) {
    const k = ['needs_work', 'unreviewed', 'confirmed'].includes(r.review_status)
      ? r.review_status : 'other';
    groups[k].push(r);
  }

  console.log(`Total species with notes: ${rows.length}\n`);

  for (const [k, list] of Object.entries(groups)) {
    if (list.length === 0) continue;
    console.log(`\n=== ${k.toUpperCase()} (${list.length}) ===\n`);
    for (const r of list) {
      console.log(`▸ ${r.common_name} — ${r.scientific_name}`);
      console.log(`  status=${r.review_status}  sources=${r.n_sources}  ` +
                  `reviewed_at=${r.reviewed_at ? new Date(r.reviewed_at).toISOString().slice(0,10) : '—'}`);
      console.log(`  id=${r.id}`);
      console.log(`  notes: ${r.review_notes.replace(/\s+/g, ' ').trim()}`);
      console.log();
    }
  }

  await sql.end();
})();
