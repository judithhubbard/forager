// Seed catalog entries for inedible invasive species — those that
// don't belong on a "where to forage" list but DO belong on a
// "where to manage / remove" map. Each row gets foragable=false +
// a global invasive flag so the standard symbology applies.
//
// Idempotent: skips any species_name that already exists.

const postgres = require('postgres');
const path = require('node:path');
const { config } = require('dotenv');
config({ path: path.resolve(__dirname, '..', '.env.local') });

const SEEDER_EMAIL = 'judith.a.hubbard@gmail.com';

// Each entry: scientific_name, common_name, identification,
// management, impact summary. The species table doesn't have a
// hand-set group/category column — color/shape are derived in code.
const INVASIVES = [
  {
    scientific_name: 'Ailanthus altissima',
    common_name: 'Tree of heaven',
    identification:
      'Smooth gray bark on saplings, becoming slightly fissured with age. Compound leaves with 11–25+ leaflets, each with a small gland-tooth at the base. Crushed leaves smell distinctly like rancid peanuts or burnt rubber. Often confused with native sumac or walnut — sumac has serrated leaflets without basal teeth and a bushier habit; walnut has fewer leaflets and aromatic husks.',
    management:
      'Cutting alone causes vigorous resprouting and root suckering — often makes the problem worse. Best results: cut in mid-summer when carbohydrate reserves are lowest, then immediately treat the stump with herbicide (glyphosate or triclopyr). For small saplings, hand-pulling when soil is moist can work if the entire root is removed. Spotted lanternfly hosts heavily on this tree, so removal helps with that pest too.',
    impact:
      'Releases allelopathic chemicals that suppress native plant germination. Forms dense thickets that crowd out forest understory. Primary host of the spotted lanternfly, an emerging agricultural pest.'
  },
  {
    scientific_name: 'Acer platanoides',
    common_name: 'Norway maple',
    identification:
      'Dense rounded crown, 40–60 ft tall. Leaves resemble sugar maple but have 5–7 lobes (not 3) with milky white sap when the leafstalk is broken — sugar maple has clear sap. Bark develops shallow regular furrows with age. Seeds (samaras) form a wide horizontal V, unlike sugar maple’s near-vertical pair.',
    management:
      'Cut large trees and treat the stump with herbicide; bare cuts resprout. Pull seedlings when soil is moist — easy at the cotyledon-to-3-leaf stage, harder once taproot establishes. Prevent seed spread by removing female trees during seed set in late summer.',
    impact:
      'Casts denser shade than native maples, creating a near-bare understory. Out-competes sugar maple, beech, and oak seedlings in northeastern forests. Often planted as a street tree in the mid-20th century — many escapes from urban landscapes.'
  },
  {
    scientific_name: 'Hedera helix',
    common_name: 'English ivy',
    identification:
      'Evergreen woody vine. Two leaf forms: juvenile leaves are 3–5 lobed with a heart-shaped base; mature leaves (only on flowering vines climbing in sunlight) are unlobed and oval. Climbs trees and walls via aerial rootlets. Black berries appear on mature vines.',
    management:
      'For tree-climbing vines, sever the stems at chest height and at ground level — leave the upper portion to die in place rather than ripping it down (avoids tree damage). For ground cover, hand-pull or smother with cardboard + mulch over a full growing season. Cut stems close to soil and immediately apply herbicide if hand-pulling fails.',
    impact:
      'Smothers native ground-layer plants. Adds significant weight to host trees, increasing wind-throw risk. Provides poor wildlife habitat compared to native ground covers. Berries are toxic to humans and most birds.'
  },
  {
    scientific_name: 'Celastrus orbiculatus',
    common_name: 'Oriental bittersweet',
    identification:
      'Woody vine that climbs and girdles trees. Round, glossy leaves with finely toothed edges (alternate). Distinctive yellow-orange capsules in fall split to reveal red-orange seeds — clusters appear all along the stem (axillary), unlike native American bittersweet which clusters only at stem tips.',
    management:
      'Cut all stems at the base in late summer / early fall, then apply herbicide to the cut surface. Vines too thick to cut by hand can be girdled. Remove and burn or bag fruit-bearing portions — birds spread the seeds widely.',
    impact:
      'Strangles and kills mature trees by twining tightly around trunks and branches. Hybridizes with the rare native American bittersweet, threatening it via genetic dilution. Heavy seed crops fuel rapid spread along forest edges and disturbed sites.'
  },
  {
    scientific_name: 'Rhamnus cathartica',
    common_name: 'Common buckthorn',
    identification:
      'Small tree or large shrub, 10–25 ft. Twigs end in a small thorn between paired buds. Leaves are oval with finely-toothed margins, opposite or sub-opposite. Distinctive feature: leaves stay green well into late fall, weeks after native trees drop. Black berries in fall, mildly cathartic to humans (hence the name).',
    management:
      'Hand-pull seedlings in spring. Cut larger stems and apply herbicide to the stump — bare cuts resprout vigorously. The "buckthorn baggie" technique — covering the cut stump with a dark plastic bag for a year — works without herbicide if labor is cheap.',
    impact:
      'Forms dense thickets that exclude native understory. Alternate host of soybean aphid and oat crown rust — costs farmers millions. Fruit acts as a laxative on birds, spreading seeds rapidly.'
  },
  {
    scientific_name: 'Frangula alnus',
    common_name: 'Glossy buckthorn',
    identification:
      'Distinguished from common buckthorn by glossy leaves (untoothed margins, alternate arrangement), no terminal thorn, and dark red berries that ripen to black. More common in wet soils — bogs, fens, swamps.',
    management:
      'Same as common buckthorn: cut + stump-treat or bag. Heavy seed bank means follow-up sweeps for 5+ years.',
    impact:
      'Invades fens and bogs where few woody plants compete, dramatically altering wetland plant communities. Particularly damaging to tamarack swamps and rare fen ecosystems.'
  },
  {
    scientific_name: 'Lonicera japonica',
    common_name: 'Japanese honeysuckle',
    identification:
      'Twining woody vine. Leaves are oval, opposite, often semi-evergreen in mild winters. Highly fragrant white-to-yellow tubular flowers in pairs along the stem (May–June). Black berries in late summer (toxic to humans).',
    management:
      'Cut stems in late winter and apply herbicide to the cut surface — leaves are absent so spray won’t harm nontarget plants. Hand-pulling works for small infestations if the entire root crown is removed. Repeated mowing reduces vigor over multiple years.',
    impact:
      'Smothers native shrubs and tree seedlings. Strangles small trees. Outcompetes native spring ephemerals by leafing out earlier.'
  },
  {
    scientific_name: 'Ligustrum sinense',
    common_name: 'Chinese privet',
    identification:
      'Semi-evergreen shrub, 6–20 ft. Small (1–2 inch) opposite leaves, smooth-margined, dark green above. Tiny white tubular flowers in pyramidal clusters in spring. Bluish-black berries in dense clusters in fall, persisting into winter.',
    management:
      'Hand-pull or grub seedlings. Larger stems: cut and stump-treat with herbicide. Fire is effective in fire-tolerant ecosystems but rarely an option in suburban or riparian sites.',
    impact:
      'Forms near-monocultures along streambanks and forest edges. One of the worst invaders in the southeastern US. Berries spread by birds; seedlings tolerate deep shade.'
  },
  {
    scientific_name: 'Pyrus calleryana',
    common_name: 'Callery pear',
    identification:
      'Tree 30–50 ft, often with a teardrop or oval crown. Showy white blossoms in early spring (before leaves) — distinctive unpleasant smell. Glossy oval leaves with wavy margins; brilliant burgundy fall color. Small (¼ inch) hard fruits in fall, persistent into winter.',
    management:
      'Cut and stump-treat. Saplings and root suckers resprout aggressively if untreated. The cultivar "Bradford" was thought to be sterile — turns out it cross-pollinates with other cultivars and produces fertile fruit, fueling the explosion since the 1990s.',
    impact:
      'Forms dense thorny thickets in old fields and forest edges (wild seedlings revert to thorny ancestral form). Crowds out native trees in disturbed sites throughout the eastern US. Brittle wood prone to limb failure makes it a poor street tree even on its merits.'
  },
  {
    scientific_name: 'Reynoutria japonica',
    common_name: 'Japanese knotweed',
    identification:
      'Hollow bamboo-like stems with reddish nodes, 6–10 ft tall by mid-summer. Heart- to shovel-shaped leaves with a flat (not heart-shaped) base. White flower clusters in late summer. Spreads aggressively via rhizomes — small fragments can root.',
    management:
      'EXTREMELY persistent — small root fragments regrow. Repeated cutting (every 2–3 weeks for entire growing season) over 3–5 years can exhaust rhizomes. Herbicide injection into hollow stems in late summer is more reliable. NEVER compost or move soil from infested sites.',
    impact:
      'Crowds out riparian natives, reducing salmon-fry habitat in the Pacific Northwest. Penetrates pavement, foundations, and drainage systems — major property-damage liability in the UK. Notably hard to eradicate.'
  }
];

