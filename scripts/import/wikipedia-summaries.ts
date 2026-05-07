// Wikipedia lead-paragraph dumper for manual curation.
//
// Reads the Wikipedia URL stored on each species (set by
// import:wikidata) and prints the article's lead extract plus
// short description to stdout. Use this output as a reading
// list when filling in usage_notes / harvest_tips / toxicity_notes
// by hand — facts aren't copyrightable, so reading Wikipedia and
// writing your own short statements about edible parts, ripeness
// signs, and common uses is on solid ground. The CC BY-SA 4.0
// share-alike on Wikipedia's text only matters if you copy that
// text verbatim into the database, which is exactly what this
// script DOES NOT do — it only prints.
//
// Run with:
//   npm run wikipedia:summaries                            # lead paragraph only
//   npm run wikipedia:summaries -- --full                  # whole article plaintext
//   npm run wikipedia:summaries -- --filter "Cornus mas"   # one species
//   npm run wikipedia:summaries -- --out ./curation.txt    # also write file
//
// --full pulls the entire article body via the MediaWiki extracts
// API; the lead summary alone usually covers taxonomy/distribution
// and skips the "Uses" / "Cultivation" sections where edibility
// info actually lives. Use --full for real curation passes.
//
// No DB writes. Safe to run anytime.

import postgres from 'postgres';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: resolve(process.cwd(), '.env.local') });
loadEnv({ path: resolve(process.cwd(), '.env') });

const UA =
  'forager-app/0.1 (https://github.com/judithhubbard/forager; manual-curation reference dump)';

interface WpSummary {
  title: string;
  description: string | null;
  extract: string | null;
  url: string;
}

async function fetchSummary(wikiUrl: string): Promise<WpSummary | null> {
  const m = wikiUrl.match(/\/wiki\/([^?#]+)/);
  if (!m) return null;
  const title = m[1];
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' }
  });
  if (!res.ok) return null;
  const j = (await res.json()) as {
    title?: string;
    description?: string;
    extract?: string;
    content_urls?: { desktop?: { page?: string } };
  };
  return {
    title: j.title ?? title.replace(/_/g, ' '),
    description: j.description ?? null,
    extract: j.extract ?? null,
    url: j.content_urls?.desktop?.page ?? wikiUrl
  };
}

/** Full article plaintext via the MediaWiki extracts API. The REST
 *  /summary endpoint above only returns the lead paragraph — useful
 *  for taxonomy but bad for foraging because edibility, ripeness,
 *  and use info live in later sections (Description, Uses,
 *  Cultivation). explaintext=1 strips wiki markup; exsectionformat=plain
 *  preserves section boundaries as bare lines. */
async function fetchFullArticle(wikiUrl: string): Promise<string | null> {
  const m = wikiUrl.match(/\/wiki\/([^?#]+)/);
  if (!m) return null;
  const title = decodeURIComponent(m[1]).replace(/_/g, ' ');
  const params = new URLSearchParams({
    action: 'query',
    prop: 'extracts',
    explaintext: '1',
    exsectionformat: 'plain',
    format: 'json',
    formatversion: '2',
    titles: title
  });
  const url = `https://en.wikipedia.org/w/api.php?${params.toString()}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' }
  });
  if (!res.ok) return null;
  const j = (await res.json()) as {
    query?: { pages?: Array<{ extract?: string }> };
  };
  const extract = j.query?.pages?.[0]?.extract;
  return extract ?? null;
}

function parseWikiUrl(attribution: string | null): string | null {
  if (!attribution) return null;
  const m = attribution.match(/Wikipedia:\s*(https?:\/\/\S+)/i);
  return m ? m[1] : null;
}

function arg(name: string): string | null {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

async function main(): Promise<void> {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) throw new Error('SUPABASE_DB_URL missing — set it in .env.local');
  const filter = arg('filter');
  const outPath = arg('out');
  const full = process.argv.includes('--full');

  const sql = postgres(dbUrl, { ssl: 'require', onnotice: () => undefined });
  let captured = '';
  const append = (line: string) => {
    process.stdout.write(line + '\n');
    if (outPath) captured += line + '\n';
  };

  try {
    const rows = await sql<
      {
        id: string;
        scientific_name: string;
        common_name: string;
        attribution: string | null;
      }[]
    >`
      select id, scientific_name, common_name, attribution
        from public.species
       where attribution is not null
         ${filter ? sql`and (scientific_name ilike ${'%' + filter + '%'} or common_name ilike ${'%' + filter + '%'})` : sql``}
       order by scientific_name
    `;

    if (rows.length === 0) {
      console.log('No species with stored Wikipedia URLs. Run `npm run import:wikidata` first.');
      return;
    }
    append(`# Wikipedia lead extracts for ${rows.length} species`);
    append('# This output is reference material for manual curation only.');
    append('# Wikipedia text is CC BY-SA 4.0 — do NOT copy it verbatim into');
    append('# the species table. Read, then write original short statements.');
    append('');

    let hits = 0;
    for (const row of rows) {
      const wikiUrl = parseWikiUrl(row.attribution);
      if (!wikiUrl) {
        append(`## ${row.scientific_name} (${row.common_name})`);
        append('  [no Wikipedia URL in attribution]');
        append('');
        continue;
      }
      let s: WpSummary | null = null;
      try {
        s = await fetchSummary(wikiUrl);
      } catch (err) {
        append(`## ${row.scientific_name} (${row.common_name})`);
        append(`  [fetch failed: ${err instanceof Error ? err.message : String(err)}]`);
        append('');
        continue;
      }
      append(`## ${row.scientific_name} — ${row.common_name}`);
      if (s?.description) append(`  description: ${s.description}`);
      if (s?.url) append(`  ${s.url}`);
      append('');
      let body: string | null = null;
      if (full) {
        try {
          body = await fetchFullArticle(wikiUrl);
        } catch (err) {
          append(`  [full-article fetch failed: ${err instanceof Error ? err.message : String(err)}]`);
        }
      } else {
        body = s?.extract ?? null;
      }
      if (body) {
        for (const line of body.split('\n')) {
          append(`  > ${line}`);
        }
      } else {
        append('  [no extract returned]');
      }
      append('');
      hits++;
      // Etiquette: short pause between requests. Slightly longer
      // for --full since each call returns more.
      await new Promise((r) => setTimeout(r, full ? 250 : 100));
    }
    append(`# Done: fetched extracts for ${hits} of ${rows.length} species.`);

    if (outPath) {
      await writeFile(outPath, captured);
      console.error(`\nAlso wrote ${outPath}`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
