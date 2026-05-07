-- Hand-written usage_notes / harvest_tips / toxicity_notes /
-- preparation_methods for the species added in migration 29. Same
-- pattern as the original 45-species curation in migration
-- 20260506000027 — facts aren't copyrightable, so reading
-- Wikipedia + foraging field guides and writing original short
-- statements about edible parts, harvest signs, and uses is on
-- solid ground.
--
-- Idempotent: each row is gated by `where usage_notes is null`,
-- so re-running this leaves any later manual edits intact. To
-- re-curate one species, clear its usage_notes first.

-- ============================================================
-- Tier 1 — trees
-- ============================================================

update public.species set
  usage_notes = $$Native to eastern North America. Hard-shelled nuts with rich, distinctive flavor — strong and almost smoky compared to English walnut. Husks ripen and drop in fall; the green-husked stage is also used to make nocino liqueur.$$,
  harvest_tips = $$Collect from the ground in autumn. Wear rubber gloves — husks stain skin and clothing dark brown for weeks. Remove husks promptly; husks left to dry on the nut can darken the kernel. Cure shelled nuts 3-4 weeks before cracking.$$,
  toxicity_notes = $$Husks and roots release juglone, an allelopathic chemical toxic to many garden plants. Not toxic to humans.$$,
  preparation_methods = array['raw','cooked','baked','wine']
 where scientific_name = 'Juglans nigra' and usage_notes is null;

update public.species set
  usage_notes = $$Magenta-pink pea-shaped flowers blooming in early spring before leaves emerge. Mild, slightly sweet flavor with hints of pea or asparagus. Used as edible garnish in salads, baked goods, pickled, or made into jelly.$$,
  harvest_tips = $$Pick flowers shortly after they open, ideally on warm dry days. Young pods (under 1 inch) are also edible — boil briefly. Avoid trees treated with pesticides or near roadsides.$$,
  toxicity_notes = $$Only flowers and very young pods. Mature pods, leaves, bark, and seeds may cause mild digestive upset.$$,
  preparation_methods = array['raw','pickle','jelly','baked']
 where scientific_name = 'Cercis canadensis' and usage_notes is null;

update public.species set
  usage_notes = $$Fragrant cream-colored flowers in early summer make the classic European linden tea — calming, mildly sweet. Very young leaves are tender and mild as a salad green. Inner bark fiber traditionally used for cordage.$$,
  harvest_tips = $$Pick flower clusters when fully open but before they brown. Dry carefully in shade for tea storage. Pick young leaves (heart-shaped, soft) in late spring.$$,
  toxicity_notes = $$Generally safe; large quantities of flower tea may induce sweating in some accounts.$$,
  preparation_methods = array['raw','tea','dried']
 where scientific_name = 'Tilia americana' and usage_notes is null;

update public.species set
  usage_notes = $$Three distinct leaf shapes (single, mitten, three-lobed) on the same tree, all with strong root-beer aroma. Dried young leaves ground into filé powder for Cajun gumbo. Roots traditionally made root beer; leaves and twigs make a pleasant tea.$$,
  harvest_tips = $$Roots are pulled from young saplings (which have proportionally more cambium). Tea from twigs or leaves is milder than root tea. Collect leaves in late spring before they harden.$$,
  toxicity_notes = $$Root bark contains safrole — banned by FDA for commercial root beer in 1960 due to liver-toxicity studies. Tea in moderation is generally considered safe; pregnant or nursing women should avoid.$$,
  preparation_methods = array['tea','spice']
 where scientific_name = 'Sassafras albidum' and usage_notes is null;

update public.species set
  usage_notes = $$The classic source of maple syrup. Sap flows in late winter (typically February-March in the Northeast) when nights freeze and days thaw. About 40 gallons of sap boil down to 1 gallon of syrup.$$,
  harvest_tips = $$Tap trees at least 10-12 inches in diameter with a 7/16" bit to a depth of 2-2.5 inches. One tap per 12 inches of diameter. Sap stays clear and sweet at near-freezing; turbid or yellow sap means the season is ending.$$,
  toxicity_notes = $$$$,
  preparation_methods = array['syrup','wine']
 where scientific_name = 'Acer saccharum' and usage_notes is null;

update public.species set
  usage_notes = $$Tappable for sap like sugar maple but with about half the sugar content (~1.5%, vs. ~2-3% for sugar maple). Produces a slightly darker syrup. Sap window is narrower because red maples bud out earlier.$$,
  harvest_tips = $$Same tapping technique as sugar maple. Stop tapping as soon as buds swell — sap turns bitter.$$,
  toxicity_notes = $$Wilted red maple leaves are toxic to horses (does not affect humans or other livestock).$$,
  preparation_methods = array['syrup']
 where scientific_name = 'Acer rubrum' and usage_notes is null;