(async () => {
  const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined });
  try {
    const u = await sql`select id from auth.users where email = ${SEEDER_EMAIL} limit 1`;
    if (!u[0]) throw new Error(`seeder user not found: ${SEEDER_EMAIL}`);
    const seederId = u[0].id;

    let inserted = 0, alreadyHad = 0, flagged = 0;
    for (const inv of INVASIVES) {
      const existing = await sql`
        select id from public.species where scientific_name = ${inv.scientific_name} limit 1
      `;
      let speciesId;
      if (existing[0]) {
        speciesId = existing[0].id;
        alreadyHad++;
        // Update content fields in case the seed text was refined.
        await sql`
          update public.species
             set is_forageable = false,
                 identification_notes = ${inv.identification},
                 management_notes = ${inv.management},
                 usage_notes = ${inv.impact}
           where id = ${speciesId}
        `;
        console.log(`· ${inv.common_name.padEnd(28)} (already in catalog, content refreshed)`);
      } else {
        const r = await sql`
          insert into public.species (
            scientific_name, common_name,
            is_forageable, identification_notes, management_notes, usage_notes,
            forage_parts
          ) values (
            ${inv.scientific_name}, ${inv.common_name},
            false, ${inv.identification}, ${inv.management}, ${inv.impact},
            array[]::text[]
          )
          returning id
        `;
        speciesId = r[0].id;
        inserted++;
        console.log(`✓ ${inv.common_name.padEnd(28)} (${inv.scientific_name}) added`);
      }
      // Global invasive flag.
      const f = await sql`
        insert into public.species_invasive_flags (species_id, region_id, flagged_by, notes)
        values (${speciesId}, null, ${seederId}::uuid,
          'Seed flag — globally recognized invasive in NA. Inedible / not foraged.')
        on conflict (species_id, region_id, flagged_by) do nothing
        returning id
      `;
      if (f.length > 0) flagged++;
    }
    console.log(`\nDone: ${inserted} species added, ${alreadyHad} content-refreshed, ${flagged} new flags.`);

    const counts = await sql`
      select s.common_name, s.is_forageable, s.invasive_flag_count
        from public.species s
       where s.invasive_flag_count > 0 or s.is_forageable = false
       order by s.is_forageable, s.invasive_flag_count desc, s.common_name
    `;
    console.log('\nNon-foragable + invasive species:');
    for (const c of counts) {
      const tag = c.is_forageable ? 'edible' : 'INEDIBLE';
      console.log(`  ${tag.padStart(8)}  ${String(c.invasive_flag_count).padStart(2)} flags  ${c.common_name}`);
    }
  } finally {
    await sql.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
