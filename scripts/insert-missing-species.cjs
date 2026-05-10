// One-shot insert of obvious-missing forageable species. Idempotent
// via ON CONFLICT (scientific_name) DO NOTHING — safe to re-run.
//
// After running, add the corresponding entries to species-complex-unify.cjs
// to populate per-zone harvest windows.

'use strict';

const fs = require('node:fs');
const env = fs.readFileSync('/Users/jk/Dropbox/Claude/forager/.env.local', 'utf8');
const SUPABASE_DB_URL = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim();
const sql = require('/Users/jk/Dropbox/Claude/forager/node_modules/postgres')(
  SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined }
);

const SPECIES = [
  // ── Tier 1: must-haves ──
  {
    scientific_name: 'Typha latifolia', common_name: 'Common cattail',
    aliases: ['cattail','broadleaf cattail','bullrush'],
    forage_parts: ['shoot','flower','root'],
    safety_notes: 'Identify carefully — confused with toxic iris early-season. Avoid stagnant or polluted water (cattails bioaccumulate).',
    preparation_methods: ['raw','cooked','flour','pollen-pancake'],
    usage_notes: 'Multi-stage forage: spring shoots peeled like leeks (Apr-Jun); pollen tapped from spike for protein flour (Jun); fall corms / rhizomes ground for starch (Sep-Nov). One of the most productive wild plants by calorie yield.',
    harvest_tips: 'Spring: pull young shoots from rhizome, peel outer layers — eat tender white core. Pollen: bend mature spike into bag, shake. Roots: dig fall through early spring; pound rhizome to release starch.',
    interest_tags: ['wetland'], image_url: null
  },
  {
    scientific_name: 'Typha angustifolia', common_name: 'Narrow-leaf cattail',
    aliases: ['narrow-leaved cattail'],
    forage_parts: ['shoot','flower','root'],
    safety_notes: 'Same precautions as common cattail.',
    preparation_methods: ['raw','cooked','flour','pollen-pancake'],
    usage_notes: 'Same uses as Typha latifolia; the two species hybridize freely (T. × glauca).',
    harvest_tips: 'Same as common cattail.',
    interest_tags: ['wetland']
  },
  {
    scientific_name: 'Matteuccia struthiopteris', common_name: 'Ostrich fern',
    aliases: ['fiddlehead'],
    forage_parts: ['shoot'],
    safety_notes: 'COOK fiddleheads thoroughly (boil 15 min or steam 12 min) before eating — raw fiddleheads have caused mass food-poisoning outbreaks. Identify as ostrich fern (deep U-shaped groove on stem, papery brown scales) — bracken and other ferns are not safe substitutes.',
    preparation_methods: ['cooked','sauteed','pickle'],
    usage_notes: 'Iconic Northeast / Maritime Canada spring forage. Tightly-coiled fronds harvested mid-Apr to mid-May depending on zone. Crisp, asparagus-like flavor.',
    harvest_tips: 'Pick when crozier is 4-6 inches above ground, tightly coiled. Take only 2-3 fiddleheads per crown to keep the plant alive. Rinse well — the brown papery scales on the stem are not eaten.',
    interest_tags: ['fern','wetland']
  },
  {
    scientific_name: 'Fragaria virginiana', common_name: 'Wild strawberry',
    aliases: ['Virginia strawberry'],
    forage_parts: ['fruit','leaf'],
    safety_notes: '',
    preparation_methods: ['raw','jam','tea'],
    usage_notes: 'Native eastern NA strawberry — small but intensely flavored. Found in meadows, forest edges, lawns. Distinguished from mock/Indian strawberry (Potentilla indica) by 5 white petals (mock has yellow flowers and tasteless fruit).',
    harvest_tips: 'Fruit ripe Jun-Jul (zone 6a). Leaves can be dried for tea year-round.',
    interest_tags: ['native','groundcover']
  },
  {
    scientific_name: 'Fragaria vesca', common_name: 'Woodland strawberry',
    aliases: ['alpine strawberry'],
    forage_parts: ['fruit','leaf'],
    safety_notes: '',
    preparation_methods: ['raw','jam','tea'],
    usage_notes: 'Smaller than Fragaria virginiana, similar flavor. Prefers shaded woodland sites.',
    harvest_tips: 'Fruit Jun-Jul; longer fruiting window than F. virginiana.',
    interest_tags: ['native','groundcover']
  },
  {
    scientific_name: 'Podophyllum peltatum', common_name: 'Mayapple',
    aliases: ['American mandrake'],
    forage_parts: ['fruit'],
    safety_notes: 'ONLY THE RIPE YELLOW FRUIT IS EDIBLE. All other parts (leaves, stem, roots, unripe green fruit) contain podophyllotoxin and are TOXIC. Eat only the fully soft, yellow-translucent ripe fruit; discard seeds (also toxic).',
    toxicity_notes: 'Leaves, stem, and root contain podophyllotoxin — historically used as a powerful purgative; can cause severe GI distress, nerve damage with sustained exposure. Unripe green fruit is also toxic.',
    preparation_methods: ['raw','jam'],
    usage_notes: 'Eastern NA woodland forb with umbrella-shaped paired leaves on a single stem. Single fruit forms in the leaf axil; ripens to yellow-translucent in late summer (Jul-Aug). Sweet, tropical-like flavor when fully ripe.',
    harvest_tips: 'Wait until fruit is fully soft and yellow, often when it has dropped to the ground. Sniff for fragrance — ripe mayapple is unmistakably sweet.',
    interest_tags: ['native','caution']
  },
  {
    scientific_name: 'Betula lenta', common_name: 'Sweet birch',
    aliases: ['black birch','cherry birch'],
    forage_parts: ['sap','twig','leaf'],
    safety_notes: '',
    preparation_methods: ['tea','syrup','wintergreen-flavoring'],
    usage_notes: 'Bark and twigs have a strong wintergreen aroma (methyl salicylate). Sap can be tapped in late winter (similar to maple but ratio ~100:1, so harder to make syrup). Twigs steeped for tea — a foundational ingredient in birch beer.',
    harvest_tips: 'Tap sap in late Feb / early Mar (zone 6a) — tap in trees ≥10 inches DBH, run for 4-6 weeks. Twigs harvested year-round — rub bark to confirm wintergreen scent before harvesting.',
    interest_tags: ['native','sap_run']
  },

  // ── Tier 2: common roadside / forest greens ──
  {
    scientific_name: 'Oxalis stricta', common_name: 'Wood sorrel',
    aliases: ['common yellow woodsorrel','yellow oxalis'],
    forage_parts: ['leaf','flower','seed'],
    safety_notes: 'Contains oxalic acid — eat in small quantities. Avoid if prone to kidney stones / oxalate-sensitive.',
    preparation_methods: ['raw','salad','tea'],
    usage_notes: 'Common woodland and lawn weed. Three heart-shaped leaflets (clover-like) and small yellow 5-petal flowers. Tart citrus-like flavor from oxalic acid.',
    harvest_tips: 'Pinch leaves and flowers anytime during growing season. Best young.',
    interest_tags: ['groundcover']
  },
  {
    scientific_name: 'Rumex crispus', common_name: 'Curly dock',
    aliases: ['curled dock','yellow dock'],
    forage_parts: ['leaf','seed','root'],
    safety_notes: 'Contains oxalic acid; same caveats as wood sorrel. Older leaves are very oxalate-rich and bitter.',
    preparation_methods: ['cooked','flour','tincture'],
    usage_notes: 'Common roadside / disturbed-ground perennial. Leaves cooked like spinach (younger = milder). Seeds ground into flour. Root used medicinally (yellow dock tincture).',
    harvest_tips: 'Young spring leaves are best — rosette stage before flower stalk. Seeds harvested late summer (rust-brown clusters).',
    interest_tags: ['groundcover']
  },
  {
    scientific_name: 'Rumex acetosella', common_name: 'Sheep sorrel',
    aliases: ['red sorrel','field sorrel'],
    forage_parts: ['leaf'],
    safety_notes: 'Contains oxalic acid; same caveats as other Rumex.',
    preparation_methods: ['raw','salad','soup'],
    usage_notes: 'Small distinctive arrow-shaped leaves with backward-pointing lobes. Tart, lemony flavor — used in soups, salads, herbal vinegars. Common in fields, lawns, disturbed ground.',
    harvest_tips: 'Young leaves are most tender; older plants get woody but stay tart.',
    interest_tags: ['groundcover']
  },
  {
    scientific_name: 'Artemisia vulgaris', common_name: 'Mugwort',
    aliases: ['common wormwood','felon herb'],
    forage_parts: ['leaf','flower'],
    safety_notes: 'Contains thujone (mildly neurotoxic in large amounts). Avoid in pregnancy. Strong bitter; small culinary doses only.',
    preparation_methods: ['tea','dried','seasoning'],
    usage_notes: 'Invasive perennial in eastern NA. Distinctive silvery undersides of leaves. Used in Korean / Japanese cooking (yomogi/ssuk), traditional European herbal medicine, and as a tea.',
    harvest_tips: 'Pick young leaves spring through summer. Harvest before flowering for the best flavor.',
    interest_tags: ['invasive','herbal']
  },
  {
    scientific_name: 'Viburnum trilobum', common_name: 'Highbush cranberry',
    aliases: ['American cranberrybush','squashberry'],
    forage_parts: ['fruit'],
    safety_notes: 'Bright red drupes are tart and need cooking with sugar. Distinguish from European cranberrybush (V. opulus) which has bitter, mildly toxic fruit.',
    preparation_methods: ['jelly','syrup','sauce','wine'],
    usage_notes: 'Native NE shrub. Bright red translucent drupes persist into winter (improve in flavor after frost). Used for jelly, sauce, fruit leather.',
    harvest_tips: 'Pick fruit Sep-Nov; better after first frost (sweetens). Fruit hangs in flat clusters at branch tips.',
    interest_tags: ['native','frost-improved']
  },

  // ── Tier 3: common edible mushrooms ──
  {
    scientific_name: 'Lycoperdon perlatum', common_name: 'Common puffball',
    aliases: ['gem-studded puffball','warted puffball'],
    forage_parts: ['fruiting_body'],
    safety_notes: 'CUT IN HALF before eating to confirm pure-white interior — confused with toxic Amanita "egg" stage (which has visible cap/stem outline inside). Old yellow-greening puffballs are inedible (gone to spore).',
    preparation_methods: ['cooked','sauteed','breaded'],
    usage_notes: 'Beginner-friendly mushroom. Round to pear-shaped, pure-white inside when young (firm marshmallow texture). Mild flavor, takes seasoning well.',
    harvest_tips: 'Aug-Oct. Cut at base; check interior is solid white throughout. Cook within 1-2 days.',
    interest_tags: ['fungus']
  },
  {
    scientific_name: 'Calvatia gigantea', common_name: 'Giant puffball',
    aliases: [],
    forage_parts: ['fruiting_body'],
    safety_notes: 'Same precautions as common puffball — interior must be pure white. Some people experience mild GI sensitivity to giant puffballs.',
    preparation_methods: ['cooked','sauteed','breaded'],
    usage_notes: 'Iconic — can be soccer-ball-sized (10+ lbs). Pure white inside when fresh, yellows then browns to spore-mass. One puffball can feed a family.',
    harvest_tips: 'Late Aug to early Oct. Cut at base, slice thick, sauté or bread and fry. Refrigerate sliced; freezes well sautéed.',
    interest_tags: ['fungus']
  },
  {
    scientific_name: 'Craterellus cornucopioides', common_name: 'Black trumpet',
    aliases: ['horn of plenty','trumpet of death'],
    forage_parts: ['fruiting_body'],
    safety_notes: '',
    preparation_methods: ['cooked','sauteed','dried'],
    usage_notes: 'Choice woodland mushroom — earthy, smoky flavor. Hollow trumpet-shaped fruiting body, dark gray to black. No toxic lookalikes (jet-black coloring is distinctive).',
    harvest_tips: 'Jul-Sep. Found in clusters under hardwoods (especially oak and beech). Easy to miss — they blend into leaf litter. Dries beautifully.',
    interest_tags: ['fungus','choice']
  },
  {
    scientific_name: 'Lepista nuda', common_name: 'Wood blewit',
    aliases: ['blewit'],
    forage_parts: ['fruiting_body'],
    safety_notes: 'Cook thoroughly — raw blewits cause GI distress in some people. Distinguish from purple Cortinarius species which are toxic (blewit lacks rusty-brown spore print).',
    preparation_methods: ['cooked','sauteed'],
    usage_notes: 'Late-fall mushroom — fruits after frost when most others are gone. Distinctive lavender/lilac coloring fades with age. Found in leaf litter under hardwoods.',
    harvest_tips: 'Oct-Dec, sometimes after the first frosts. Take a spore print to verify (pinkish-buff, not rusty-brown).',
    interest_tags: ['fungus']
  },

  // ── Tier 4: spring ephemerals ──
  {
    scientific_name: 'Erythronium americanum', common_name: 'Trout lily',
    aliases: ['yellow trout lily','dogtooth violet'],
    forage_parts: ['leaf','corm'],
    safety_notes: 'Mildly emetic in large quantities. Forage sparingly — populations are slow-growing and ephemeral.',
    preparation_methods: ['raw','cooked'],
    usage_notes: 'Spring ephemeral with mottled "trout-skin" leaves and yellow nodding flowers. Leaves are mildly cucumber-flavored, eaten in small amounts. Corms (small bulbs) edible cooked.',
    harvest_tips: 'Apr-May only — plant disappears by June. Pick a leaf or two per plant; never harvest more than 1 in 10. Corms require digging up the plant — only on abundant patches.',
    interest_tags: ['native','spring-ephemeral','sparingly']
  },
  {
    scientific_name: 'Claytonia virginica', common_name: 'Spring beauty',
    aliases: ['fairy spuds','virginia spring beauty'],
    forage_parts: ['leaf','flower','tuber'],
    safety_notes: '',
    preparation_methods: ['raw','cooked','salad'],
    usage_notes: 'Tiny pink-and-white-striped flowers in early spring. Tubers (small starchy corms) earned the "fairy spud" nickname — sweet, potato-like cooked.',
    harvest_tips: 'Mar-May. Tubers are 1-3 inches deep; require careful digging and washing. Flowers and leaves added to salads.',
    interest_tags: ['native','spring-ephemeral']
  },
  {
    scientific_name: 'Cardamine concatenata', common_name: 'Cut-leaf toothwort',
    aliases: ['toothwort','crinkleroot'],
    forage_parts: ['leaf','root'],
    safety_notes: '',
    preparation_methods: ['raw','salad','horseradish-substitute'],
    usage_notes: 'Spring ephemeral with deeply-divided palmate leaves and white 4-petal flowers. Root tastes like horseradish — used as a wild horseradish.',
    harvest_tips: 'Apr-May. Pick leaves and flowers sparingly. Root: dig in spring, grate fresh — flavor fades quickly when dried.',
    interest_tags: ['native','spring-ephemeral']
  },

  // ── Tier 5: herbal / minor / cautious ──
  {
    scientific_name: 'Monarda fistulosa', common_name: 'Wild bergamot',
    aliases: ['bee balm','horsemint'],
    forage_parts: ['leaf','flower'],
    safety_notes: 'Avoid in pregnancy (uterine stimulant). High-thymol oils can irritate stomach in large amounts.',
    preparation_methods: ['tea','tincture','seasoning'],
    usage_notes: 'Native NA prairie/meadow plant — minty/oregano flavor (related to Earl Grey bergamot in fragrance only — different genus). Used as a tea, in herbal medicine, and as a thyme-like seasoning.',
    harvest_tips: 'Pick flowers and young leaves Jun-Aug. Bumblebees love this plant — harvest at less-busy times of day.',
    interest_tags: ['native','herbal','pollinator']
  },
  {
    scientific_name: 'Viola sororia', common_name: 'Common blue violet',
    aliases: ['woolly blue violet','meadow violet'],
    forage_parts: ['leaf','flower'],
    safety_notes: 'Confirm species — some Viola spp. are mildly toxic (V. odorata is fine; non-violet Viola lookalikes can be confused). Roots and seeds of true violets contain saponins; leaves and flowers are fine.',
    preparation_methods: ['raw','salad','candied','tea','syrup'],
    usage_notes: 'Common spring lawn flower. Leaves: high vitamins A and C. Flowers: candied for cake decoration, blue-purple syrup for cocktails.',
    harvest_tips: 'Mar-May (peak bloom). Both leaves and flowers stay edible through summer but get less abundant.',
    interest_tags: ['groundcover','pollinator']
  },
  {
    scientific_name: 'Nepeta cataria', common_name: 'Catnip',
    aliases: ['catswort','catmint'],
    forage_parts: ['leaf','flower'],
    safety_notes: 'Generally safe; avoid in pregnancy. Also a mild sedative.',
    preparation_methods: ['tea','tincture','dried'],
    usage_notes: 'Common naturalized perennial in NA. Used as calming herbal tea, traditional sleep aid. (Yes, also affects cats.)',
    harvest_tips: 'Pick leaves and flowering tops Jun-Aug. Dries well.',
    interest_tags: ['herbal']
  },
  {
    scientific_name: 'Solidago canadensis', common_name: 'Canada goldenrod',
    aliases: ['goldenrod'],
    forage_parts: ['leaf','flower'],
    safety_notes: 'Mostly hypoallergenic (myth that goldenrod causes hayfever — actual culprit is concurrent ragweed). Avoid for those with kidney conditions.',
    preparation_methods: ['tea','tincture','dried'],
    usage_notes: 'Bright yellow late-summer wildflower. Leaves and flowers used as a tea (anise-like flavor) and in herbal medicine. Major pollinator plant.',
    harvest_tips: 'Pick flowering tops Aug-Oct. Best at peak bloom.',
    interest_tags: ['native','herbal','pollinator']
  },
  {
    scientific_name: 'Prunus pensylvanica', common_name: 'Pin cherry',
    aliases: ['fire cherry','bird cherry'],
    forage_parts: ['fruit'],
    safety_notes: 'Pits/seeds contain cyanogenic glycosides (typical of all Prunus) — never eat the pits.',
    preparation_methods: ['jelly','wine','syrup'],
    usage_notes: 'Native NA shrub/small tree of disturbed ground (fire successional). Tart, small red cherries — used for jelly and wine, less commonly eaten raw.',
    harvest_tips: 'Jul-Aug. Strip clusters by hand; pit and use cooked.',
    interest_tags: ['native','successional']
  },
  {
    scientific_name: 'Hypomyces lactifluorum', common_name: 'Lobster mushroom',
    aliases: [],
    forage_parts: ['fruiting_body'],
    safety_notes: 'A parasitic fungus that grows on host mushrooms (usually Russula or Lactarius). Some host species are toxic — but the parasite typically deactivates host toxins. Safe when fully orange-red and parasitized; ambiguous early-stage growth should be avoided.',
    preparation_methods: ['cooked','sauteed'],
    usage_notes: 'Distinctive bright orange-red parasitic fungus. Firm, seafood-like flavor. Found in NE / PNW under conifers and hardwoods.',
    harvest_tips: 'Aug-Sep. Cut at base; check no host-mushroom features remain (gills, cap shape) — heavily parasitized specimens are safest.',
    interest_tags: ['fungus']
  },
  {
    scientific_name: 'Pteridium aquilinum', common_name: 'Bracken fern',
    aliases: ['bracken'],
    forage_parts: ['shoot'],
    safety_notes: 'CONTROVERSIAL FORAGE: contains ptaquiloside, a known carcinogen linked to upper-GI cancers in regions where bracken is regularly eaten. Some traditions (Japan, Korea) eat it after extensive boiling and salting. The CDC and most modern guides recommend AVOIDING bracken regardless of preparation. Listed here for completeness; do not recommend casually.',
    toxicity_notes: 'Ptaquiloside is a documented carcinogen. Long-term consumption is linked to elevated rates of stomach and esophageal cancer.',
    preparation_methods: ['cooked','salted','traditional-Korean'],
    usage_notes: 'NOT recommended as a regular forage. Listed for taxonomic completeness — not all foragers should add this to their menu.',
    harvest_tips: '(Skip — see safety_notes.)',
    interest_tags: ['caution','traditional']
  },
  {
    scientific_name: 'Betula alleghaniensis', common_name: 'Yellow birch',
    aliases: [],
    forage_parts: ['sap','twig'],
    safety_notes: '',
    preparation_methods: ['tea','syrup'],
    usage_notes: 'Similar wintergreen-aroma twigs as Betula lenta but milder. Sap-tappable like sugar maple but lower sugar yield.',
    harvest_tips: 'Same season as sweet birch (late Feb / early Mar in zone 6a).',
    interest_tags: ['native','sap_run']
  },
  {
    scientific_name: 'Sagittaria latifolia', common_name: 'Wapato',
    aliases: ['broadleaf arrowhead','duck potato'],
    forage_parts: ['root'],
    safety_notes: 'Identify carefully — many wetland plants have similar arrow-shaped leaves. Wapato has clearly arrow-shaped (sagittate) leaves with three pointed lobes.',
    preparation_methods: ['cooked','roasted'],
    usage_notes: 'Wetland tuber — important traditional food in PNW indigenous communities. Walnut-sized tubers form on rhizomes; sweet, potato-like flavor cooked.',
    harvest_tips: 'Best dug in late fall or early spring; traditionally harvested by stomping in shallow water to free tubers (which float). Cook whole or sliced.',
    interest_tags: ['wetland','native']
  },
  {
    scientific_name: 'Cornus canadensis', common_name: 'Bunchberry',
    aliases: ['Canadian dwarf cornel'],
    forage_parts: ['fruit'],
    safety_notes: '',
    preparation_methods: ['raw','jam'],
    usage_notes: 'Northern boreal groundcover with clusters of bright red berries in late summer. Mild flavor — not exciting raw, used in northern Indigenous traditions.',
    harvest_tips: 'Aug-Sep. Pick clusters; berries have one large central seed.',
    interest_tags: ['native','groundcover','boreal']
  },
  {
    scientific_name: 'Mitchella repens', common_name: 'Partridgeberry',
    aliases: ['squaw vine','two-eyed berry'],
    forage_parts: ['fruit'],
    safety_notes: '',
    preparation_methods: ['raw','jam'],
    usage_notes: 'Trailing evergreen groundcover with persistent paired red berries. Mild, slightly minty flavor. Berries persist through winter — a survival food.',
    harvest_tips: 'Berries available Sep through following spring. Pinch from stem.',
    interest_tags: ['native','groundcover','boreal']
  },
  {
    scientific_name: 'Cornus florida', common_name: 'Flowering dogwood',
    aliases: [],
    forage_parts: ['fruit'],
    safety_notes: 'Fruit edible cooked but not raw — bitter and mildly upsetting raw.',
    preparation_methods: ['cooked','jelly'],
    usage_notes: 'Iconic eastern NA understory tree, valued more for spring flowers than fruit. Bright red drupes in fall used in jelly traditions; not a major culinary forage.',
    harvest_tips: 'Sep-Oct. Cook into jelly with high sugar.',
    interest_tags: ['native','minor']
  }
];