update public.species set
  usage_notes = $$Underrated tappable maple, common in cities and disturbed ground. Sap flow can be excellent with sugar content rivaling red maple. Yields a slightly distinctive amber syrup.$$,
  harvest_tips = $$Same as other maples; box elder is often a multi-trunked weed-tree and has soft wood, so tap carefully. Trees grow fast — tap any trunk over 8 inches.$$,
  toxicity_notes = $$$$,
  preparation_methods = array['syrup']
 where scientific_name = 'Acer negundo' and usage_notes is null;

update public.species set
  usage_notes = $$Genus of small thorny trees and shrubs producing red or yellow apple-like fruit (haws) in fall. Mealy texture; sweet-tart flavor. Used for jelly, syrup, brandy, and traditional heart-tonic preparations.$$,
  harvest_tips = $$Pick after first frost when fully ripe; haws may stay on the tree into winter. Mind the long thorns. Crush and strain for jelly — texture is unpleasant whole.$$,
  toxicity_notes = $$Seeds contain cyanogenic compounds; do not crush or chew. Strain pulp to remove seeds before processing.$$,
  preparation_methods = array['jelly','syrup','wine','tea']
 where scientific_name = 'Crataegus sp.' and usage_notes is null;

update public.species set
  usage_notes = $$One of the easiest acorns to process — relatively low tannins compared to red oaks. A staple food across many indigenous cultures. After leaching, makes a nutty flour for bread, pancakes, or porridge.$$,
  harvest_tips = $$Gather acorns from the ground after they drop in fall, before squirrels claim them. Float-test: bad acorns float, good ones sink. Shell, then leach in multiple cold-water changes (3-7 days) or hot-water cycles until no longer astringent.$$,
  toxicity_notes = $$Raw acorns contain tannins that bind to digestive proteins — eating unleached acorns causes stomach upset and is hard on kidneys with chronic use. Leach until the water runs clear and the meat tastes nutty, not bitter.$$,
  preparation_methods = array['flour','baked','cooked']
 where scientific_name = 'Quercus alba' and usage_notes is null;

update public.species set
  usage_notes = $$Large acorns (up to 2 inches), often with low enough tannin content to be eaten with minimal leaching. Found in Midwest oak savannas. Sweet-tasting once processed.$$,
  harvest_tips = $$Same as white oak — gather quickly, float-test, leach. Bur oak shells are harder; a vise or rock helps.$$,
  toxicity_notes = $$Same as Quercus alba — tannins must be leached out.$$,
  preparation_methods = array['flour','baked','cooked']
 where scientific_name = 'Quercus macrocarpa' and usage_notes is null;

update public.species set
  usage_notes = $$Small triangular nuts in spiny husks, ripening in fall after first frost. Sweet, oily, walnut-like — eaten raw or roasted. Rich in fat. A staple historic forage food.$$,
  harvest_tips = $$Husks open and drop nuts on ground beneath mature trees. Trees produce heavily only in mast years (every 2-8 years). Shell before eating.$$,
  toxicity_notes = $$Excessive raw consumption (cups per day) can cause stomach upset due to saponin content. Roasting reduces this.$$,
  preparation_methods = array['raw','cooked','baked']
 where scientific_name = 'Fagus grandifolia' and usage_notes is null;

update public.species set
  usage_notes = $$Soft 5-needle bundles brewed for vitamin C-rich tea with light citrusy pine flavor. Inner bark traditionally a starvation food, ground into flour. Pollen cones (in spring) edible raw or pickled.$$,
  harvest_tips = $$Snip needles year-round; spring needles are softest. Don't strip bark from a living tree (kills it) — only from felled wood.$$,
  toxicity_notes = $$Pregnant women and women trying to conceive should avoid pine-needle tea — some pine species contain isocupressic acid associated with miscarriage in cattle (effect on humans unclear). Eastern white pine is among the safer species, but caution is warranted.$$,
  preparation_methods = array['tea','flour']
 where scientific_name = 'Pinus strobus' and usage_notes is null;

update public.species set
  usage_notes = $$Soft short flat needles make a mild lemony-evergreen tea. Strictly the TREE — entirely unrelated to the herbaceous poison hemlock plant. New spring tips are tender and edible raw.$$,
  harvest_tips = $$Pluck needles or snip small twigs; tea brews well from a small handful per cup. Light spring growth has the best flavor.$$,
  toxicity_notes = $$This is the TREE hemlock (Tsuga), not the toxic herb poison hemlock (Conium maculatum). They share only a name.$$,
  preparation_methods = array['tea','raw']
 where scientific_name = 'Tsuga canadensis' and usage_notes is null;

