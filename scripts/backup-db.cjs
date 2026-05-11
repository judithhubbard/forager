// Local DB backup — pure Node, no external dependencies. Streams every
// row of every public table to NDJSON (one JSON object per line),
// gzipped, then bundled into a single tarball under backups/.
//
// NDJSON streaming avoids V8's max-string-length limit (~512MB on
// 64-bit), so even the 2.6M-row `pins` table backs up cleanly.
//
// What's covered: all rows in public.* tables, except derived/system
// tables (pin_density_grid, spatial_ref_sys) which are regenerable.
// Schema is reproducible from supabase/migrations.
// Photos in Supabase Storage are NOT covered.
//
// Restore: a separate script can read the NDJSON files and re-insert
// (TRUNCATE + COPY-style INSERT). Restore not yet implemented — for
// now this is a safety-net snapshot.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawn } = require('node:child_process');

const ROOT = '/Users/jk/Dropbox/Claude/forager';
const BACKUPS_DIR = path.join(ROOT, 'backups');

// Tables to skip:
//   - pin_density_grid: derived from pins (rebuilt by /lib/rpc/refresh job)
//   - spatial_ref_sys: PostGIS built-in, identical across all installs
const SKIP_TABLES = new Set(['pin_density_grid', 'spatial_ref_sys']);

const env = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
const dbUrl = env.match(/SUPABASE_DB_URL=(.+)/)?.[1]?.trim();
if (!dbUrl) { console.error('SUPABASE_DB_URL missing'); process.exit(1); }

const sql = require(path.join(ROOT, 'node_modules/postgres'))(
  dbUrl, {
    ssl: 'require',
    onnotice: () => undefined,
    // Override pooler-imposed statement_timeout (60s for Supabase
    // shared poolers, fires mid-pins-dump on 5M+ rows). Both setting
    // routes — postgres.js `connection:` and an explicit SET — are
    // applied because the postgres.js connection option doesn't
    // always propagate through pgbouncer transaction-mode pools.
    connection: { statement_timeout: 0, idle_in_transaction_session_timeout: 0 }
  }
);

if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

const stamp = new Date().toISOString().replace(/[:T]/g, '-').replace(/\..+$/, '');
const outFile = path.join(BACKUPS_DIR, `forager-${stamp}.tar.gz`);
const tmpDir = path.join(BACKUPS_DIR, `.staging-${stamp}`);

async function dumpTable(table) {
  const file = path.join(tmpDir, `${table}.ndjson.gz`);
  const out = fs.createWriteStream(file);
  const gz = zlib.createGzip();
  gz.pipe(out);

  // Disable statement_timeout for this session — also via explicit SET
  // since postgres.js's `connection:` option doesn't always propagate
  // through Supabase's pgbouncer transaction-mode pool. This is the
  // route that actually works on the shared pooler.
  await sql.unsafe(`set statement_timeout = 0`);

  let count = 0;
  // Cursor in 1000-row batches (was 5000) so each fetch round-trip
  // is shorter — even on a slow link, no single network round-trip
  // approaches the pooler's transaction-cleanup limit.
  const cursor = sql.unsafe(`select * from public.${table}`).cursor(1000);
  for await (const batch of cursor) {
    for (const row of batch) {
      gz.write(JSON.stringify(row) + '\n');
      count++;
    }
  }
  gz.end();
  await new Promise((resolve, reject) => {
    out.on('finish', resolve); out.on('error', reject);
  });
  return count;
}

(async () => {
  const t0 = Date.now();
  fs.mkdirSync(tmpDir);

  const tables = (await sql`
    select tablename from pg_tables where schemaname = 'public' order by tablename`
  ).map(r => r.tablename).filter(t => !SKIP_TABLES.has(t));
  console.log(`Dumping ${tables.length} tables (skipping ${[...SKIP_TABLES].join(', ')}) → ${outFile}`);

  let totalRows = 0;
  for (const t of tables) {
    const n = await dumpTable(t);
    totalRows += n;
    if (n > 0) console.log(`  ${t}: ${n.toLocaleString()} rows`);
  }

  fs.writeFileSync(path.join(tmpDir, 'manifest.json'), JSON.stringify({
    created_at: new Date().toISOString(),
    db_url: dbUrl.replace(/:[^:@]+@/, ':***@'),
    tables, skipped: [...SKIP_TABLES], total_rows: totalRows
  }, null, 2));

  // Bundle the tmp dir into a tarball next to the staging area, then move.
  await new Promise((resolve, reject) => {
    const tar = spawn('tar', ['-czf', outFile, '-C', BACKUPS_DIR, path.basename(tmpDir)]);
    tar.on('exit', code => code === 0 ? resolve() : reject(new Error(`tar exit ${code}`)));
  });
  fs.rmSync(tmpDir, { recursive: true, force: true });

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const size = (fs.statSync(outFile).size / (1024 * 1024)).toFixed(1);
  console.log(`✓ ${tables.length} tables, ${totalRows.toLocaleString()} rows, ${size} MB in ${elapsed}s`);

  // Prune backups older than 60 days.
  const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
  let pruned = 0;
  for (const f of fs.readdirSync(BACKUPS_DIR)) {
    if (!f.startsWith('forager-') || !f.endsWith('.tar.gz')) continue;
    const p = path.join(BACKUPS_DIR, f);
    if (fs.statSync(p).mtimeMs < cutoff) { fs.unlinkSync(p); pruned++; }
  }
  if (pruned) console.log(`pruned ${pruned} backup(s) older than 60d`);

  await sql.end();
})().catch(e => {
  console.error('backup failed:', e.message);
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  sql.end();
  process.exit(1);
});
