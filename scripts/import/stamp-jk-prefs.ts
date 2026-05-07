// Pre-populate user_species_preferences for the project owner so the
// catalog expansion in migration 29 doesn't suddenly clutter their
// existing Ithaca-scoped view. Any species name in the SEED_SPECIES
// set (the original 45 + 9 genus catch-alls JK had been using) stays
// enabled; everything new lands as enabled=false.
//
// Re-runnable: only inserts rows where no preference exists yet, so
// nothing the user has actively toggled gets clobbered.
//
// Run:
//   npm run stamp:jk-prefs
import postgres from 'postgres';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: resolve(process.cwd(), '.env.local') });
loadEnv({ path: resolve(process.cwd(), '.env') });

// Scientific names that pre-date the catalog expansion. Hardcoded so
// re-runs against subsequent imports don't accidentally re-enable
// species the user has explicitly toggled off.
const SEED_SPECIES = new Set([
  // Original 45 from data/forageable_species.json
  'Allium tricoccum', 'Amelanchier arborea', 'Amelanchier canadensis',
  'Amelanchier laevis', 'Asimina triloba', 'Asparagus officinalis',
  'Cantharellus cibarius', 'Carya illinoinensis', 'Carya laciniosa',
  'Carya ovata', 'Castanea dentata', 'Castanea mollissima',
  'Castanea pumila', 'Castanea sativa', 'Cornus mas',
  'Cornus officinalis', 'Corylus americana', 'Corylus cornuta',
  'Diospyros virginiana', 'Elaeagnus umbellata', 'Juglans ailantifolia',
  'Juglans cinerea', 'Juglans regia', 'Malus domestica', 'Mentha',
  'Morchella esculenta', 'Morus alba', 'Morus rubra',
  'Prunus americana', 'Prunus dulcis', 'Prunus pumila',
  'Prunus serotina', 'Prunus virginiana', 'Pyrus communis',
  'Pyrus ussuriensis', 'Ribes nigrum', 'Ribes rubrum',
  'Rubus allegheniensis', 'Rubus idaeus', 'Rubus occidentalis',
  'Rubus phoenicolasius', 'Sambucus canadensis',
  'Vaccinium angustifolium', 'Vaccinium corymbosum', 'Vitis riparia',
  // 9 genus-level catch-alls inserted via earlier migrations
  'Amelanchier sp.', 'Carya sp.', 'Castanea sp.', 'Cornus sp.',
  'Corylus sp.', 'Juglans sp.', 'Prunus sp.', 'Rubus sp.', 'Vaccinium sp.'
]);

async function main(): Promise<void> {
  const userId = process.env.FORAGER_DEV_USER_ID;
  if (!userId) throw new Error('FORAGER_DEV_USER_ID missing');
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) throw new Error('SUPABASE_DB_URL missing');
  const sql = postgres(dbUrl, { ssl: 'require', onnotice: () => undefined });
  try {
    const all = await sql<Array<{ id: string; scientific_name: string }>>`
      select id, scientific_name from public.species`;
    const newSpecies = all.filter((s) => !SEED_SPECIES.has(s.scientific_name));
    console.log(`Catalog: ${all.length} species. ${newSpecies.length} are post-expansion.`);
    if (newSpecies.length === 0) {
      console.log('Nothing to stamp.');
      return;
    }
    const ids = newSpecies.map((s) => s.id);
    const r = await sql`
      insert into public.user_species_preferences (user_id, species_id, enabled)
      select ${userId}::uuid, id, false
        from unnest(${ids}::uuid[]) as id
       where not exists (
         select 1 from public.user_species_preferences usp
          where usp.user_id = ${userId}::uuid and usp.species_id = id
       )
      returning species_id
    `;
    console.log(`Stamped ${r.length} new species as enabled=false for ${userId}.`);
  } finally {
    await sql.end();
  }
}
main().catch((err) => { console.error(err); process.exit(1); });
