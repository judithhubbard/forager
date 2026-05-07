// Pull Wikidata P18 image + Wikimedia Commons license metadata for
// each species, populating image_url + image_attribution.
//
// Workflow:
//   1. Read each species' Wikidata QID from the attribution string
//      (set by import:wikidata).
//   2. Batched SPARQL: for those QIDs, fetch P18 (image filename
//      via Special:FilePath URL).
//   3. For each filename, hit the Commons API for imageinfo
//      extmetadata: artist, license short-name, and the Commons
//      page URL (license requires visible attribution).
//   4. Update species.image_url + species.image_attribution.
//
// Run with:
//   npm run import:wikidata-images                 # apply
//   npm run import:wikidata-images -- --dry-run    # preview only
//
// Idempotent: only updates rows where image_url is currently NULL.

import postgres from 'postgres';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: resolve(process.cwd(), '.env.local') });
loadEnv({ path: resolve(process.cwd(), '.env') });

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const UA =
  'forager-app/0.1 (https://github.com/judithhubbard/forager; species image import)';
const THUMB_WIDTH = 600;

interface SparqlImageRow {
  qid: string;
  imageUrl: string;
}

async function fetchP18ImagesByQid(qids: string[]): Promise<Map<string, string>> {
  if (qids.length === 0) return new Map();
  const values = qids.map((q) => `wd:${q}`).join(' ');
  const query = `
    SELECT ?item ?image WHERE {
      VALUES ?item { ${values} }
      ?item wdt:P18 ?image.
    }
  `;
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SPARQL ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    results: {
      bindings: Array<Record<string, { value: string } | undefined>>;
    };
  };
  const out = new Map<string, string>();
  for (const b of json.results.bindings) {
    const qid = b.item?.value.split('/').pop();
    const imageUrl = b.image?.value;
    if (qid && imageUrl && !out.has(qid)) out.set(qid, imageUrl);
  }
  return out;
}

interface CommonsMetadata {
  /** Plain-text attribution credit, with HTML stripped. */
  artist: string | null;
  /** License short-name like "CC BY-SA 4.0" or "Public domain". */
  license: string | null;
  /** Commons file page URL — for the license-mandated source link. */
  filePageUrl: string;
  /** Direct thumbnail URL. */
  thumbnailUrl: string;
}

function commonsFilenameFromFilePathUrl(filePathUrl: string): string | null {
  // P18 returns 'http://commons.wikimedia.org/wiki/Special:FilePath/Cornus_mas_-_….jpg'
  const m = filePathUrl.match(/Special:FilePath\/(.+)$/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchCommonsMetadata(filename: string): Promise<CommonsMetadata | null> {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'imageinfo',
    iiprop: 'url|user|extmetadata',
    iiurlwidth: String(THUMB_WIDTH),
    titles: 'File:' + filename,
    format: 'json',
    formatversion: '2'
  });
  const url = `${COMMONS_API}?${params.toString()}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' }
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    query?: {
      pages?: Array<{
        title?: string;
        imageinfo?: Array<{
          url?: string;
          thumburl?: string;
          descriptionurl?: string;
          user?: string;
          extmetadata?: Record<string, { value?: string } | undefined>;
        }>;
      }>;
    };
  };
  const page = json.query?.pages?.[0];
  const info = page?.imageinfo?.[0];
  if (!info) return null;
  const ext = info.extmetadata ?? {};
  const artistRaw = ext.Artist?.value ?? info.user ?? null;
  const licenseRaw = ext.LicenseShortName?.value ?? ext.License?.value ?? null;
  return {
    artist: artistRaw ? stripHtml(artistRaw) : null,
    license: licenseRaw ? stripHtml(licenseRaw) : null,
    filePageUrl:
      info.descriptionurl ??
      `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(filename)}`,
    thumbnailUrl:
      info.thumburl ??
      `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=${THUMB_WIDTH}`
  };
}

function buildAttribution(meta: CommonsMetadata): string {
  // Order: artist · license · source link. Each segment is optional;
  // if metadata is sparse we fall through to a generic "Wikimedia
  // Commons" credit so the image is still legally attributable.
  const parts: string[] = [];
  if (meta.artist) parts.push(meta.artist);
  if (meta.license) parts.push(meta.license);
  parts.push(meta.filePageUrl);
  return parts.join(' · ');
}

function parseQid(attribution: string | null): string | null {
  if (!attribution) return null;
  const m = attribution.match(/Wikidata:\s*(Q\d+)/i);
  return m ? m[1] : null;
}

async function main(): Promise<void> {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) throw new Error('SUPABASE_DB_URL missing — set it in .env.local');
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) console.log('DRY RUN — no database writes will be made.\n');

  const sql = postgres(dbUrl, { ssl: 'require', onnotice: () => undefined });
  try {
    // Only species missing image_url, with a known QID. Anything else
    // we either can't look up (no attribution) or shouldn't clobber
    // (already curated).
    const rows = await sql<
      {
        id: string;
        scientific_name: string;
        attribution: string | null;
      }[]
    >`
      select id, scientific_name, attribution
        from public.species
       where (image_url is null or image_url = '')
         and attribution is not null
       order by scientific_name
    `;

    const withQid = rows
      .map((r) => ({ ...r, qid: parseQid(r.attribution) }))
      .filter((r): r is typeof r & { qid: string } => !!r.qid);
    if (withQid.length === 0) {
      console.log('No species need image lookup.');
      return;
    }
    console.log(`Looking up images for ${withQid.length} species…\n`);

    const BATCH = 30;
    let updated = 0;
    let skippedNoP18 = 0;
    let skippedNoMeta = 0;

    for (let i = 0; i < withQid.length; i += BATCH) {
      const batch = withQid.slice(i, i + BATCH);
      let p18Map: Map<string, string>;
      try {
        p18Map = await fetchP18ImagesByQid(batch.map((b) => b.qid));
      } catch (err) {
        console.error('  SPARQL batch failed:', err);
        continue;
      }

      for (const row of batch) {
        const filePathUrl = p18Map.get(row.qid);
        if (!filePathUrl) {
          console.log(`  – ${row.scientific_name}: no P18 image on Wikidata`);
          skippedNoP18++;
          continue;
        }
        const filename = commonsFilenameFromFilePathUrl(filePathUrl);
        if (!filename) {
          skippedNoP18++;
          continue;
        }
        let meta: CommonsMetadata | null = null;
        try {
          meta = await fetchCommonsMetadata(filename);
        } catch (err) {
          console.log(`  ! ${row.scientific_name}: Commons metadata failed (${err instanceof Error ? err.message : String(err)})`);
        }
        if (!meta) {
          skippedNoMeta++;
          continue;
        }
        const attribution = buildAttribution(meta);
        if (!dryRun) {
          await sql`
            update public.species
               set image_url = ${meta.thumbnailUrl},
                   image_attribution = ${attribution}
             where id = ${row.id}
          `;
        }
        const license = meta.license ?? '?';
        console.log(`  + ${row.scientific_name} ← ${filename.slice(0, 60)} [${license}]`);
        updated++;
        // Etiquette: small pause between Commons API hits.
        await new Promise((r) => setTimeout(r, 150));
      }

      // Pause between SPARQL batches.
      if (i + BATCH < withQid.length) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    console.log('');
    console.log(`Done: ${updated} updated, ${skippedNoP18} no P18, ${skippedNoMeta} no metadata.`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
