// Print a readable shortlist by country, prioritizing USA + Canada
// (where our species catalog overlap is highest), then Anglophone
// commonwealth countries (AU/UK), then EU.

const fs = require('fs');
const path = require('path');

const gap = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'opentrees-gap.json'), 'utf8')
);

const PRIORITY = ['USA', 'Canada', 'Australia', 'UK', 'New Zealand',
  'France', 'Germany', 'Netherlands', 'Belgium', 'Austria',
  'Spain', 'Sweden'];

const byCountry = {};
for (const g of gap) {
  const c = g.country || '?';
  if (!byCountry[c]) byCountry[c] = [];
  byCountry[c].push(g);
}

for (const country of PRIORITY) {
  const list = byCountry[country];
  if (!list || list.length === 0) continue;
  console.log(`\n══════════════════════════════════════════════════`);
  console.log(`  ${country}  (${list.length} candidates)`);
  console.log(`══════════════════════════════════════════════════`);
  for (const s of list) {
    const lic = s.license ? `[${s.license}]` : '[license unknown]';
    const short = s.short || s.id;
    const long = s.long ? ` (${s.long})` : '';
    console.log(`\n  ${short}${long}   ${lic}`);
    if (s.info) console.log(`    info: ${s.info}`);
    console.log(`    data: ${s.download.substring(0, 110)}${s.download.length > 110 ? '…' : ''}`);
  }
}
