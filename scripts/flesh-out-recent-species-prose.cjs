// One-shot prose fill for recently-added species.
//
// Targets the 12 "recently added" species named in the May 2026 calibration
// audit task. Fills usage_notes, harvest_tips, toxicity_notes,
// preparation_methods, and attribution where currently NULL/empty.
//
// Skips:
//   - Acer platanoides (non-forageable invasive — no forage prose)
//   - Coccoloba uvifera (already fully populated)
//
// Does NOT touch review_status (user-only authority per
// feedback_review_status_confirmed.md).
//
// Run with:
//   node scripts/flesh-out-recent-species-prose.cjs

'use strict';

const fs = require('node:fs');
const env = fs.readFileSync('/Users/jk/Dropbox/Claude/forager/.env.local', 'utf8');
const SUPABASE_DB_URL = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim();
const sql = require('/Users/jk/Dropbox/Claude/forager/node_modules/postgres')(
  SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined }
);

// Controlled vocab (per the audit task spec):
//   ['raw', 'jam', 'wine', 'dried', 'tea', 'pickle', 'syrup', 'flour', 'cooked']

const UPDATES = [
  {
    scientific_name: 'Betula nigra',
    common_name: 'River birch',
    preparation_methods: ['syrup', 'tea'],
    usage_notes:
      'River birch sap can be tapped in late winter / early spring (same window as paper birch and sugar maple, but the run is briefer and the sugar concentration roughly half that of maple). Boil down for birch syrup — needs around 100:1 sap-to-syrup vs. maple\'s 40:1, but the syrup is darker, more mineral, almost molasses-like. Young twigs and inner bark have a faint wintergreen note (methyl salicylate) and can be steeped for a mild tea.',
    harvest_tips:
      'Tap trees at least 8-10 inches diameter; one tap per 12 inches DBH. River birch sap runs later and shorter than maple — typically a 2-3 week window when nights freeze and days thaw. Collect daily; birch sap sours quickly. Snip green twigs for tea any season but flavor is best in spring.',
    toxicity_notes:
      'Avoid medicinal doses of birch bark/twig preparations during pregnancy and for anyone on blood thinners — wintergreen-family salicylates are aspirin-like.',
    attribution: 'Wikidata: Q1510231 · Wikipedia: https://en.wikipedia.org/wiki/Betula_nigra',
  },

  {
    scientific_name: 'Gymnocladus dioicus',
    common_name: 'Kentucky coffeetree',
    preparation_methods: ['cooked'],
    usage_notes:
      'Marginal forage — only for the curious historian-cook. Settlers roasted the seeds dark to make a caffeine-free coffee substitute (hence the common name), but the roasting must be thorough: raw and lightly-cooked seeds and pods contain cytisine, a nicotinic-receptor agonist that has caused poisoning in livestock and humans. Modern foragers generally skip it; native pawpaw, hickory, and acorns are safer staples in the same range.',
    harvest_tips:
      'Pods drop in late fall through winter and persist on the tree — gather from the ground once the leathery brown pod has dried. Crack the pod, extract the large flat seeds, and roast at 300°F for 3+ hours until uniformly dark brown all the way through before grinding. Never sample raw.',
    toxicity_notes:
      'TOXIC RAW. Pods, pulp, and raw/under-roasted seeds contain cytisine (a nicotine-related alkaloid). Thorough roasting destroys the alkaloid; under-roasting does not. Livestock deaths recorded. Never eat raw or chew an "unroasted" seed to check.',
    attribution: 'Wikidata: Q549418 · Wikipedia: https://en.wikipedia.org/wiki/Gymnocladus_dioicus',
  },

  {
    scientific_name: 'Nyssa sylvatica',
    common_name: 'Black tupelo',
    preparation_methods: ['jam', 'jelly', 'wine', 'cooked'],
    usage_notes:
      'Marginal forage as a fresh fruit — the small blue-black drupes are intensely sour and astringent, never sweet. Mostly used cooked: pectin-rich, they make a tart jelly or wild-fruit wine often blended with sweeter berries. More famous as a honey-bee plant (tupelo honey comes from the flowers, not the fruit). Worth picking if you have a tree on the way to or from somewhere else; not worth a dedicated trip.',
    harvest_tips:
      'Pick when fruits turn deep blue-black in late September to mid-October — they soften quickly and birds clear a tree fast. Stone is large relative to the flesh, so yields by weight are modest. A tarp under the tree and a gentle shake usually beats hand-picking from a tall tupelo.',
    toxicity_notes: null,
    attribution: 'Wikidata: Q3179665 · Wikipedia: https://en.wikipedia.org/wiki/Nyssa_sylvatica',
  },

  {
    scientific_name: 'Picea abies',
    common_name: 'Norway spruce',
    preparation_methods: ['syrup', 'tea', 'cooked'],
    usage_notes:
      'Spring spruce tips — the soft chartreuse new growth pushing out of the brown bud caps — are the prime forage. Tart, citrusy, lightly piney; vitamin-C-rich. Used for spruce-tip syrup, infused sugar, herb salt, spruce beer, and as a fresh garnish on fish or game. Mature needles brew a vitamin-C tea similar to other spruces. Norway spruce is the most-planted ornamental spruce in eastern N. American cities — abundant urban forage.',
    harvest_tips:
      'Pick tips in spring when they are pale green and still soft enough to pinch off with a fingernail (typically May in zones 4-6). Take only a few tips per branch tip and never the leader; the tree will form a divot if over-stripped. Tips harden into mature needles within 2-3 weeks and lose the prime tender-tart character.',
    toxicity_notes:
      'Avoid medicinal-strength preparations during pregnancy; some conifers contain isocupressic acid associated with miscarriage in livestock. Spruce is among the safer conifers but caution is warranted. Do not confuse with yew (Taxus), which has flat needles and bright-red fleshy cone-cups and is highly toxic.',
    attribution: 'Wikidata: Q145992 · Wikipedia: https://en.wikipedia.org/wiki/Picea_abies',
  },

  {
    scientific_name: 'Pinus nigra',
    common_name: 'Austrian pine',
    preparation_methods: ['tea'],
    usage_notes:
      'Austrian pine is a hardy urban planting common as street tree and windbreak across the colder cities of eastern N. America (Montreal, Buffalo, Calgary). Needles brew a vitamin-C-rich pine tea, mildly resinous and lemony. Seeds are too small to be worth processing as pine nuts.',
    harvest_tips:
      'Snip a small cluster of mature green needles any season; chop coarsely, steep covered in just-off-the-boil water 5-10 minutes. Do not boil hard — high heat drives off the volatile aromatics and concentrates the bitter resins. One needle bundle (2 needles) per cup of tea is plenty.',
    toxicity_notes:
      'Avoid pine-needle tea during pregnancy — some Pinus species (notably ponderosa) contain isocupressic acid linked to miscarriage in cattle; the per-species human risk is unclear. Do not confuse with yew (Taxus), which is highly toxic; yew has flat soft needles and red fleshy fruit, no woody cones.',
    attribution: 'Wikidata: Q145954 · Wikipedia: https://en.wikipedia.org/wiki/Pinus_nigra',
  },

  {
    scientific_name: 'Pinus ponderosa',
    common_name: 'Ponderosa pine',
    preparation_methods: ['raw', 'cooked', 'tea', 'flour'],
    usage_notes:
      'The pine nuts (seeds) are smaller than P. edulis but a worthwhile western forage — sweet, resinous, eaten raw or lightly roasted. Inner bark (cambium) was a traditional Indigenous food, eaten fresh in spring or dried and ground into a flour-extender. Needles brew a vitamin-C tea — but see toxicity note.',
    harvest_tips:
      'Cones open in late summer / early fall and drop seeds — pick cones just as they begin to crack, dry them on a tarp in the sun, and shake out the winged seeds. De-wing by rubbing. Cambium is collected only from felled or storm-downed trees in spring, never stripped from a living tree (it kills the tree).',
    toxicity_notes:
      'DO NOT use ponderosa needles for tea during pregnancy. Ponderosa contains isocupressic acid and has caused well-documented late-term abortion in cattle that browse the needles. Human risk per cup is small but real; pregnant foragers should choose Pinus strobus or another species instead.',
    attribution: 'Wikidata: Q460523 · Wikipedia: https://en.wikipedia.org/wiki/Pinus_ponderosa',
  },

  {
    scientific_name: 'Populus deltoides',
    common_name: 'Eastern cottonwood',
    preparation_methods: ['cooked'],
    usage_notes:
      'Spring buds — the resinous, sticky, fragrant cottonwood/balm-of-Gilead buds — are the prime forage. Infused into olive oil over several weeks they produce a salicin-and-resin-rich salve used traditionally for sore muscles, scrapes, and chapped skin. The fragrance is honey-balsamic. Cottonwood is not a culinary forage — buds are medicinal/topical; do not eat in quantity.',
    harvest_tips:
      'Collect buds in late winter to very early spring, before they break open. The sticky resin gums up scissors fast — wear gloves and bring an oil-soaked rag for tool cleanup. Storm-downed branches are the easiest source; the tallest cottonwood buds are well out of reach. Buds should be sticky and fragrant; if dry, they are old.',
    toxicity_notes:
      'Cottonwood buds contain salicin (aspirin-like). Avoid medicinal use during pregnancy, by anyone on blood thinners, or by anyone with an aspirin allergy.',
    attribution: 'Wikidata: Q149319 · Wikipedia: https://en.wikipedia.org/wiki/Populus_deltoides',
  },

  {
    scientific_name: 'Prunus tomentosa',
    common_name: 'Nanking cherry',
    preparation_methods: ['raw', 'jam', 'wine', 'dried'],
    usage_notes:
      'A cold-hardy shrub-cherry from northeastern Asia, widely planted in prairie shelterbelts and Canadian/upper-Midwest yards because it fruits where sweet cherry won\'t survive. Bright red ¼-inch sour-sweet drupes ripen in summer. Eaten fresh by the handful or made into a tart jelly, syrup, or country wine; flavor is between sour cherry and chokecherry.',
    harvest_tips:
      'Pick when fruits are deep red, slightly soft, and pull off the twig easily — typically mid-June through July depending on zone. Bushes fruit heavily but the season is short; a single bush often ripens its whole crop inside 10 days. Pits are large relative to the flesh; a cherry pitter is impractical at this scale — cook whole, strain through a jelly bag, discard the pits.',
    toxicity_notes:
      'Pits, leaves, and twigs contain cyanogenic glycosides (like all Prunus). Cook fruit briefly before mashing to denature; never chew the pits. Cooked-and-strained jellies, syrups, and wines are safe.',
    attribution: 'Wikidata: Q627393 · Wikipedia: https://en.wikipedia.org/wiki/Prunus_tomentosa',
  },

  {
    scientific_name: 'Quercus bicolor',
    common_name: 'Swamp white oak',
    preparation_methods: ['flour', 'cooked'],
    usage_notes:
      'One of the best forage acorns in the eastern white-oak group — large, often sweet enough to eat with only a short cold-water leach. Common in floodplains and wet woods but also widely planted as a tough urban street tree. Process to flour for breads, pancakes, porridge; or roast whole and eat like chestnuts after a short leach.',
    harvest_tips:
      'Gather acorns from the ground after they drop in early fall, the same day if you can — squirrels and deer clear a tree fast. Float-test in water: bad/wormy acorns float, good ones sink. Shell, then cold-leach in multiple water changes for 2-5 days until the water runs clear and the meat tastes nutty rather than astringent.',
    toxicity_notes:
      'Raw acorns contain tannins that irritate the gut and stress the kidneys with chronic use. Leach until water runs clear and the meat is no longer bitter. Swamp white oak typically leaches faster than red-oak-group acorns.',
    attribution: 'Wikidata: Q142792 · Wikipedia: https://en.wikipedia.org/wiki/Quercus_bicolor',
  },

  {
    scientific_name: 'Quercus rubra',
    common_name: 'Northern red oak',
    preparation_methods: ['flour', 'cooked'],
    usage_notes:
      'The dominant urban oak in the Northeast and upper Midwest — abundant on streets, in parks, and on every campus. Red-oak group: acorns are high-tannin and require longer leaching than white-oak acorns, but the meat is large and the trees fruit heavily in mast years. Process to flour for baking; the resulting flour has a richer, deeper-roast flavor than white-oak flour.',
    harvest_tips:
      'Gather from the ground in fall — red-oak acorns mature in their second year, so a mast year only happens every 2-4 years; learn to recognize it from the litter on sidewalks. Float-test, shell, then cold-leach 5-10 days with daily water changes, or hot-leach (simmer-and-pour) over multiple cycles for faster results. Stop leaching when the meat tastes mild and nutty.',
    toxicity_notes:
      'Raw red-oak acorns are too tannic to be edible and will cause stomach upset; leach thoroughly. Do not use the same pot for leaching and food preparation without scrubbing — tannins stain.',
    attribution: 'Wikidata: Q147525 · Wikipedia: https://en.wikipedia.org/wiki/Quercus_rubra',
  },
];

