// Dry-run match: for each downloaded source, parse rows, attempt
// to match against our species catalog, and report:
//   - total rows
//   - matched rows
//   - unmatched scientific names with counts
//
// Aggregates unmatched names ACROSS all sources so we get a single
// ranked list of "candidate species to add to catalog if edible."

const fs = require('fs');
const path = require('path');
const postgres = require('postgres');
const { config } = require('dotenv');
const { execSync } = require('node:child_process');

config({ path: path.resolve(__dirname, '../../.env.local') });

const downloads = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'download-results.json'), 'utf8')
);

// Common column-name candidates for each field. Lowercased compare.
const SCI_KEYS = [
  'botanical_name', 'botanic_name', 'botanical', 'botanic',
  'scientific_name', 'scientific', 'sciname',
  'species_name', 'latin_name', 'latin', 'genus_species',
  'spp_bot', 'spp_bot_', 'binomial', 'science', 'binom'
];
const COM_KEYS = [
  'common_name', 'common', 'commonname', 'name_common',
  'species_common', 'species_co', 'name_eng', 'commonname_',
  'spp_com', 'commonnam'
];
// Ambiguous "species" column: could be a binomial ("Acer saccharum"),
// an epithet ("saccharum"), or a common name ("sugar maple"). Resolve
// by sampling values.
const AMBIG_SPECIES_KEYS = ['species', 'spp', 'specie', 'spec'];
const GENUS_KEYS = ['genus'];
const LAT_KEYS = ['lat', 'latitude', 'y', 'lat_dd', 'point_y'];
const LNG_KEYS = ['lng', 'lon', 'long', 'longitude', 'x', 'lng_dd', 'point_x'];

const norm = (s) => String(s).toLowerCase().trim().replace(/\s+/g, ' ');

// Mirrors framework.ts normalizeSpeciesName — strips cultivar and
// hybrid markers so 'Ulmus americana Brandon' → 'Ulmus americana'.
function normalizeSpeciesName(raw) {
  if (!raw) return '';
  let s = String(raw).trim();
  s = s.replace(/['‘’"][^'‘’"]+['‘’"]/g, '');
  s = s.replace(/\([^)]*\)/g, '');
  s = s.replace(/\b(?:subsp|ssp|var|f|cv)\.[^,]*$/i, '');
  s = s.replace(/\bx\s+/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  // If we still have 3+ tokens and the third token starts uppercase
  // or is a single capitalized word (cultivar), drop trailing tokens.
  const tokens = s.split(/\s+/);
  if (tokens.length >= 3) {
    // Keep first two only when the rest look like cultivar/variety
    s = `${tokens[0]} ${tokens[1]}`;
  }
  return s;
}

const GENUS_ONLY_PLACEHOLDERS = new Set(['species', 'spp', 'spp.', 'sp', 'sp.']);
const NO_FALLBACK_GENERA = new Set([
  'malus', 'cornus', 'prunus', 'carya', 'juglans', 'pyrus', 'vaccinium', 'ribes'
]);

function isGenusOnly(target) {
  const parts = norm(target).split(/\s+/);
  if (parts.length === 1) return true;
  if (parts.length === 2 && GENUS_ONLY_PLACEHOLDERS.has(parts[1])) return true;
  return false;
}

function matchSpecies(species, sci, com) {
  const sciq = sci ? norm(sci) : '';
  const comq = com ? norm(com) : '';
  if (sciq) {
    const hit = species.find(s => norm(s.scientific_name) === sciq);
    if (hit) return hit;
  }
  if (comq) {
    const hit = species.find(s => norm(s.common_name) === comq);
    if (hit) return hit;
  }
  if (sciq || comq) {
    const hit = species.find(s =>
      (s.aliases ?? []).some(a => norm(a) === sciq || norm(a) === comq));
    if (hit) return hit;
  }
  if (sciq) {
    const parts = sciq.split(/\s+/);
    if (parts.length >= 2 && /^[a-z]+$/i.test(parts[1])) {
      const binomial = `${parts[0]} ${parts[1]}`;
      const hit = species.find(s => norm(s.scientific_name) === binomial);
      if (hit) return hit;
    }
  }
  if (sciq && isGenusOnly(sciq)) {
    const g = sciq.split(/\s+/)[0];
    if (!NO_FALLBACK_GENERA.has(g)) {
      const hit = species.find(s => norm(s.scientific_name).split(/\s+/)[0] === g);
      if (hit) return hit;
    }
  }
  return null;
}

