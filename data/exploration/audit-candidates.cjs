// Audit OpenTrees gap candidates: HEAD-check the data URL, try
// to fetch portal metadata, collect license + row-count info.
// Output: opentrees-audited.json (one row per candidate with audit
// fields appended).
//
// Strategy:
// - For ArcGIS Hub URLs (opendata.arcgis.com), try the dataset's
//   metadata endpoint to read license + record count.
// - For Socrata URLs (api/views), try /api/views/<id>.json for
//   metadata. Socrata exposes license + rowCount.
// - Otherwise, just HEAD the data URL.
//
// Failures are recorded; we don't drop candidates on transient
// errors.

const fs = require('fs');
const path = require('path');

const CONCURRENCY = 8;
const TIMEOUT_MS = 12000;
const COUNTRIES_FILTER = process.env.COUNTRIES?.split(',') ||
  ['USA', 'Canada', 'Australia', 'UK', 'New Zealand',
   'France', 'Germany', 'Netherlands', 'Belgium', 'Austria', 'Spain', 'Sweden'];

const gap = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'opentrees-gap.json'), 'utf8')
);

async function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout ${label}`)), ms))
  ]);
}

async function tryFetchJson(url) {
  try {
    const res = await withTimeout(fetch(url, { redirect: 'follow' }), TIMEOUT_MS, url);
    if (!res.ok) return { error: `${res.status}` };
    const text = await res.text();
    try { return { json: JSON.parse(text) }; } catch { return { error: 'not-json' }; }
  } catch (err) {
    return { error: err.message };
  }
}

async function headDataUrl(url) {
  try {
    const res = await withTimeout(fetch(url, { method: 'HEAD', redirect: 'follow' }), TIMEOUT_MS, url);
    return {
      alive: res.ok,
      status: res.status,
      contentType: res.headers.get('content-type'),
      contentLength: res.headers.get('content-length')
    };
  } catch (err) {
    return { alive: false, error: err.message };
  }
}

function arcgisHubMetaUrl(dataUrl) {
  // https://opendata.arcgis.com/datasets/<UUID>_<n>.csv
  // → https://opendata.arcgis.com/datasets/<UUID>_<n>.json
  const m = dataUrl.match(/opendata\.arcgis\.com\/datasets\/([a-f0-9]{32}_\d+)\.(csv|zip|geojson)/);
  if (m) return `https://opendata.arcgis.com/datasets/${m[1]}.json`;
  return null;
}

function socrataMetaUrl(dataUrl) {
  // https://data.cityname.gov/api/views/<id>/rows.csv?...
  const m = dataUrl.match(/^(https?:\/\/[^/]+)\/api\/views\/([a-z0-9]{4}-[a-z0-9]{4})\/rows\.(csv|json)/);
  if (m) return `${m[1]}/api/views/${m[2]}.json`;
  return null;
}

async function auditOne(c) {
  const result = { ...c };
  const arcgisMeta = arcgisHubMetaUrl(c.download);
  const socrataMeta = socrataMetaUrl(c.download);
  if (arcgisMeta) {
    const meta = await tryFetchJson(arcgisMeta);
    if (meta.json) {
      const j = meta.json;
      result.audit_license = j.license || j.licenseInfo || null;
      result.audit_record_count = j.recordCount || null;
      result.audit_last_update = j.modified || null;
      result.audit_title = j.title || null;
      result.audit_meta_source = 'arcgis-hub';
    } else {
      result.audit_meta_error = meta.error || 'unknown';
    }
  } else if (socrataMeta) {
    const meta = await tryFetchJson(socrataMeta);
    if (meta.json) {
      const j = meta.json;
      result.audit_license = (j.license && j.license.name) || j.licenseId || null;
      result.audit_record_count = j.viewCount || null;
      result.audit_last_update = j.rowsUpdatedAt
        ? new Date(j.rowsUpdatedAt * 1000).toISOString()
        : null;
      result.audit_title = j.name || null;
      result.audit_meta_source = 'socrata';
    } else {
      result.audit_meta_error = meta.error || 'unknown';
    }
  } else {
    result.audit_meta_source = 'none';
  }
  // HEAD the data URL too
  result.audit_data_head = await headDataUrl(c.download);
  // Also HEAD the portal info URL — even when the data URL has
  // rotted, an alive portal page means the city still publishes
  // tree data and we can re-discover the current URL.
  if (c.info) {
    result.audit_portal_head = await headDataUrl(c.info);
  }
  return result;
}

async function runWithConcurrency(items, fn) {
  const results = [];
  let inFlight = [];
  for (let i = 0; i < items.length; i++) {
    const p = fn(items[i]).then(r => {
      results.push(r);
      process.stdout.write(`  audited ${results.length}/${items.length}\r`);
    });
    inFlight.push(p);
    if (inFlight.length >= CONCURRENCY) {
      await Promise.race(inFlight);
      inFlight = inFlight.filter(x => !x.settled);
      // Drain finished promises
      const settled = await Promise.allSettled(inFlight.slice(0, 1));
      inFlight = inFlight.slice(1);
    }
  }
  await Promise.all(inFlight);
  return results;
}

(async () => {
  const targets = gap.filter(c => COUNTRIES_FILTER.includes(c.country));
  console.log(`Auditing ${targets.length} candidates from ${COUNTRIES_FILTER.join(', ')}…`);

  // Simple bounded concurrency loop
  const out = [];
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= targets.length) return;
      const r = await auditOne(targets[i]);
      out.push(r);
      process.stdout.write(`  ${out.length}/${targets.length}\r`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  console.log('');

  fs.writeFileSync(
    path.join(__dirname, 'opentrees-audited.json'),
    JSON.stringify(out, null, 2)
  );

  // Quick stats
  const alive = out.filter(o => o.audit_data_head?.alive).length;
  const dead = out.filter(o => !o.audit_data_head?.alive).length;
  const withLicense = out.filter(o => o.audit_license).length;
  console.log(`alive URLs:           ${alive}`);
  console.log(`dead URLs:            ${dead}`);
  console.log(`with license tag:     ${withLicense}`);

  const licDist = {};
  for (const o of out) {
    if (!o.audit_license) continue;
    const k = String(o.audit_license).slice(0, 80);
    licDist[k] = (licDist[k] || 0) + 1;
  }
  console.log('\nAudited license distribution:');
  for (const [k, n] of Object.entries(licDist).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n.toString().padStart(3)}  ${k}`);
  }
})().catch(e => { console.error(e); process.exit(1); });
