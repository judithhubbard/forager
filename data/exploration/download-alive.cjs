// Download all alive USA+Canada candidate sources to
// data/raw/opentrees/<country>/<id>.<ext>
//
// We grab the file as-is (CSV, GeoJSON, or zip) and unzip if needed.
// Then a separate inspect step samples the schema.

const fs = require('fs');
const path = require('path');
const { execSync } = require('node:child_process');

const audit = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'opentrees-audited-usa-canada.json'), 'utf8')
);

const RAW_ROOT = path.resolve(__dirname, '../raw/opentrees');
fs.mkdirSync(RAW_ROOT, { recursive: true });

const alive = audit.filter(c => c.audit_data_head?.alive);
console.log(`Downloading ${alive.length} alive sources…`);

function extOf(url, format) {
  const m = url.match(/\.(csv|zip|geojson|json|kml)(?:\?|$)/i);
  if (m) return m[1].toLowerCase();
  if (format) return format;
  // Socrata defaults to csv
  if (url.includes('rows.csv')) return 'csv';
  return 'csv';
}

async function downloadOne(c) {
  const country = c.country.toLowerCase();
  const dir = path.join(RAW_ROOT, country);
  fs.mkdirSync(dir, { recursive: true });
  const ext = extOf(c.download, c.format);
  const out = path.join(dir, `${c.id}.${ext}`);
  if (fs.existsSync(out) && fs.statSync(out).size > 0) {
    return { id: c.id, status: 'cached', size: fs.statSync(out).size };
  }
  try {
    // Use curl — handles large files better than node fetch
    execSync(
      `curl -sSL --max-time 180 -o "${out}.partial" "${c.download.replace(/"/g, '\\"')}"`,
      { stdio: 'pipe' }
    );
    fs.renameSync(`${out}.partial`, out);
    const size = fs.statSync(out).size;
    return { id: c.id, status: 'downloaded', size, path: out };
  } catch (err) {
    return { id: c.id, status: 'failed', error: err.message };
  }
}

(async () => {
  const results = [];
  let cursor = 0;
  const CONC = 4;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= alive.length) return;
      const c = alive[i];
      const r = await downloadOne(c);
      results.push({ ...c, ...r });
      const tag = r.status === 'cached' ? '·' : r.status === 'downloaded' ? '✓' : '✗';
      const sizeStr = r.size ? `${(r.size/1024).toFixed(0)}KB` : '';
      console.log(`${tag} [${results.length}/${alive.length}] ${c.country.padEnd(7)} ${c.short || c.id} (${sizeStr})`);
    }
  }
  await Promise.all(Array.from({ length: CONC }, () => worker()));

  fs.writeFileSync(
    path.join(__dirname, 'download-results.json'),
    JSON.stringify(results, null, 2)
  );
  const ok = results.filter(r => r.status === 'downloaded' || r.status === 'cached').length;
  const fail = results.filter(r => r.status === 'failed').length;
  console.log(`\n${ok} downloaded, ${fail} failed`);
})();