update public.species set
  usage_notes = $$Cascading clusters of fragrant white pea-shaped flowers in late spring. Sweet floral flavor. Famously dipped whole into batter and fried as fritters; also makes a perfumed cordial or syrup.$$,
  harvest_tips = $$Collect flower clusters when fully open and white (avoid browning ones). Harvest on warm dry days when fragrance is strongest. Strip flowers from green stems before use.$$,
  toxicity_notes = $$Important: only the flowers are edible. Bark, leaves, seeds, and roots contain robin and phasin toxins — historically caused livestock deaths. Pods (which look pea-like) should NOT be eaten.$$,
  preparation_methods = array['raw','cooked','wine','syrup']
 where scientific_name = 'Robinia pseudoacacia' and usage_notes is null;

update public.species set
  usage_notes = $$Long flat dark-brown pods contain a sticky sweet pulp around the seeds. Pulp tastes mildly molasses-like and is the namesake — used for sweetening and beer-making. Trees were widely planted as livestock fodder.$$,
  harvest_tips = $$Pods drop in fall and persist into winter. Collect dry whole pods, then split for the pulp. Wild trees have ferocious branched thorns — wear sturdy clothing or harvest from cultivars (thornless cultivars are common landscaping trees).$$,
  toxicity_notes = $$Do not eat the actual seeds — only the surrounding pulp. Some sources discourage human consumption due to alkaloids; small quantities of pulp are traditional.$$,
  preparation_methods = array['raw','wine']
 where scientific_name = 'Gleditsia triacanthos' and usage_notes is null;

-- ============================================================
-- Tier 1 — shrubs
-- ============================================================

update public.species set
  usage_notes = $$Native eastern North American shrub. Fragrant red berries (drupes) in late summer dry to a strong allspice-like spice. Twigs and leaves make a clean spicy tea.$$,
  harvest_tips = $$Pick berries when fully red; dry whole or grind dried as spice. Snap a twig — instant strong allspice/citrus aroma confirms ID. Tea works year-round from twigs.$$,
  toxicity_notes = $$$$,
  preparation_methods = array['tea','spice','dried']
 where scientific_name = 'Lindera benzoin' and usage_notes is null;

update public.species set
  usage_notes = $$Astringent dark purple berries, very high in anthocyanins and antioxidants. Too tart for fresh eating; excellent for juice, jam, jelly, syrup, wine. Common landscape shrub increasingly grown commercially.$$,
  harvest_tips = $$Pick when fully black and slightly soft. Sweetens after frost. Often heavy yields on cultivated bushes.$$,
  toxicity_notes = $$$$,
  preparation_methods = array['jam','jelly','syrup','wine','cooked']
 where scientific_name = 'Aronia melanocarpa' and usage_notes is null;

update public.species set
  usage_notes = $$Beach rose with large round bright orange-red hips. Sweet-tart flavor, very high in vitamin C. Used for jelly, syrup, tea, and the classic Scandinavian rose-hip soup. Petals also edible — fragrant in syrups, jellies.$$,
  harvest_tips = $$Hips are best after first frost when fully softened. Cut hips, scrape out the seeds and irritating fine hairs, then use the flesh. Or split hips and dry for tea (strain to remove hairs). Pick petals shortly after opening.$$,
  toxicity_notes = $$Inner hairs surrounding seeds are mechanically irritating to the digestive tract — strain or remove before consuming.$$,
  preparation_methods = array['jam','jelly','syrup','tea','wine']
 where scientific_name = 'Rosa rugosa' and usage_notes is null;

update public.species set
  usage_notes = $$Bright red conical seed clusters (drupes) in late summer. Dried and ground for the classic Middle Eastern spice; soaked fresh in cold water for "sumac-ade," a tart vitamin C-rich pink lemonade-like drink.$$,
  harvest_tips = $$Pick clusters when fully red and the drupes feel slightly sticky to the touch (malic acid). Dry whole; grind to a coarse spice. For the drink, crush clusters in cold (NEVER hot) water for 15-30 minutes, then strain through cloth.$$,
  toxicity_notes = $$Distinct from POISON sumac (Toxicodendron vernix), which has white drupes hanging in loose clusters and grows in wet areas. Staghorn sumac has UPRIGHT RED clusters in dry uplands.$$,
  preparation_methods = array['spice','dried','tea']
 where scientific_name = 'Rhus typhina' and usage_notes is null;

