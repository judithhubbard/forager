// Scan the 184 "new" tree-source candidate URLs for viability.
// URLs in the candidates file are templates — many will 404. This
// script triages:
//
//   alive       — domain reachable, page returned
//   no_data     — page reachable but no tree-related content
//   dead        — 404 / DNS fails / connection refused
//   arcgis_hub  — ArcGIS Hub URL → query the federated search API
//                 for actual tree dataset URLs (much more reliable
//                 than HEAD-checking the template)
//   socrata     — Socrata domain → query the discovery API
//
// For ArcGIS Hub matches we surface the actual dataset title +
// URL + record count. For Socrata, same. The resulting verified-
// candidate set becomes the import backlog.

const fs = require('fs');
const path = require('path');

const TIMEOUT_MS = 12000;
const CONCURRENCY = 6;

const md = fs.readFileSync(
  path.resolve(__dirname, '../data/exploration/us-tree-candidates-cross-referenced.md'),
  'utf8'
);

// Parse the table, keep only status='new' rows
const rows = [];
for (const line of md.split('\n')) {
  if (!line.startsWith('|')) continue;
  if (line.includes('---')) continue;
  if (line.toLowerCase().includes('| status |')) continue;
  const cells = line.split('|').map((c) => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
  if (cells.length < 7) continue;
  if (!cells[0].includes('new')) continue;
  rows.push({
    name: cells[1],
    type: cells[2],
    state: cells[3],
    url: cells[4],
    format: cells[5],
    note: cells[6]
  });
}
console.log(`Loaded ${rows.length} 'new' candidates to scan.`);

async function withTimeout(p, ms) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
  ]);
}

async function safeFetch(url, opts = {}) {
  try {
    const res = await withTimeout(
      fetch(url, { redirect: 'follow', ...opts }),
      TIMEOUT_MS
    );
    return res;
  } catch (e) {
    return null;
  }
}

function deriveDomain(url) {
  try { return new URL(url).hostname; } catch { return null; }
}

/** ArcGIS Hub federated search.
 *  Returns up to 10 dataset hits matching "tree <city>". Each has
 *  .attributes.{name,url,recordCount,license,modified}. */
async function arcgisHubSearch(cityNameOrNote) {
  const q = encodeURIComponent(`tree inventory ${cityNameOrNote}`);
  const url = `https://hub.arcgis.com/api/v3/datasets?q=${q}&page[size]=5`;
  const res = await safeFetch(url, { headers: { Accept: 'application/json' } });
  if (!res || !res.ok) return null;
  let data;
  try { data = await res.json(); } catch { return null; }
  return (data.data ?? []).map((d) => ({
    title: d.attributes?.name ?? '?',
    url: d.attributes?.url ?? d.attributes?.itemUrl ?? '?',
    records: d.attributes?.recordCount ?? null,
    license: d.attributes?.licenseInfo ?? null,
    modified: d.attributes?.modified ?? null
  }));
}

/** Socrata federated discovery search. Returns up to 5 dataset
 *  hits matching "tree" within the given domain. */
async function socrataSearch(domain, cityName) {
  const q = encodeURIComponent('tree');
  const url = `https://api.us.socrata.com/api/catalog/v1?q=${q}&domains=${domain}&limit=5`;
  const res = await safeFetch(url, { headers: { Accept: 'application/json' } });
  if (!res || !res.ok) return null;
  let data;
  try { data = await res.json(); } catch { return null; }
  return (data.results ?? []).map((d) => ({
    title: d.resource?.name ?? '?',
    url: d.permalink ?? d.link ?? '?',
    records: d.resource?.rows_updated_at ? null : null,
    license: d.metadata?.license ?? null,
    modified: d.resource?.updatedAt ?? null
  }));
}

