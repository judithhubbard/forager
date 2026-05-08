// Cross-reference us-tree-source-candidates.md against the
// import_sources table. For each candidate, mark:
//   "have"     — we've already imported this city/institution
//                (substring match on city/state names)
//   "partial"  — we have the city in Dryad but candidate suggests
//                a richer source (e.g. Phoenix's Socrata richer
//                than Dryad iTree extract)
//   "new"      — no existing source matches
//
// Output: data/exploration/us-tree-candidates-cross-referenced.md
// with the new entries first, sorted by state then name.

const fs = require('fs');
const path = require('path');
const postgres = require('postgres');
const { config } = require('dotenv');
config({ path: path.resolve(__dirname, '..', '.env.local') });

const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined });

(async () => {
  // 1. Load existing import_sources
  const sources = await sql`select id, name from public.import_sources order by id`;
  await sql.end();

  // Build a tokenized index of the city/institution names we already have.
  const existing = new Set();
  for (const s of sources) {
    const tokens = `${s.id} ${s.name}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 4);
    for (const t of tokens) existing.add(t);
    // Also index full normalized id (e.g. 'dryad-trees-rochester' → 'rochester')
    const idTokens = s.id.toLowerCase().split(/[^a-z]+/).filter((t) => t.length >= 4);
    for (const t of idTokens) existing.add(t);
  }

  // Load candidates
  const md = fs.readFileSync(
    path.resolve(__dirname, '../data/exploration/us-tree-source-candidates.md'),
    'utf8'
  );
  const lines = md.split('\n');
  const dataRows = [];
  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    if (line.includes('---')) continue;
    if (line.toLowerCase().includes('| name |')) continue;
    const cells = line.split('|').map((c) => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
    if (cells.length < 6) continue;
    dataRows.push({
      name: cells[0],
      type: cells[1],
      state: cells[2],
      url: cells[3],
      format: cells[4],
      note: cells[5]
    });
  }

  // Classify
  const out = dataRows.map((r) => {
    // Tokenize the candidate's name + note for matching
    const tokens = `${r.name} ${r.note}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 4 && !['tree', 'trees', 'inventory', 'street', 'street trees', 'park', 'parks', 'data', 'open', 'gardens', 'arboretum', 'university', 'campus', 'forest', 'forestry', 'urban', 'foundation', 'center', 'public'].includes(t));
    const matches = tokens.filter((t) => existing.has(t));
    let status = 'new';
    if (matches.length > 0) status = 'have';
    // Check note for "richer than Dryad" hint
    if (/richer than dryad|Richer than Dryad/i.test(r.note)) status = 'partial';
    return { ...r, status, matches };
  });

  // Sort: new first, then partial, then have. Within each, sort by state, name.
  const order = { new: 0, partial: 1, have: 2 };
  out.sort((a, b) => {
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    if (a.state !== b.state) return a.state.localeCompare(b.state);
    return a.name.localeCompare(b.name);
  });

  // Write output
  let output = `# US Tree Source Candidates — Cross-Referenced\n\n`;
  output += `Cross-referenced against ${sources.length} existing import_sources.\n`;
  const counts = { new: 0, partial: 0, have: 0 };
  for (const r of out) counts[r.status]++;
  output += `\n- **${counts.new} new** candidates (no existing match)\n`;
  output += `- **${counts.partial} partial** (we have the city in Dryad but a richer source may exist)\n`;
  output += `- **${counts.have} already-have** (skip)\n\n`;
  output += `| Status | Name | Type | State | URL | Format | Note |\n`;
  output += `|---|---|---|---|---|---|---|\n`;
  for (const r of out) {
    const flag = r.status === 'new' ? '🟢 new' : r.status === 'partial' ? '🟡 partial' : '⚪ have';
    output += `| ${flag} | ${r.name} | ${r.type} | ${r.state} | ${r.url} | ${r.format} | ${r.note} |\n`;
  }

  fs.writeFileSync(
    path.resolve(__dirname, '../data/exploration/us-tree-candidates-cross-referenced.md'),
    output
  );
  console.log(`Wrote cross-referenced candidates:`);
  console.log(`  new:     ${counts.new}`);
  console.log(`  partial: ${counts.partial}`);
  console.log(`  have:    ${counts.have}`);
  console.log(`  total:   ${out.length}`);
})();