update public.species set
  usage_notes = $$European-origin elder, increasingly common in North America. Same uses as American elderberry — syrup, jam, wine, cordial — with the same long folk tradition for cold/flu support.$$,
  harvest_tips = $$Pick whole umbel clusters when berries are fully dark and slightly drooping. Strip with a fork into a bowl. Always cook before consuming.$$,
  toxicity_notes = $$Same as American elderberry: leaves, stems, roots, and unripe berries contain cyanogenic glycosides. Even ripe berries cause GI upset raw. Cook only ripe berries.$$,
  preparation_methods = array['cooked','jam','jelly','syrup','wine','tea']
 where scientific_name = 'Sambucus nigra' and usage_notes is null;

-- ============================================================
-- Tier 1 — wild greens
-- ============================================================

update public.species set
  usage_notes = $$Vigorous spring green. Cooked, has a deep spinach-like flavor (some say better than spinach). Iron, calcium, and protein-rich. Used in soups, pestos, ravioli fillings, and as dried tea.$$,
  harvest_tips = $$Pick young shoots and leaves (top 4-6 inches) in early spring before flowering. WEAR GLOVES. Cooking, drying, or even briefly wilting destroys the stinging hairs.$$,
  toxicity_notes = $$Stinging hairs cause painful skin reaction on raw contact. After cooking or drying, completely safe.$$,
  preparation_methods = array['cooked','dried','tea']
 where scientific_name = 'Urtica dioica' and usage_notes is null;

update public.species set
  usage_notes = $$Cosmopolitan lawn weed; every part edible. Young leaves as bitter salad green or cooked. Flowers fried as fritters or made into wine. Roasted roots a coffee substitute. Flowers also for jelly.$$,
  harvest_tips = $$Young leaves before flower stalks emerge are least bitter. Avoid lawns sprayed with herbicide. Roots best in late fall after first frost; flowers when fully open on sunny days.$$,
  toxicity_notes = $$$$,
  preparation_methods = array['raw','cooked','wine','jelly','tea']
 where scientific_name = 'Taraxacum officinale' and usage_notes is null;

update public.species set
  usage_notes = $$Sprawling succulent with thick juicy leaves. Mildly tart and salty, slightly mucilaginous. Highest plant source of omega-3 fatty acids. Eaten raw in salads, stir-fried, or pickled.$$,
  harvest_tips = $$Look for prostrate mats of fleshy oval leaves on red-tinged stems, common in cracks and gardens. Pick in midsummer when actively growing. Snap stems below the leaves.$$,
  toxicity_notes = $$Distinguish from spurge (Euphorbia spp.) which looks similar but has milky white sap. Purslane sap is clear.$$,
  preparation_methods = array['raw','cooked','pickle']
 where scientific_name = 'Portulaca oleracea' and usage_notes is null;

update public.species set
  usage_notes = $$Wild relative of quinoa and spinach; widely considered the best wild green. Mild flavor — better than spinach for many. Goosefoot-shaped leaves often dusted with a fine white powder. Cooked like spinach.$$,
  harvest_tips = $$Pick young top growth (top 4 inches) repeatedly through summer. The plant resprouts vigorously. Older leaves get tough; flowering tops still edible.$$,
  toxicity_notes = $$Contains oxalates (like spinach, beets, chard). Cook to reduce; eat in moderation if you have kidney issues. Generally considered safe for typical consumption.$$,
  preparation_methods = array['raw','cooked']
 where scientific_name = 'Chenopodium album' and usage_notes is null;

update public.species set
  usage_notes = $$Common urban-lawn allium with strong garlic flavor. Greens, bulbs, and bulbils all usable. Mince into anything you'd use chives or garlic for; particularly good in compound butter and fresh salsas.$$,
  harvest_tips = $$Look for thin tubular leaves with onion smell when crushed, often in turfgrass. Greens spring through fall; bulbs in autumn. Year-1 plants don't flower; year-2 produces a tall stalk with a bulbil cluster.$$,
  toxicity_notes = $$ID by smell — onion/garlic odor is required. Toxic Death Camas (Zigadenus) has flat strap-like leaves and NO smell. Don't pick anything that doesn't smell of onion.$$,
  preparation_methods = array['raw','cooked','pickle']
 where scientific_name = 'Allium vineale' and usage_notes is null;

update public.species set
  usage_notes = $$Naturalized roadside daylily with bright orange flowers. Buds, fully-open flowers, and tubers all edible. Buds taste like a slightly sweet green bean; fully-open flowers go in salads. Dried buds (golden needles) are a Chinese cuisine staple.$$,
  harvest_tips = $$Pick unopened plump buds in summer for the best texture; flowers last only one day. Dig small starter tubers in fall — peel and eat raw or sauté.$$,
  toxicity_notes = $$Some people have GI upset from daylily — try a small amount the first time. Many other "lily" plants (true Lilium, Lily of the Valley) are NOT edible and can be toxic.$$,
  preparation_methods = array['raw','cooked','pickle','dried']
 where scientific_name = 'Hemerocallis fulva' and usage_notes is null;