async function scanOne(row) {
  const out = { ...row, status: 'unknown', hits: null, error: null };
  const domain = deriveDomain(row.url);
  if (!domain) { out.status = 'dead'; out.error = 'invalid url'; return out; }

  // Format-aware probe
  if (/arcgis|opendata\.arcgis|hub\.arcgis/i.test(row.url) ||
      /ArcGIS Hub/i.test(row.format)) {
    const hits = await arcgisHubSearch(row.name);
    if (hits === null) { out.status = 'dead'; out.error = 'arcgis api unreachable'; return out; }
    out.status = hits.length > 0 ? 'arcgis_hub' : 'no_data';
    out.hits = hits;
    return out;
  }
  if (/Socrata/i.test(row.format) || /^data\./.test(domain)) {
    const hits = await socrataSearch(domain, row.name);
    if (hits === null) {
      // Fall through to HEAD probe in case it's not actually Socrata
    } else {
      out.status = hits.length > 0 ? 'socrata' : 'no_data';
      out.hits = hits;
      return out;
    }
  }
  // Generic HEAD probe
  const res = await safeFetch(row.url, { method: 'HEAD' });
  if (!res) { out.status = 'dead'; out.error = 'unreachable'; return out; }
  out.status = res.ok ? 'alive' : 'dead';
  if (!res.ok) out.error = `${res.status}`;
  return out;
}

(async () => {
  const results = [];
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= rows.length) return;
      const r = await scanOne(rows[i]);
      results.push(r);
      const tag = {
        arcgis_hub: '🟢',
        socrata: '🟢',
        alive: '🟡',
        no_data: '⚪',
        dead: '✗',
        unknown: '?'
      }[r.status] || '?';
      const hits = r.hits ? `${r.hits.length} datasets` : (r.error || '');
      console.log(`${tag} [${results.length}/${rows.length}] ${r.state.padEnd(2)} ${r.name.padEnd(34)} ${r.status.padEnd(11)} ${hits}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  // Save full results
  fs.writeFileSync(
    path.resolve(__dirname, '../data/exploration/us-tree-candidates-scanned.json'),
    JSON.stringify(results, null, 2)
  );

  // Build a markdown report
  let md = `# US Tree Source Candidates — Scanned\n\n`;
  const counts = {};
  for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;
  for (const [k, n] of Object.entries(counts)) md += `- **${k}**: ${n}\n`;
  md += `\n`;
  // Sort: arcgis_hub & socrata first (verified), then alive, then dead
  const order = { arcgis_hub: 0, socrata: 1, alive: 2, no_data: 3, dead: 4, unknown: 5 };
  results.sort((a, b) => {
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    return (a.state + a.name).localeCompare(b.state + b.name);
  });

  md += `## Verified hits (real tree datasets found)\n\n`;
  md += `| State | Name | Type | Status | Top hit | Records | License |\n|---|---|---|---|---|---|---|\n`;
  for (const r of results) {
    if (r.status !== 'arcgis_hub' && r.status !== 'socrata') continue;
    const top = r.hits?.[0];
    if (!top) continue;
    const recs = top.records ? Number(top.records).toLocaleString() : '?';
    const lic = (top.license || '').slice(0, 30);
    md += `| ${r.state} | ${r.name} | ${r.type} | ${r.status} | ${top.title.slice(0, 60)} | ${recs} | ${lic} |\n`;
  }

  md += `\n## Other (alive but unverified, or dead)\n\n`;
  md += `| State | Name | Type | Status | URL | Note |\n|---|---|---|---|---|---|\n`;
  for (const r of results) {
    if (r.status === 'arcgis_hub' || r.status === 'socrata') continue;
    md += `| ${r.state} | ${r.name} | ${r.type} | ${r.status} | ${r.url} | ${r.error || r.note || ''} |\n`;
  }

  fs.writeFileSync(
    path.resolve(__dirname, '../data/exploration/us-tree-candidates-scanned.md'),
    md
  );
  console.log(`\nResults:`);
  for (const [k, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${n}`);
  }
})();
