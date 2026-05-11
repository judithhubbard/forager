// Cross-reference OpenTrees catalog against our existing import_sources.
// Output: opentrees-gap.json — sources we haven't imported yet, with
// license + URL annotations.

const postgres = require('postgres');
const { config } = require('dotenv');
const path = require('path');
const fs = require('fs');

config({ path: path.resolve(__dirname, '../../.env.local') });

const catalog = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'opentrees-catalog.json'), 'utf8')
);

(async () => {
  const sql = postgres(process.env.SUPABASE_DB_URL, {
    ssl: 'require', onnotice: () => undefined
  });
  const existing = await sql`
    select id, name, url, description from public.import_sources
  `;
  await sql.end();

  const have = new Set();
  // Map by lowercased fragments — name/url/id substrings
  for (const e of existing) {
    have.add((e.id || '').toLowerCase());
    if (e.url) have.add(e.url.toLowerCase());
    // Pull city tokens from the name and url
    const tokens = `${e.name || ''} ${e.url || ''}`
      .toLowerCase()
      .replace(/[^a-z]+/g, ' ')
      .split(' ')
      .filter(t => t.length >= 4);
    tokens.forEach(t => have.add(t));
  }

  // Extracted city tokens we know we have, for matching candidates
  // by city/short name.
  const ourCities = new Set([
    'newyork', 'sanfrancisco', 'boston', 'chicago', 'philadelphia',
    'losangeles', 'seattle', 'denver', 'aurora', 'austin', 'dallas',
    'houston', 'phoenix', 'sandiego', 'portland', 'minneapolis',
    'cincinnati', 'cleveland', 'pittsburgh', 'baltimore', 'washington',
    'ithaca', 'cornell',
    // Add more as needed; this is intentionally conservative.
  ]);

  const gap = [];
  const probably_have = [];
  for (const c of catalog) {
    const tokens = `${c.id} ${c.short || ''} ${c.long || ''}`
      .toLowerCase()
      .replace(/[^a-z]+/g, ' ');
    const cityKey = tokens.replace(/\s+/g, '');
    let alreadyHave = false;
    for (const our of ourCities) {
      if (cityKey.includes(our)) { alreadyHave = true; break; }
    }
    if (alreadyHave) {
      probably_have.push(c);
    } else {
      gap.push(c);
    }
  }

  // Sort gap by country then license clarity (CC0/CC-BY first).
  const licScore = (l) => {
    if (!l) return 5;
    const ll = String(l).toLowerCase();
    if (ll.includes('cc0') || ll.includes('public domain')) return 0;
    if (ll.includes('cc-by') && !ll.includes('nc') && !ll.includes('sa')) return 1;
    if (ll.includes('cc-by-sa')) return 2;
    if (ll.includes('odbl')) return 2;
    if (ll.includes('cc-by-nc')) return 4;
    return 3;
  };

  gap.sort((a, b) => {
    if (a.country !== b.country) return (a.country || 'z').localeCompare(b.country || 'z');
    return licScore(a.license) - licScore(b.license);
  });

  fs.writeFileSync(
    path.join(__dirname, 'opentrees-gap.json'),
    JSON.stringify(gap, null, 2)
  );
  fs.writeFileSync(
    path.join(__dirname, 'opentrees-probably-have.json'),
    JSON.stringify(probably_have, null, 2)
  );

  console.log(`existing import_sources in DB: ${existing.length}`);
  console.log(`OpenTrees catalog total:        ${catalog.length}`);
  console.log(`probably already have:          ${probably_have.length}`);
  console.log(`gap (new candidates):           ${gap.length}`);

  // License distribution within gap
  const lic = {};
  for (const g of gap) {
    const k = g.license || '(no license tag)';
    lic[k] = (lic[k] || 0) + 1;
  }
  console.log('\nGap by license:');
  for (const [k, n] of Object.entries(lic).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n.toString().padStart(3)}  ${k}`);
  }
  // Country distribution
  const byCountry = {};
  for (const g of gap) {
    byCountry[g.country || '?'] = (byCountry[g.country || '?'] || 0) + 1;
  }
  console.log('\nGap by country:');
  for (const [k, n] of Object.entries(byCountry).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n.toString().padStart(3)}  ${k}`);
  }
})().catch(e => { console.error(e); process.exit(1); });
