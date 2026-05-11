// Extract ONLY factual metadata (URLs, country, license) from
// OpenTrees' per-country source files. Ignores crosswalk mapping
// code, delFunc bodies, gdalOptions — those are creative work
// covered by their CC-BY-NC license.
//
// What we extract is uncopyrightable factual information: "city
// X has tree data at URL Y under license Z." Per US/EU copyright
// law, facts and bare URLs are not protected expression.
//
// Output: opentrees-catalog.json — flat list of source candidates
// for our import discovery process.

const fs = require('fs');
const path = require('path');

const COUNTRIES = [
  'australia', 'austria', 'belgium', 'canada', 'france',
  'germany', 'netherlands', 'spain', 'sweden', 'uk', 'usa'
];

const FACT_FIELDS = [
  'id', 'short', 'long', 'country', 'download', 'info',
  'format', 'license', 'licenseName', 'licenseUrl', 'centre'
];

const out = [];
for (const country of COUNTRIES) {
  const filePath = path.join(__dirname, 'opentrees-sources', `${country}.cjs`);
  let arr;
  try {
    arr = require(filePath);
  } catch (err) {
    console.error(`Failed to load ${country}.cjs:`, err.message);
    continue;
  }
  if (!Array.isArray(arr)) {
    console.error(`${country}.cjs did not export an array`);
    continue;
  }
  for (const src of arr) {
    if (!src || typeof src !== 'object') continue;
    const facts = {};
    for (const k of FACT_FIELDS) {
      if (src[k] !== undefined && typeof src[k] !== 'function') {
        facts[k] = src[k];
      }
    }
    if (!facts.id || !facts.download) continue;
    out.push(facts);
  }
}

console.error(`Extracted ${out.length} source candidates across ${COUNTRIES.length} countries.`);
fs.writeFileSync(
  path.join(__dirname, 'opentrees-catalog.json'),
  JSON.stringify(out, null, 2)
);

const byCountry = {};
for (const f of out) {
  byCountry[f.country || '?'] = (byCountry[f.country || '?'] || 0) + 1;
}
console.error('Per-country counts:');
for (const [c, n] of Object.entries(byCountry).sort((a, b) => b[1] - a[1])) {
  console.error(`  ${c}: ${n}`);
}