-- ============================================================
-- Tier 1 — mushrooms
-- ============================================================

update public.species set
  usage_notes = $$Choice edible found year-round on dead or dying hardwoods, peaking in cool fall and winter. Mild seafood-like flavor. Excellent sautéed, in pasta, soups, or fried as "mock fried oysters."$$,
  harvest_tips = $$Look for shelf-like clusters with white-to-cream gills running down the short stem onto the substrate. Cut at the base, leaving the substrate intact for repeat fruiting. Younger caps cook better; older ones get tough.$$,
  toxicity_notes = $$A few inedible bitter look-alikes (Crepidotus, Lentinellus) but no deadly look-alikes. Confirm gills run onto the stem and the spore print is white-to-pale-lilac.$$,
  preparation_methods = array['cooked','dried']
 where scientific_name = 'Pleurotus ostreatus' and usage_notes is null;

update public.species set
  usage_notes = $$Distinctive icicle-spined cushion fungus on hardwood logs and standing dead trees. Texture and flavor reminiscent of crab or lobster when cooked. Choice edible with a growing reputation for cognitive support.$$,
  harvest_tips = $$Cut at the base from the bark; will regrow from the same spot in subsequent years. Best when spines hang fully but are still pure white. Tear into chunks and sear in butter — wet from rain, it benefits from initial dry-pan dehydrating.$$,
  toxicity_notes = $$$$,
  preparation_methods = array['cooked','dried']
 where scientific_name = 'Hericium erinaceus' and usage_notes is null;

update public.species set
  usage_notes = $$Bright orange-and-yellow shelf fungus on hardwoods (esp. oak), summer through fall. The texture really does resemble chicken; meaty and substantial. Best as a substitute in any dish you'd use chicken — sandwiches, fajitas, pies.$$,
  harvest_tips = $$Cut only the soft outer edges (top inch or two) — interior gets woody. Fresh growth is tender and bright; older specimens are tough and tasteless. On standing dead/living hardwoods.$$,
  toxicity_notes = $$Some people experience GI upset, especially with specimens growing on conifers (eucalyptus, hemlock). Stick to specimens on hardwoods (oak, cherry, locust). Try a small portion the first time.$$,
  preparation_methods = array['cooked']
 where scientific_name = 'Laetiporus sulphureus' and usage_notes is null;

update public.species set
  usage_notes = $$Cluster of fan-shaped grayish caps at the base of oaks in fall. Earthy meaty flavor; tear, shred, sauté. Strongly studied in Japan as maitake for immune support; also a choice culinary mushroom.$$,
  harvest_tips = $$Look at the base of oaks (especially old ones) in early fall. Specimens regrow yearly at the same spot — note the location. Tear apart by hand to clean (they harbor lots of dirt and insects), then sauté in stages.$$,
  toxicity_notes = $$Berkeley's polypore (Bondarzewia berkeleyi) is a bitter look-alike but not toxic. Sparassis crispa (cauliflower mushroom) is also edible and looks similar.$$,
  preparation_methods = array['cooked','dried']
 where scientific_name = 'Grifola frondosa' and usage_notes is null;

-- ============================================================
-- Tier 2 — regional or specialized
-- ============================================================

update public.species set
  usage_notes = $$Coastal Atlantic shrub with small dark purple-red plums (3/4 inch). Tart and rich; a classic Cape Cod jelly source. Also for wine and brandy infusion.$$,
  harvest_tips = $$Pick when fully colored (typically late summer through early fall). Dunes and coastal sand habitats only.$$,
  toxicity_notes = $$Pits contain cyanogenic compounds — do not crush or chew them. Strain after cooking.$$,
  preparation_methods = array['jam','jelly','wine','cooked']
 where scientific_name = 'Prunus maritima' and usage_notes is null;

update public.species set
  usage_notes = $$The classic cranberry of bog cultivation and Thanksgiving. Tart and astringent raw; sweetens with sugar. For sauce, juice, dried (often sweetened), and the obligatory cranberry bread.$$,
  harvest_tips = $$Wild on bog edges in fall. Floats on water (commercial harvest floods bogs and skims). Stays on the plant well into winter.$$,
  toxicity_notes = $$$$,
  preparation_methods = array['raw','cooked','jam','jelly','dried']
 where scientific_name = 'Vaccinium macrocarpon' and usage_notes is null;