async function main() {
  let updated = 0;
  for (const u of UPDATES) {
    // Only fill columns currently NULL/empty; never overwrite existing prose.
    const existing = await sql`
      SELECT id, usage_notes, harvest_tips, toxicity_notes, preparation_methods, attribution
      FROM species
      WHERE scientific_name = ${u.scientific_name}
      LIMIT 1
    `;
    if (existing.length === 0) {
      console.log('  SKIP (not in DB):', u.scientific_name);
      continue;
    }
    const row = existing[0];
    const patch = {};
    if (!row.usage_notes && u.usage_notes) patch.usage_notes = u.usage_notes;
    if (!row.harvest_tips && u.harvest_tips) patch.harvest_tips = u.harvest_tips;
    if (!row.toxicity_notes && u.toxicity_notes) patch.toxicity_notes = u.toxicity_notes;
    if ((!row.preparation_methods || row.preparation_methods.length === 0) &&
        u.preparation_methods && u.preparation_methods.length > 0) {
      patch.preparation_methods = u.preparation_methods;
    }
    if (!row.attribution && u.attribution) patch.attribution = u.attribution;

    const keys = Object.keys(patch);
    if (keys.length === 0) {
      console.log('  no-op (already populated):', u.scientific_name);
      continue;
    }

    await sql`UPDATE species SET ${sql(patch)} WHERE id = ${row.id}`;
    console.log('  updated', u.scientific_name, '— filled:', keys.join(', '));
    updated++;
  }
  console.log('\nDone. Species updated:', updated);
  await sql.end();
}

main().catch(e => { console.error(e); process.exit(1); });