// Convert a JS string array to a Postgres array literal: {"a","b"}
function pgArray(arr) {
  if (!arr || arr.length === 0) return '{}';
  return '{' + arr.map(s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"').join(',') + '}';
}

(async () => {
  let inserted = 0, skipped = 0;
  for (const sp of SPECIES) {
    const result = await sql`
      insert into species (
        scientific_name, common_name, aliases, is_forageable, forage_parts,
        safety_notes, preparation_methods, usage_notes, harvest_tips,
        toxicity_notes, interest_tags
      ) values (
        ${sp.scientific_name}, ${sp.common_name},
        ${pgArray(sp.aliases)}::text[],
        true,
        ${pgArray(sp.forage_parts)}::text[],
        ${sp.safety_notes ?? ''},
        ${pgArray(sp.preparation_methods)}::text[],
        ${sp.usage_notes ?? null},
        ${sp.harvest_tips ?? null},
        ${sp.toxicity_notes ?? null},
        ${pgArray(sp.interest_tags)}::text[]
      )
      on conflict (scientific_name) do nothing
      returning id`;
    if (result.length > 0) { inserted++; console.log(' ✓ inserted', sp.scientific_name); }
    else { skipped++; }
  }
  console.log(`\n${inserted} inserted, ${skipped} skipped (already present).`);
  await sql.end();
})();