update public.species set
  usage_notes = $$Pacific Northwest native with small black-purple berries on glossy evergreen leaves. Sweet-tart, persistent on the plant — picks well into winter.$$,
  harvest_tips = $$Pick berries individually when fully purple-black, October through January. Tolerates light frost — actually improves flavor.$$,
  toxicity_notes = $$$$,
  preparation_methods = array['raw','jam','jelly','baked']
 where scientific_name = 'Vaccinium ovatum' and usage_notes is null;

update public.species set
  usage_notes = $$Pacific Northwest evergreen shrub with holly-like leaves and clusters of purple-blue grape-like berries. Very tart raw, excellent for jelly, wine, and as a tart fruit puree.$$,
  harvest_tips = $$Berries ripen in late summer. Use pruning shears around the spiny leaves. Strain pulp from the small seeds.$$,
  toxicity_notes = $$Roots contain berberine, a strong bitter alkaloid (long folk medicinal use); berries are food-safe.$$,
  preparation_methods = array['jam','jelly','wine']
 where scientific_name = 'Mahonia aquifolium' and usage_notes is null;

update public.species set
  usage_notes = $$Pacific Northwest shrub with chains of dark blue-purple berries. Texture slightly mealy fresh; sweet and floral. Used for jam, dried as a raisin substitute, made into pemmican-style cakes.$$,
  harvest_tips = $$Pick when fully dark and slightly soft. Mid-to-late summer.$$,
  toxicity_notes = $$$$,
  preparation_methods = array['raw','jam','jelly','dried']
 where scientific_name = 'Gaultheria shallon' and usage_notes is null;

update public.species set
  usage_notes = $$Eastern woodland creeping evergreen with bright red berries and oily-aromatic leaves. The original source of natural wintergreen flavor. Berries are mild and pleasant; leaves are chewed for flavor or steeped.$$,
  harvest_tips = $$Berries persist all winter under snow. Leaves can be picked year-round. For tea, ferment leaves overnight in a sealed jar to develop full flavor before drying.$$,
  toxicity_notes = $$Methyl salicylate is the active flavor — chemically related to aspirin. Avoid in quantity for those with salicylate sensitivity. (The pure essential oil can be fatal in tablespoon doses; tea and berry consumption is fine.)$$,
  preparation_methods = array['raw','tea','dried']
 where scientific_name = 'Gaultheria procumbens' and usage_notes is null;

update public.species set
  usage_notes = $$Pacific Northwest bramble with fluorescent magenta-pink flowers and salmon-orange to ruby-red berries (color varies). Light, slightly watery flavor; better fresh than preserved.$$,
  harvest_tips = $$Pick when fully soft and easily detaching. Fruit is fragile — eat fresh or freeze same day. Among the earliest brambles to fruit (June in the PNW).$$,
  toxicity_notes = $$$$,
  preparation_methods = array['raw','jam']
 where scientific_name = 'Rubus spectabilis' and usage_notes is null;

update public.species set
  usage_notes = $$Northern bramble with shallow soft cap-shaped raspberries (the "thimble"). Fragile, melts in your mouth, intense raspberry-jam flavor. Must eat or use immediately — does not travel.$$,
  harvest_tips = $$Berries are very soft; pick directly into the mouth or onto a tray, not a basket. Mid-to-late summer.$$,
  toxicity_notes = $$$$,
  preparation_methods = array['raw','jam']
 where scientific_name = 'Rubus parviflorus' and usage_notes is null;

update public.species set
  usage_notes = $$Western North American elder with blue-glaucous berries (the bloom can make them look pale gray-blue). Sweeter than American or European elderberry — among the few elders sometimes eaten raw, though cooking is still safer.$$,
  harvest_tips = $$Berries ripen late summer to fall. Pick whole umbels, strip with a fork. Very heavy yields on mature plants.$$,
  toxicity_notes = $$Same Sambucus rules apply: leaves, stems, roots, and unripe berries are toxic. Cook ripe berries before consumption.$$,
  preparation_methods = array['cooked','jam','jelly','syrup','wine']
 where scientific_name = 'Sambucus cerulea' and usage_notes is null;

update public.species set
  usage_notes = $$Southwestern source of the classic pinyon nut — thick-shelled, intensely rich and resinous, far more flavorful than commercial Asian pine nuts. Foundational food in Southwestern indigenous cuisine.$$,
  harvest_tips = $$Cones drop nuts in late summer to fall — pick from the ground or shake mature cones onto a tarp. Roast in shell briefly to make cracking easier. Toast lightly to deepen the flavor.$$,
  toxicity_notes = $$Wild pinyon nuts almost never cause "pine mouth" (a metallic-taste reaction reported with some commercial Asian pine nuts of disputed species).$$,
  preparation_methods = array['raw','cooked','baked']
 where scientific_name = 'Pinus edulis' and usage_notes is null;

