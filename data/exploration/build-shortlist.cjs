// Final ranked candidate report for human review.
// Reads opentrees-audited.json + opentrees-gap.json,
// produces opentrees-ranked.md grouped by tier.
//
// Tier A: alive + permissive license + record count present
// Tier B: alive + license unknown (likely OK; needs portal check)
// Tier C: alive but license is restrictive (NC/SA-only) — skip
// Tier D: dead URL — out of date, skip (or repair)

const fs = require('fs');
const path = require('path');

const audited = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'opentrees-audited.json'), 'utf8')
);

function classifyLicense(license) {
  if (!license) return 'unknown';
  const l = String(license).toLowerCase();
  if (l.includes('cc0') || l.includes('public domain')) return 'cc0';
  if (l.includes('odbl')) return 'odbl';
  if (l.includes('cc-by-nc') || l.includes('noncommercial')) return 'nc';
  if (l.includes('cc-by-sa') || l.includes('sharealike')) return 'sa';
  if (l.includes('cc-by') || l.includes('attribution')) return 'cc-by';
  if (l.includes('all rights') || l.includes('proprietary')) return 'proprietary';
  return 'other';
}

function tierOf(c) {
  if (!c.audit_data_head?.alive) return 'D';
  const lic = classifyLicense(c.audit_license);
  if (['cc0', 'cc-by'].includes(lic)) return 'A';
  if (lic === 'unknown') return 'B';
  if (lic === 'odbl' || lic === 'sa') return 'B'; // share-alike on facts is ambiguous; treat as B for review
  if (lic === 'nc' || lic === 'proprietary') return 'C';
  return 'B';
}

const tiers = { A: [], B: [], C: [], D: [] };
for (const c of audited) {
  tiers[tierOf(c)].push(c);
}

let md = '# OpenTrees gap-candidate audit\n\n';
md += `Generated from \`opentrees-gap.json\` cross-referenced against\n`;
md += `our existing import_sources, then HEAD-checked + metadata-pulled.\n\n`;
md += `**${audited.length} candidates audited** (USA + Canada).\n\n`;
md += `| Tier | Description | Count |\n|---|---|---|\n`;
md += `| A | Alive + permissive license (CC0 / CC-BY) | ${tiers.A.length} |\n`;
md += `| B | Alive + license unknown (likely OK; portal check) | ${tiers.B.length} |\n`;
md += `| C | Alive + restrictive license (NC/proprietary) | ${tiers.C.length} |\n`;
md += `| D | Dead URL or fetch failed | ${tiers.D.length} |\n\n`;

for (const tier of ['A', 'B', 'C', 'D']) {
  const list = tiers[tier];
  if (!list.length) continue;
  md += `\n## Tier ${tier}\n\n`;
  list.sort((a, b) => {
    const ar = a.audit_record_count || 0;
    const br = b.audit_record_count || 0;
    if (ar !== br) return br - ar;
    return (a.country || '').localeCompare(b.country || '');
  });
  for (const c of list) {
    const name = c.short || c.id;
    const country = c.country || '?';
    const lic = c.audit_license || c.license || '(unknown)';
    const rows = c.audit_record_count != null ? `${c.audit_record_count.toLocaleString()} rows` : '?';
    const updated = c.audit_last_update ? `updated ${c.audit_last_update.slice(0, 10)}` : '';
    md += `- **${name}** _(${country})_  · ${rows} · ${lic}${updated ? ' · ' + updated : ''}\n`;
    if (c.info) md += `  - portal: ${c.info}\n`;
    md += `  - data: \`${c.download.slice(0, 100)}${c.download.length > 100 ? '…' : ''}\`\n`;
    if (c.audit_data_head?.error) md += `  - HEAD error: ${c.audit_data_head.error}\n`;
  }
}

fs.writeFileSync(path.join(__dirname, 'opentrees-ranked.md'), md);
console.log(`Wrote opentrees-ranked.md (${md.length} bytes)`);
console.log(`Tier A (permissive):       ${tiers.A.length}`);
console.log(`Tier B (license unknown):  ${tiers.B.length}`);
console.log(`Tier C (restrictive):      ${tiers.C.length}`);
console.log(`Tier D (dead/error):       ${tiers.D.length}`);