function parseCSV(text, maxRows = Infinity) {
  // Lightweight CSV parser. Doesn't handle every edge case, but
  // works for ArcGIS and Socrata exports (no embedded newlines in
  // quoted fields beyond what fold-tolerable).
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseCSVRow(lines[0]).map(h => h.replace(/^[﻿]/, ''));
  const rows = [];
  for (let i = 1; i < lines.length && rows.length < maxRows; i++) {
    if (!lines[i]) continue;
    const cols = parseCSVRow(lines[i]);
    const r = {};
    for (let j = 0; j < headers.length; j++) r[headers[j]] = cols[j] ?? '';
    rows.push(r);
  }
  return { headers, rows };
}

function parseCSVRow(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function pickKey(headers, candidates) {
  const lower = headers.map(h => h.toLowerCase());
  for (const c of candidates) {
    const idx = lower.indexOf(c);
    if (idx >= 0) return headers[idx];
  }
  // Substring fallback (e.g. "tree_botanical_name")
  for (const c of candidates) {
    const idx = lower.findIndex(h => h.includes(c));
    if (idx >= 0) return headers[idx];
  }
  return null;
}

async function processSource(c, species) {
  const out = {
    id: c.id, country: c.country, short: c.short,
    path: c.path, format: null, headers: [],
    sciKey: null, comKey: null, genusKey: null, latKey: null, lngKey: null,
    totalRows: 0, matched: 0, unmatched: 0, latlngMissing: 0,
    unmatchedNames: {}
  };
  const filePath = c.path || path.join(__dirname, '../raw/opentrees', c.country.toLowerCase(), `${c.id}.csv`);
  if (!fs.existsSync(filePath)) {
    out.error = 'file not found';
    return out;
  }
  const stat = fs.statSync(filePath);
  out.fileSize = stat.size;

  // Detect format by extension and content
  const ext = path.extname(filePath).slice(1).toLowerCase();
  out.format = ext;

  let rows = [];
  let headers = [];
  if (ext === 'csv') {
    const text = fs.readFileSync(filePath, 'utf8');
    if (text.trimStart().startsWith('<')) { out.error = 'got HTML, not CSV'; return out; }
    const parsed = parseCSV(text);
    headers = parsed.headers;
    rows = parsed.rows;
  } else if (ext === 'geojson' || ext === 'json') {
    let obj;
    try { obj = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
    catch (e) { out.error = 'invalid json'; return out; }
    if (obj && obj.error) { out.error = `api error: ${obj.error}`; return out; }
    if (obj.type === 'FeatureCollection' && Array.isArray(obj.features)) {
      headers = Object.keys(obj.features[0]?.properties || {});
      rows = obj.features.map(f => {
        const props = { ...(f.properties || {}) };
        if (f.geometry?.type === 'Point') {
          const [lng, lat] = f.geometry.coordinates;
          props.__lng = lng; props.__lat = lat;
        } else if (f.geometry?.type === 'MultiPoint' && f.geometry.coordinates[0]) {
          const [lng, lat] = f.geometry.coordinates[0];
          props.__lng = lng; props.__lat = lat;
        }
        return props;
      });
      headers.push('__lng', '__lat');
    }
  } else if (ext === 'zip') {
    // unzip into a tmp dir, look for .csv or .geojson or .shp
    const tmpDir = filePath.replace(/\.zip$/, '.unzip');
    if (!fs.existsSync(tmpDir)) {
      try {
        execSync(`unzip -o -q "${filePath}" -d "${tmpDir}"`, { stdio: 'pipe' });
      } catch (e) {
        out.error = `unzip failed: ${e.message}`;
        return out;
      }
    }
    const candidates = walkDir(tmpDir).filter(p => /\.(csv|geojson|json)$/i.test(p));
    if (candidates.length === 0) {
      out.error = 'zip had no csv/geojson (probably shapefile only)';
      return out;
    }
    // Recurse on inner file
    const inner = candidates[0];
    const innerExt = path.extname(inner).slice(1).toLowerCase();
    if (innerExt === 'csv') {
      const text = fs.readFileSync(inner, 'utf8');
      const parsed = parseCSV(text);
      headers = parsed.headers;
      rows = parsed.rows;
    } else {
      const obj = JSON.parse(fs.readFileSync(inner, 'utf8'));
      if (obj.type === 'FeatureCollection' && Array.isArray(obj.features)) {
        headers = Object.keys(obj.features[0]?.properties || {});
        rows = obj.features.map(f => {
          const props = { ...(f.properties || {}) };
          if (f.geometry?.type === 'Point') {
            const [lng, lat] = f.geometry.coordinates;
            props.__lng = lng; props.__lat = lat;
          }
          return props;
        });
        headers.push('__lng', '__lat');
      }
    }
  } else {
    out.error = `unknown format: ${ext}`;
    return out;
  }

  out.headers = headers;
  out.sciKey = pickKey(headers, SCI_KEYS);
  out.comKey = pickKey(headers, COM_KEYS);
  out.genusKey = pickKey(headers, GENUS_KEYS);
  // Probe an ambiguous "species" column by sampling first non-empty values
  const ambigKey = pickKey(headers, AMBIG_SPECIES_KEYS);
  if (ambigKey) {
    const samples = [];
    for (const r of rows) {
      const v = (r[ambigKey] || '').trim();
      if (v && samples.length < 30) samples.push(v);
      if (samples.length >= 30) break;
    }
    const looksBinomial = samples.filter(s => /^[A-Z][a-z]+\s+[a-z]+/.test(s)).length;
    const looksEpithet = samples.filter(s => /^[a-z]+$/.test(s)).length;
    const looksCommon = samples.filter(s => /[a-zA-Z]+\s+[a-zA-Z]+/.test(s) && !/^[A-Z][a-z]+\s+[a-z]/.test(s)).length;
    out.ambigSpeciesKey = ambigKey;
    out.ambigSamples = samples.slice(0, 5);
    if (looksBinomial > samples.length * 0.5) {
      if (!out.sciKey) out.sciKey = ambigKey;
    } else if (looksEpithet > samples.length * 0.5) {
      out.useGenusPlusSpecies = !!out.genusKey;
      if (out.useGenusPlusSpecies) out.speciesKey = ambigKey;
    } else if (looksCommon > samples.length * 0.5) {
      if (!out.comKey) out.comKey = ambigKey;
    }
  }
  out.latKey = headers.includes('__lat') ? '__lat' : pickKey(headers, LAT_KEYS);
  out.lngKey = headers.includes('__lng') ? '__lng' : pickKey(headers, LNG_KEYS);
  // POINT (WKT) column fallback
  out.pointKey = (!out.latKey || !out.lngKey) ? pickKey(headers, ['point', 'the_geom', 'geom', 'geometry', 'location', 'shape']) : null;
  out.totalRows = rows.length;

  for (const r of rows) {
    let lng = NaN, lat = NaN;
    if (out.latKey && out.lngKey) {
      lng = parseFloat(r[out.lngKey]);
      lat = parseFloat(r[out.latKey]);
    } else if (out.pointKey) {
      // 'POINT (-114.05 51.05)' or '{"x":-114, "y":51, "spatialReference":...}'
      const v = String(r[out.pointKey] || '');
      const wkt = v.match(/POINT\s*\(\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*\)/i);
      if (wkt) { lng = parseFloat(wkt[1]); lat = parseFloat(wkt[2]); }
    }
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      out.latlngMissing++;
      continue;
    }
    let sci = r[out.sciKey] || '';
    const com = r[out.comKey] || '';
    // Combine genus + species for sources like Calgary
    if (!sci && out.useGenusPlusSpecies) {
      const g = (r[out.genusKey] || '').trim();
      const s = (r[out.speciesKey] || '').trim();
      if (g && s) sci = `${g} ${s}`;
      else if (g) sci = g;
    }
    if (!sci && out.genusKey) sci = r[out.genusKey] || '';
    // Cultivar/hybrid normalization
    const sciNorm = normalizeSpeciesName(sci);
    const hit = matchSpecies(species, sciNorm || sci, com);
    if (hit) {
      out.matched++;
    } else {
      out.unmatched++;
      const key = (sciNorm || sci || com || '?').trim();
      if (key) out.unmatchedNames[key] = (out.unmatchedNames[key] || 0) + 1;
    }
  }
  // Drop unmatchedNames for output if too large
  out.uniqueUnmatched = Object.keys(out.unmatchedNames).length;
  return out;
}

function walkDir(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkDir(p));
    else out.push(p);
  }
  return out;
}