update public.species set
  usage_notes = $$Cool-season green with a mild lettuce-like flavor. Excellent in salads, sandwiches, and pestos. One of the few wild greens that's fresh-tender even in midwinter under snow.$$,
  harvest_tips = $$Look for low mats with paired oval leaves and a single line of hairs along one side of the stem (a key ID feature). Snip top inch or two; leaves fade fast in heat.$$,
  toxicity_notes = $$Confirm the line of stem hairs — toxic Anagallis arvensis (scarlet pimpernel) is similar-looking but lacks this feature, has square stems, and orange or blue flowers.$$,
  preparation_methods = array['raw','cooked']
 where scientific_name = 'Stellaria media' and usage_notes is null;

update public.species set
  usage_notes = $$Lawn weed with broad oval ribbed leaves. Young leaves cooked like spinach. Seeds (tiny black ones from the green spike) are an excellent thickener — same family as commercial psyllium.$$,
  harvest_tips = $$Pick young center leaves before they get tough and fibrous. Seed spikes ripen mid-summer; strip and dry, then thresh seeds out.$$,
  toxicity_notes = $$$$,
  preparation_methods = array['cooked','raw','flour']
 where scientific_name = 'Plantago major' and usage_notes is null;

update public.species set
  usage_notes = $$Sticky-velcro spring green that climbs through other vegetation. Mild flavor, traditionally a spring tonic. Better as juice or steeped in cold water than chewed (the hooked hairs are unpleasant in the mouth).$$,
  harvest_tips = $$Pick the soft 6-8 inches of growing tip in spring — that's the only tender stage. By summer it's fibrous and bristly.$$,
  toxicity_notes = $$$$,
  preparation_methods = array['cooked','tea']
 where scientific_name = 'Galium aparine' and usage_notes is null;

update public.species set
  usage_notes = $$Pungent peppery green growing in clean cold streams. Excellent in sandwiches, soups, and salads. Native to Europe and widely naturalized.$$,
  harvest_tips = $$Snip 4-6 inches from above the water line. Best in early spring and late fall — cool-water growth has the cleanest flavor.$$,
  toxicity_notes = $$Critical: harvest only from clearly clean unpolluted streams. Watercress concentrates pollutants and can carry parasites (especially liver fluke) where livestock graze upstream. When in doubt, cook briefly.$$,
  preparation_methods = array['raw','cooked']
 where scientific_name = 'Nasturtium officinale' and usage_notes is null;

update public.species set
  usage_notes = $$Biennial whose first-year taproots (dug in fall of year 1 or spring of year 2) make the Japanese vegetable gobo — long, brown-skinned, with a sweet earthy artichoke-like flavor. Young petioles also edible cooked.$$,
  harvest_tips = $$Identify in summer of year 1 (basal rosette of large furry leaves, no flower stalk yet). Dig roots in fall; they go straight down 1-2 feet and require a deep digging fork. Once the second-year flower stalk appears, the root is woody.$$,
  toxicity_notes = $$Confirm ID — first-year burdock rosettes look superficially like foxglove (Digitalis) seedlings, which are highly toxic. Burdock leaves are big, dull green, fuzzy. Foxglove leaves are smaller, deeper green, and crinklier.$$,
  preparation_methods = array['cooked','pickle']
 where scientific_name = 'Arctium minus' and usage_notes is null;

update public.species set
  usage_notes = $$Aromatic feathery-leaved perennial. Flavor is strong and slightly bitter, somewhere between chamomile and sage. Used as a hop substitute in old English ale, in herbal bitters, and as a tea.$$,
  harvest_tips = $$Pick flowering tops at first bloom. Dry quickly in shade — preserves flavor better than fresh use.$$,
  toxicity_notes = $$Avoid during pregnancy. May cause skin reactions in those allergic to ragweed (same family). Use small amounts as flavoring.$$,
  preparation_methods = array['tea','dried']
 where scientific_name = 'Achillea millefolium' and usage_notes is null;

-- ============================================================
-- Tier 3 — niche or higher-caution
-- ============================================================

update public.species set
  usage_notes = $$Eastern North American allium with a milder flavor than field garlic. Bulbs and greens used like spring onions or shallots; bulbils from the seedhead substitute for cloves.$$,
  harvest_tips = $$Look for tufted clusters with the unmistakable onion smell. Bulbs are best in fall after greens die back. Greens spring through early summer.$$,
  toxicity_notes = $$ID by smell — confirm onion/garlic odor. Death Camas (Zigadenus) is the dangerous look-alike with NO smell.$$,
  preparation_methods = array['raw','cooked','pickle']
 where scientific_name = 'Allium canadense' and usage_notes is null;

