// Populate species.image_url + image_attribution from Wikipedia for
// any forageable species missing a photo. Uses Wikipedia's REST
// summary endpoint which returns a thumbnail per page.
//
// Idempotent: only updates rows where image_url IS NULL.
//
// Rate-limited to ~1 req/second to respect Wikipedia's anonymous
// usage policy.
//
// Usage: node scripts/populate-species-photos.cjs
// Optional flag: --dry  (preview without writing)

'use strict';

const fs = require('node:fs');
const env = fs.readFileSync('/Users/jk/Dropbox/Claude/forager/.env.local', 'utf8');
const SUPABASE_DB_URL = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim();
const sql = require('/Users/jk/Dropbox/Claude/forager/node_modules/postgres')(
  SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined }
);

const DRY = process.argv.includes('--dry');
const UA = 'ForagerCalibration/1.0 (https://github.com/judithhubbard/forager; admin@forager.app)';

// Wikipedia REST summary endpoint. Returns title, extract, thumbnail
// (which has source URL + dimensions). The "originalimage" field
// returns the full-size image; we use thumbnail (smaller, cached, faster).
async function fetchWikiSummary(title) {
  const enc = encodeURIComponent(title.replace(/ /g, '_'));
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${enc}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${title}: ${await res.text()}`);
  return res.json();
}

// Some scientific names redirect through Wikipedia disambig in odd
// ways; try the scientific name first, fall back to common name if
// the scientific-name page has no image.
async function findPhoto(scientific, common) {
  for (const title of [scientific, common].filter(Boolean)) {
    try {
      const data = await fetchWikiSummary(title);
      if (!data) continue;
      const thumb = data.thumbnail?.source;
      const original = data.originalimage?.source;
      const pageUrl = data.content_urls?.desktop?.page;
      if (thumb || original) {
        return {
          image_url: thumb || original,  // prefer thumbnail (smaller)
          image_attribution: `Wikipedia · ${data.title} · CC BY-SA 4.0 · ${pageUrl}`
        };
      }
    } catch (e) {
      console.warn(`  warn: ${title}: ${e.message}`);
    }
  }
  return null;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const rows = await sql`
    select id, scientific_name, common_name
      from species
     where is_forageable = true
       and (image_url is null or image_url = '')
     order by common_name`;

  console.log(`${rows.length} forageable species missing image_url${DRY ? ' (DRY RUN)' : ''}`);
  console.log();

  let updated = 0, missed = 0;
  for (const sp of rows) {
    process.stdout.write(`  ${sp.common_name.padEnd(30)} (${sp.scientific_name}) ... `);
    const photo = await findPhoto(sp.scientific_name, sp.common_name);
    if (photo) {
      if (!DRY) {
        await sql`
          update species
             set image_url = ${photo.image_url},
                 image_attribution = ${photo.image_attribution}
           where id = ${sp.id}`;
      }
      console.log('✓');
      updated++;
    } else {
      console.log('— no photo');
      missed++;
    }
    await sleep(1100);
  }

  console.log();
  console.log(`${updated} updated, ${missed} no photo found.`);
  await sql.end();
})();