(async () => {
  const sql = postgres(process.env.SUPABASE_DB_URL, {
    ssl: 'require', onnotice: () => undefined
  });
  const species = await sql`
    select id, scientific_name, common_name, aliases from species
  `;
  await sql.end();
  console.log(`Loaded ${species.length} species from catalog.\n`);

  const alive = downloads.filter(d => (d.status === 'downloaded' || d.status === 'cached') && d.size > 0);
  console.log(`Processing ${alive.length} downloaded sources…\n`);
  const results = [];
  for (const d of alive) {
    const r = await processSource(d, species);
    results.push(r);
    if (r.error) {
      console.log(`✗ ${r.short || r.id}: ${r.error}`);
    } else {
      const matchPct = r.totalRows ? ((r.matched / r.totalRows) * 100).toFixed(0) : '0';
      console.log(
        `${r.matched.toLocaleString().padStart(8)} matched / ${r.totalRows.toLocaleString().padStart(8)} ` +
        `(${String(matchPct).padStart(2)}%) · ${r.short || r.id} (${r.country}) · sci=${r.sciKey || '?'} com=${r.comKey || '?'}`
      );
    }
  }

  // Aggregate unmatched names across all sources
  const allUnmatched = {};
  for (const r of results) {
    for (const [name, n] of Object.entries(r.unmatchedNames || {})) {
      if (!allUnmatched[name]) allUnmatched[name] = { count: 0, sources: [] };
      allUnmatched[name].count += n;
      allUnmatched[name].sources.push({ source: r.id, n });
    }
  }
  const ranked = Object.entries(allUnmatched)
    .map(([name, info]) => ({ name, ...info }))
    .sort((a, b) => b.count - a.count);

  fs.writeFileSync(
    path.join(__dirname, 'dry-run-results.json'),
    JSON.stringify(results, null, 2)
  );
  fs.writeFileSync(
    path.join(__dirname, 'unmatched-ranked.json'),
    JSON.stringify(ranked, null, 2)
  );

  console.log(`\nTotals across all sources:`);
  const totalRows = results.reduce((a, r) => a + (r.totalRows || 0), 0);
  const totalMatched = results.reduce((a, r) => a + (r.matched || 0), 0);
  const totalUnmatched = results.reduce((a, r) => a + (r.unmatched || 0), 0);
  console.log(`  rows: ${totalRows.toLocaleString()}`);
  console.log(`  matched: ${totalMatched.toLocaleString()} (${(totalMatched / totalRows * 100).toFixed(1)}%)`);
  console.log(`  unmatched: ${totalUnmatched.toLocaleString()}`);
  console.log(`  unique unmatched names: ${ranked.length.toLocaleString()}`);
  console.log(`\nTop 30 unmatched:`);
  for (const r of ranked.slice(0, 30)) {
    console.log(`  ${r.count.toString().padStart(6)} × ${r.name}`);
  }
})().catch(e => { console.error(e); process.exit(1); });