update public.species set
  usage_notes = $$Asian culinary allium often escaped from gardens. Flat strap-like leaves with a clear garlic flavor. Flowers (white umbels in late summer) also edible — milder, slightly sweet.$$,
  harvest_tips = $$Cut greens like chives — they regrow vigorously. Flowers are edible at the bud stage and just-opened.$$,
  toxicity_notes = $$Confirm garlic smell when crushed.$$,
  preparation_methods = array['raw','cooked','pickle']
 where scientific_name = 'Allium tuberosum' and usage_notes is null;

update public.species set
  usage_notes = $$Native sunflower with edible knobby tubers. Sweet, nutty, slightly artichoke-like flavor. Roasted, mashed, sliced into salads, or pickled. A pre-Columbian indigenous staple.$$,
  harvest_tips = $$Dig tubers in fall after frost or in early spring before regrowth. Stems can reach 8 feet, with classic small yellow sunflower heads. They spread aggressively — once planted, hard to eradicate.$$,
  toxicity_notes = $$Inulin is the storage carbohydrate; many people experience gas and bloating, especially with first exposure. Start with small portions.$$,
  preparation_methods = array['raw','cooked','pickle','baked']
 where scientific_name = 'Helianthus tuberosus' and usage_notes is null;

update public.species set
  usage_notes = $$Climbing native legume with strings of small dark tubers. Sweet, mealy, potato-like. A Native American staple that helped sustain the Pilgrims through their first winter.$$,
  harvest_tips = $$Look for compound leaves and clusters of dark maroon flowers (June-August). Tubers are connected like a string of beads, dug from late fall through spring. Cook before eating.$$,
  toxicity_notes = $$A small fraction of people have allergic reactions even after cooking. Try a small amount the first time.$$,
  preparation_methods = array['cooked','baked']
 where scientific_name = 'Apios americana' and usage_notes is null;

update public.species set
  usage_notes = $$One of the world's classic gourmet mushrooms — meaty, intensely flavored, with a rich umami broth when dried and reconstituted. Used in pasta, risotto, soups; many cooks prefer the dried form for stronger flavor.$$,
  harvest_tips = $$Look under conifers (esp. spruce, pine, fir) and oaks in summer to fall. Identify by tan-to-red-brown cap, white-to-yellow pore surface (no red), white bulging stalk often with reticulation, and lack of blue-staining when cut.$$,
  toxicity_notes = $$Bolete safety rules: avoid blue-staining, red-pored, and bitter-tasting boletes. Tylopilus felleus (bitter bolete) has pinkish pores when mature and is unmistakably bitter — taste a tiny piece raw. Boletus huronensis can cause GI upset.$$,
  preparation_methods = array['cooked','dried']
 where scientific_name = 'Boletus edulis' and usage_notes is null;

update public.species set
  usage_notes = $$Tall white shaggy-scaled cap; one of the easiest-to-identify edible mushrooms. Mild flavor; cooks down a lot. Must be cooked very fresh — autodigests and dissolves into black ink within hours of picking.$$,
  harvest_tips = $$Find in disturbed ground, lawns, woodchips, roadsides — late summer through fall. Pick young ones (still cylindrical and white) and cook the same day. Mature ones (gills turning black) are autodigesting.$$,
  toxicity_notes = $$Do not consume with alcohol on the same day. The closely related common inkcap (Coprinopsis atramentaria) contains coprine, which causes antabuse-like reactions; shaggy mane usually does not, but caution is the safe practice.$$,
  preparation_methods = array['cooked']
 where scientific_name = 'Coprinus comatus' and usage_notes is null;

update public.species set
  usage_notes = $$Distinctive jelly fungus that grows in flat ear-shaped clusters on dead hardwoods. Bland flavor on its own but excellent texture — used widely in Asian cuisine in soups (hot and sour) and stir-fries.$$,
  harvest_tips = $$Look on dead branches and logs of hardwoods (especially elder). Damp and rubbery when fresh, hard and crunchy when dry. Soak dried specimens before cooking.$$,
  toxicity_notes = $$$$,
  preparation_methods = array['cooked','dried']
 where scientific_name = 'Auricularia auricula-judae' and usage_notes is null;

update public.species set
  usage_notes = $$Lower-growing relative of Mahonia aquifolium, native to the western mountains. Fewer berries per plant, but same use — tart purple-blue grapes for jelly and wine.$$,
  harvest_tips = $$Same as M. aquifolium. Often growing as ground cover at higher elevations.$$,
  toxicity_notes = $$$$,
  preparation_methods = array['jam','jelly','wine']
 where scientific_name = 'Mahonia repens' and usage_notes is null;
