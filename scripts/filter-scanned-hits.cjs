// The federated ArcGIS Hub search returns the same generic "Tree
// Inventory Park Trees" dataset (3,402 records) for many unrelated
// city queries, so the raw scan output looks artificially good.
// Filter to hits where the dataset is genuinely about the city.
//
// Filter rules:
//   1. Drop hits where the title is the generic "Tree Inventory
//      Park Trees" 3,402-row dataset (a single OpenStreetMap-based
//      sample dataset that pollutes search results).
//   2. Keep hits where the title or URL contains the city/state token.
//   3. For arcgis_hub: prefer hits with recordCount > 1000.

const fs = require('fs');
const path = require('path');

const data = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, '../data/exploration/us-tree-candidates-scanned.json'),
    'utf8'
  )
);

// Tokenize a name into low-noise keywords (drop stopwords + general
// terms like "trees", "city", etc.).
const STOPWORDS = new Set([
  'tree', 'trees', 'inventory', 'street', 'park', 'parks',
  'data', 'open', 'gardens', 'garden', 'arboretum', 'university',
  'campus', 'forest', 'forestry', 'urban', 'foundation', 'center',
  'public', 'the', 'and', 'of', 'a', 'an', 'with', 'or', 'in', 'on',
  'at', 'to', 'for', 'is', 'are'
]);
function tokensOf(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
}

const out = [];
for (const r of data) {
  if (r.status !== 'arcgis_hub' && r.status !== 'socrata') continue;
  const candidateTokens = new Set(tokensOf(r.name));
  // Add state code as token, and a couple state-name aliases
  candidateTokens.add(r.state.toLowerCase());

  const verifiedHits = (r.hits || []).filter((h) => {
    const titleToks = tokensOf(h.title);
    // Drop the noise dataset that dominates federated search
    if (titleToks.includes('park') && titleToks.includes('trees') &&
        Number(h.records) === 3402) {
      return false;
    }
    // Match if any candidate token appears in the title or URL
    const hayToks = tokensOf(`${h.title} ${h.url}`);
    return hayToks.some((t) => candidateTokens.has(t));
  });

  if (verifiedHits.length === 0) continue;

  // Sort by record count desc when available
  verifiedHits.sort((a, b) => (Number(b.records) || 0) - (Number(a.records) || 0));
  out.push({ ...r, verifiedHits });
}

// Sort by top hit's record count (interest-weighted)
out.sort((a, b) => {
  const ar = Number(a.verifiedHits[0]?.records) || 0;
  const br = Number(b.verifiedHits[0]?.records) || 0;
  return br - ar;
});

let md = `# US Tree Candidates — Verified Hits (filtered)\n\n`;
md += `${out.length} city/institution candidates with at least one\n`;
md += `dataset whose title or URL contains the candidate's name.\n`;
md += `Sorted by top-hit record count.\n\n`;
md += `| State | Name | Type | Top hit | Records | URL |\n|---|---|---|---|---|---|\n`;
for (const r of out) {
  const top = r.verifiedHits[0];
  const recs = top.records ? Number(top.records).toLocaleString() : '?';
  md += `| ${r.state} | ${r.name} | ${r.type} | ${top.title.slice(0, 50)} | ${recs} | ${top.url} |\n`;
}
fs.writeFileSync(
  path.resolve(__dirname, '../data/exploration/us-tree-candidates-verified.md'),
  md
);
console.log(`Wrote ${out.length} verified candidates to us-tree-candidates-verified.md`);

// Also print top 30 to console
console.log(`\nTop 30 by record count:`);
for (const r of out.slice(0, 30)) {
  const top = r.verifiedHits[0];
  const recs = top.records ? Number(top.records).toLocaleString() : '?';
  console.log(`  ${r.state.padEnd(2)} ${r.name.padEnd(34)} ${recs.padStart(10)}  ${top.title.slice(0, 50)}`);
}
