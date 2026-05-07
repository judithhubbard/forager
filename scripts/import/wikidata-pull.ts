// Wikidata pull for species metadata. Phase 1D companion script.
//
// What this populates per species:
//   - attribution: "Wikidata: Q12345 · Wikipedia: <url>"
//   - aliases:     merged with English vernacular names (P1843)
//                  — adds names not already present, never deletes.
//
// What this does NOT populate: preparation_methods, usage_notes,
// harvest_tips, toxicity_notes. Wikidata does not structurally
// encode "edible parts" or culinary use for plant taxa in any
// reliable way (the plan's P5048 claim was wrong — that property
// is unrelated to edibility). Those fields stay manual curation.
// Wikipedia prose is CC BY-SA 4.0 share-alike, so we do not pull
// extracts directly into the DB; the attribution URL points
// curators at the source.
//
// Run with:
//   npm run import:wikidata           # apply updates
//   npm run import:wikidata -- --dry-run   # preview only, no writes
//
// Reruns are safe: only species with NULL/empty attribution are
// touched, so already-curated rows stay intact. To re-pull a
// row, clear its attribution first.
//
// Etiquette (per https://www.wikidata.org/wiki/Wikidata:Data_access):
//   - User-Agent identifying the project + contact
//   - Single sequential query batches, with a small delay between
//   - VALUES-batched SPARQL keeps round-trips low

import postgres from 'postgres';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: resolve(process.cwd(), '.env.local') });
loadEnv({ path: resolve(process.cwd(), '.env') });

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const UA =
  'forager-app/0.1 (https://github.com/judithhubbard/forager; species-attribution import)';

interface WikidataResult {
  taxonName: string;
  qid: string;
  wikiUrl: string | null;
  vernacularNames: string[];
}

async function querySpecies(scientificNames: string[]): Promise<WikidataResult[]> {
  // VALUES-batched SPARQL: one round-trip resolves up to ~30 names
  // at a time without blowing past the endpoint's URL limit.
  const values = scientificNames
    .map((n) => `"${n.replace(/"/g, '\\"')}"`)
    .join(' ');

  const query = `
    SELECT ?taxonName ?item ?wpUrl
           (GROUP_CONCAT(DISTINCT ?vernacular; separator="||") AS ?vernaculars)
    WHERE {
      VALUES ?taxonName { ${values} }
      ?item wdt:P225 ?taxonName.
      OPTIONAL {
        ?wpUrl schema:about ?item;
               schema:isPartOf <https://en.wikipedia.org/>.
      }
      OPTIONAL {
        ?item wdt:P1843 ?vernacular.
        FILTER(LANG(?vernacular) = "en")
      }
    }
    GROUP BY ?taxonName ?item ?wpUrl
  `;

  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/sparql-results+json'
    }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SPARQL ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    results: {
      bindings: Array<Record<string, { value: string } | undefined>>;
    };
  };
  return json.results.bindings.map((b) => ({
    taxonName: b.taxonName!.value,
    qid: b.item!.value.split('/').pop() ?? '',
    wikiUrl: b.wpUrl?.value ?? null,
    vernacularNames: b.vernaculars?.value
      ? b.vernaculars.value
          .split('||')
          .map((s) => s.trim())
          .filter(Boolean)
      : []
  }));
}

async function main(): Promise<void> {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) throw new Error('SUPABASE_DB_URL missing — set it in .env.local');
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) console.log('DRY RUN — no database writes will be made.\n');

  const sql = postgres(dbUrl, { ssl: 'require', onnotice: () => undefined });
  try {
    // Only species without attribution. coalesce + nullif handles
    // both NULL and empty-string cases without an OR.
    const rows = await sql<
      {
        id: string;
        scientific_name: string;
        common_name: string;
        aliases: string[] | null;
      }[]
    >`
      select id, scientific_name, common_name, aliases
        from public.species
       where coalesce(nullif(attribution, ''), null) is null
         and scientific_name is not null
       order by scientific_name
    `;

    if (rows.length === 0) {
      console.log('No species need attribution. (Clear attribution to re-pull a row.)');
      return;
    }
    console.log(`Pulling Wikidata metadata for ${rows.length} species…\n`);

    const BATCH = 30;
    let updated = 0;
    let unmatched = 0;
    let aliasAdds = 0;

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const names = batch.map((r) => r.scientific_name);
      let results: WikidataResult[];
      try {
        results = await querySpecies(names);
      } catch (err) {
        console.error(`  batch ${Math.floor(i / BATCH) + 1} failed:`, err);
        continue;
      }
      // Multiple QIDs can match the same taxon name (e.g. synonyms);
      // first one wins.
      const byName = new Map<string, WikidataResult>();
      for (const r of results) {
        if (!byName.has(r.taxonName)) byName.set(r.taxonName, r);
      }

      for (const row of batch) {
        const wd = byName.get(row.scientific_name);
        if (!wd) {
          console.log(`  – ${row.scientific_name}: no Wikidata match`);
          unmatched++;
          continue;
        }
        const credit = [
          `Wikidata: ${wd.qid}`,
          wd.wikiUrl ? `Wikipedia: ${wd.wikiUrl}` : null
        ]
          .filter(Boolean)
          .join(' · ');

        // Case-insensitive dedupe against existing aliases AND the
        // common_name itself (no point duplicating the title).
        const existingLower = new Set(
          (row.aliases ?? []).map((a) => a.toLowerCase())
        );
        existingLower.add(row.common_name.toLowerCase());
        const newAliases = wd.vernacularNames.filter(
          (v) => !existingLower.has(v.toLowerCase())
        );
        const mergedAliases = [...(row.aliases ?? []), ...newAliases];
        aliasAdds += newAliases.length;

        if (!dryRun) {
          await sql`
            update public.species
               set attribution = ${credit},
                   aliases = ${mergedAliases}
             where id = ${row.id}
          `;
        }
        const tag = newAliases.length
          ? ` (+${newAliases.length} alias${newAliases.length === 1 ? '' : 'es'})`
          : '';
        console.log(`  + ${row.scientific_name} ← ${wd.qid}${tag}`);
        updated++;
      }

      // Be polite to the public SPARQL endpoint between batches.
      if (i + BATCH < rows.length) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    console.log('');
    console.log(`Done: ${updated} updated, ${unmatched} unmatched, ${aliasAdds} aliases added.`);
    if (unmatched > 0) {
      console.log('Unmatched rows usually mean the scientific_name has a typo or');
      console.log('is a synonym Wikidata files under a different binomial.');
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
