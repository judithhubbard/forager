-- Initial pass at curating usage_notes / harvest_tips / toxicity_notes /
-- preparation_methods for the seeded forageable species. Drafted from
-- general foraging knowledge; each species has a Wikipedia URL in its
-- attribution column for verification before applying.
--
-- Idempotent — only updates rows where usage_notes is currently NULL.
-- Hand-curated rows are preserved. Re-running this migration after a
-- curator edits a row will not clobber their work.
--
-- Toxicity bias: when in doubt, include the caveat. Stone-fruit pits,
-- cyanogenic glycosides in Prunus / Sambucus, hydrazines in raw morels,
-- and the well-documented look-alike hazards for ramps / chanterelles /
-- morels are all called out explicitly. The disclaimer at the bottom
-- of /species/[id] already reminds users to verify ID independently;
-- these notes complement that, not replace it.
--
-- preparation_methods uses these soft-enum values: raw, cooked, jam,
-- jelly, dried, baked, syrup, tea, pickled, fermented, wine, juice,
-- pie, sauce, ice_cream, candied, flour, infusion. Plain text array,
-- not strictly enforced — keeping it open lets curators add specifics.

-- Serviceberries: small sweet purple-red pomes, eaten raw or in jam/pie.
update public.species
   set usage_notes = $$Small purple-red pomes with a mild, sweet, slightly almond-like flavor — best eaten raw, fresh off the branch, or made into jam, pie, or fruit leather. Often picked alongside birds; if you see flocks working a tree, the fruit is ripe.$$,
       harvest_tips = $$Pick when fruit is fully dark purple and gives slightly to the touch — under-ripe red berries are bland and dry. Birds strip a tree quickly, so visit daily once color appears. Hand-picking from low branches; a sheet under taller trees catches fallers.$$,
       toxicity_notes = $$The flesh is safe. Seeds (like other rosaceous fruits) contain trace cyanogenic glycosides; not a concern when eaten in normal quantities, but don't crush and consume large amounts of seeds.$$,
       preparation_methods = array['raw','jam','jelly','pie','dried','syrup']
 where scientific_name in ('Amelanchier laevis','Amelanchier arborea','Amelanchier canadensis')
   and usage_notes is null;

-- Cornus mas (Cornelian cherry) — late summer red drupes.
update public.species
   set usage_notes = $$Oblong red-to-dark-ruby drupes ripening late summer into early fall, with a tart cranberry-and-sour-cherry flavor when fully ripe. Most often used for jam, syrup, fruit leather, or traditional Eastern European preserves; eaten fresh only when very dark and slightly soft, otherwise quite astringent.$$,
       harvest_tips = $$Wait until the fruit is dark ruby-red (not bright red) and yields to gentle pressure — under-ripe fruit is unpleasantly astringent. Most fruit drops as it ripens; laying a sheet under the tree and shaking gently is the standard harvest method. The single hard pit is not eaten.$$,
       toxicity_notes = $$No known toxicity in the ripe flesh. The pit is hard and inedible — discard or cook around it.$$,
       preparation_methods = array['raw','jam','syrup','dried','wine','sauce']
 where scientific_name = 'Cornus mas'
   and usage_notes is null;

-- Cornus officinalis (Asian relative; same use profile as C. mas).
update public.species
   set usage_notes = $$Close Asian relative of Cornus mas, with similarly tart red drupes used in jam, syrup, and traditional Chinese medicine preparations (shānzhūyú). Treat the same way as Cornelian cherry for foraging purposes.$$,
       harvest_tips = $$Same as Cornus mas: harvest when fully dark red and slightly soft. Astringent until fully ripe.$$,
       toxicity_notes = $$No known toxicity in the ripe flesh. Pit inedible.$$,
       preparation_methods = array['raw','jam','syrup','dried','infusion']
 where scientific_name = 'Cornus officinalis'
   and usage_notes is null;

-- Asimina triloba (pawpaw) — soft custardy fruit, fall.
update public.species
   set usage_notes = $$Large soft fruit with a custardy yellow-green flesh tasting like banana-mango-pineapple. Best eaten fresh and ripe with a spoon, or used in ice cream, custards, breads, and pancakes. Doesn't keep or ship — a true forager's fruit.$$,
       harvest_tips = $$Pick when fruit is fragrant and yields to a thumb's pressure, usually mid-September through early October. Many fall on their own; a gentle shake brings down the ripest. Refrigerate immediately and eat within a few days; pawpaws bruise and overripen fast.$$,
       toxicity_notes = $$Eat only the flesh — discard the large dark seeds and the skin. Pawpaw seeds and skin contain annonaceous acetogenins, which can cause GI upset. A small percentage of people develop a contact rash from handling the fruit; gloves help if you're sensitive.$$,
       preparation_methods = array['raw','baked','ice_cream','sauce']
 where scientific_name = 'Asimina triloba'
   and usage_notes is null;

-- Diospyros virginiana (American persimmon).
update public.species
   set usage_notes = $$Small orange fruit, intensely sweet and honey-like when fully ripe — typically after the first hard frost. Used fresh, in puddings, breads, and preserves; the pulp freezes well. The chalky astringency of an under-ripe fruit is memorable and unmistakable.$$,
       harvest_tips = $$Wait until fruit is wrinkled, soft, and translucent — falling on its own is the surest sign. Don't be tempted by the orange color alone; under-ripe persimmons are extraordinarily astringent. Frost helps but isn't strictly required if the fruit is fully soft.$$,
       toxicity_notes = $$No true toxicity, but eating large quantities of unripe fruit can cause "diospyrobezoars" — hardened tannin masses in the stomach. Stick to fully ripe fruit and the issue does not arise.$$,
       preparation_methods = array['raw','baked','jam','dried','pudding']
 where scientific_name = 'Diospyros virginiana'
   and usage_notes is null;

-- Morus alba (white mulberry) and Morus rubra (red mulberry).
update public.species
   set usage_notes = $$Sweet elongated drupes ripening in early-to-mid summer, eaten raw straight off the tree, or used in jam, pies, fruit leather, and wine. The fruit drops continuously over a 3–4 week window; lay a sheet under the tree and shake. Red mulberry (M. rubra) is generally darker and more flavorful than white mulberry (M. alba), but both are pleasant.$$,
       harvest_tips = $$Pick when berries are fully dark (black-purple for ripe M. rubra; dark pink to nearly black for M. alba — though some M. alba cultivars stay white when ripe). Ripe fruit detaches with the slightest pressure. Wear clothes you don't mind staining; the juice is permanent on fabric.$$,
       toxicity_notes = $$Ripe fruit is safe. Unripe fruit and the milky sap of leaves and stems contain irritant compounds that can cause GI upset and, rarely, hallucinations — only eat fully ripe berries and don't chew on stems or leaves.$$,
       preparation_methods = array['raw','jam','pie','dried','wine','syrup']
 where scientific_name in ('Morus alba','Morus rubra')
   and usage_notes is null;

-- Juglans cinerea (butternut) and J. nigra-relative species.
update public.species
   set usage_notes = $$Rich oily nuts harvested in fall after the green husks blacken and drop. Butternut has a sweeter, more buttery flavor than black walnut and was historically pickled while still green. Eaten raw or in baking; the kernel is small relative to the shell, so a hand-cracker is essential.$$,
       harvest_tips = $$Collect once husks have turned dark and the nut falls free. Wear gloves — the husk juice stains skin dark brown for weeks. Cure nuts in a dry place for several weeks before cracking. Butternut canker has wiped out many wild populations, so harvest sustainably.$$,
       toxicity_notes = $$Husks contain juglone, a phytotoxin that stains skin and clothing and can cause contact dermatitis in sensitive people. The nut itself is safe to eat.$$,
       preparation_methods = array['raw','baked','pickled','candied']
 where scientific_name = 'Juglans cinerea'
   and usage_notes is null;

update public.species
   set usage_notes = $$Asian relative of butternut, with similar fall-ripening nuts and a comparable buttery flavor. Used the same ways as butternut and English walnut.$$,
       harvest_tips = $$Harvest after husks blacken and drop in fall. Wear gloves to avoid juglone staining. Cure in a dry, ventilated space for several weeks before cracking.$$,
       toxicity_notes = $$Husks contain juglone — stains skin and may cause dermatitis. The kernel is safe.$$,
       preparation_methods = array['raw','baked']
 where scientific_name = 'Juglans ailantifolia'
   and usage_notes is null;

update public.species
   set usage_notes = $$The cultivated walnut familiar from grocery stores — large, mild, sweet kernels harvested in fall. Used raw, in baking, candied, pressed for oil, and pickled while still green for traditional preserves. Falls free of the husk when fully ripe.$$,
       harvest_tips = $$Pick up nuts after the husks split and the nut drops in fall. Cure in a single layer in a dry place for 2–3 weeks before storing. Green nuts (still in soft husk) can be pickled for traditional Mediterranean preserves like nocino.$$,
       toxicity_notes = $$Husks contain juglone — stains and can irritate skin. The kernel is safe and is a common food allergen for some people.$$,
       preparation_methods = array['raw','baked','candied','pickled','oil']
 where scientific_name = 'Juglans regia'
   and usage_notes is null;

-- Carya ovata (shagbark hickory) and related Carya.
update public.species
   set usage_notes = $$Sweet, rich edible nuts ripening in fall — among the best-tasting wild nuts in eastern North America. Eaten raw, in baking, or rendered into hickory syrup from the bark. Shells are extremely hard; a vice or stout cracker is needed.$$,
       harvest_tips = $$Collect after husks split open and nuts drop in late September through October. Look for clean, intact husks — wormy nuts will rattle or feel light. Cure for a few weeks before cracking; flavor improves with a short rest.$$,
       toxicity_notes = $$No known toxicity in the kernel. Husks and bark contain mild juglone-class compounds (less than walnut) — wash hands after handling.$$,
       preparation_methods = array['raw','baked','syrup','candied']
 where scientific_name in ('Carya ovata','Carya laciniosa')
   and usage_notes is null;

-- Carya illinoinensis (pecan).
update public.species
   set usage_notes = $$Sweet, soft, oil-rich nuts — the cultivated pecan of pies and pralines. Native to the south-central US and widely cultivated; in the northeast, cold-hardy cultivars produce smaller but viable crops. Eaten raw, in baking, candied, or pressed for oil.$$,
       harvest_tips = $$Harvest after husks split and nuts drop in October–November. Pecan shells are thinner than other Carya — easy to crack. Refrigerate or freeze long-term storage; the high oil content goes rancid quickly at room temperature.$$,
       toxicity_notes = $$No known toxicity. Common tree-nut allergen.$$,
       preparation_methods = array['raw','baked','candied','pie']
 where scientific_name = 'Carya illinoinensis'
   and usage_notes is null;

-- Castanea — chestnuts.
update public.species
   set usage_notes = $$Sweet starchy nuts harvested in fall, traditionally roasted, boiled, or ground into flour for bread and pasta. Once a staple wild food in eastern North America before the chestnut blight wiped out C. dentata; surviving stands and resistant Asian-American hybrids are slowly recovering.$$,
       harvest_tips = $$Collect after burrs drop and split open in October. Wear thick gloves — the burrs are intensely spiny. Score the shell with an X before roasting to prevent explosions. Eat soon or refrigerate; chestnuts spoil faster than other nuts.$$,
       toxicity_notes = $$No known toxicity. Do not confuse with horse chestnut (Aesculus), which has a similar-looking but distinctly different nut and is not edible.$$,
       preparation_methods = array['baked','boiled','flour','candied']
 where scientific_name in ('Castanea dentata','Castanea mollissima','Castanea sativa')
   and usage_notes is null;

-- Castanea pumila (chinquapin) — smaller relative.
update public.species
   set usage_notes = $$Smaller chestnut relative producing single-seeded burrs in fall. Sweeter and easier to eat than full-sized chestnuts but with much smaller kernels. Roasted, boiled, or eaten raw straight from the burr.$$,
       harvest_tips = $$Pick burrs as they begin to split in fall. Heavy gloves required. Smaller crop than other Castanea but worth the effort.$$,
       toxicity_notes = $$No known toxicity. Don't confuse with horse chestnut (Aesculus, inedible).$$,
       preparation_methods = array['raw','baked','boiled']
 where scientific_name = 'Castanea pumila'
   and usage_notes is null;

-- Malus domestica (apple).
update public.species
   set usage_notes = $$The cultivated apple — wild trees and feral seedlings are abundant along old roads, fence lines, and abandoned farms. Flavor varies wildly tree to tree; some are dessert-quality, many are best for cider, sauce, or pies.$$,
       harvest_tips = $$Pick when fruit pulls free with a slight twist — if it resists, it's not yet ripe. Taste from a single tree before harvesting in quantity; many wild apples are tart enough to be unpleasant fresh but make excellent cider or pies. Drops on the ground are fine for cooking if not bruised.$$,
       toxicity_notes = $$Flesh is safe. Seeds contain amygdalin, which releases small amounts of cyanide if chewed and consumed in quantity — don't crunch handfuls of seeds. Whole-fruit cider and incidentally swallowed seeds are not a concern.$$,
       preparation_methods = array['raw','baked','jam','sauce','pie','cider','dried']
 where scientific_name = 'Malus domestica'
   and usage_notes is null;

-- Pyrus communis (pear) and Pyrus ussuriensis.
update public.species
   set usage_notes = $$Common edible pear — wild trees and feral seedlings produce highly variable fruit. Eaten fresh when ripe, used for jam, dried, or fermented into perry (pear cider).$$,
       harvest_tips = $$Pears typically ripen better off the tree than on it — pick when fruit has color but is still firm, then ripen at room temperature for a few days. Test by gentle pressure at the stem end.$$,
       toxicity_notes = $$Flesh is safe. Seeds contain trace amygdalin — same caveat as apple.$$,
       preparation_methods = array['raw','baked','jam','dried','wine','sauce']
 where scientific_name = 'Pyrus communis'
   and usage_notes is null;

update public.species
   set usage_notes = $$Asian pear species — the parent of many cold-hardy pear cultivars. Smaller, rounder, and more astringent than European pears; usually best after a frost or cooked into preserves.$$,
       harvest_tips = $$Pick when slightly soft and aromatic. Like other pears, ripens better off the tree.$$,
       toxicity_notes = $$Flesh is safe. Seeds contain trace amygdalin.$$,
       preparation_methods = array['raw','jam','dried','sauce']
 where scientific_name = 'Pyrus ussuriensis'
   and usage_notes is null;

-- Elaeagnus umbellata (autumn olive) — invasive, foraging encouraged.
update public.species
   set usage_notes = $$Small red speckled berries with a tart-sweet flavor, ripe in fall. High in lycopene. Used for jam, sauces, fruit leather, and added to baked goods. Officially invasive in much of the eastern US — foraging is actively encouraged as a control measure.$$,
       harvest_tips = $$Pick when fully red and yielding; under-ripe berries are unpleasantly astringent. A tarp under the bush and a gentle shake brings down ripe fruit by the handful. Frost intensifies sweetness.$$,
       toxicity_notes = $$No known toxicity. Seeds are soft and edible; many people eat them whole.$$,
       preparation_methods = array['raw','jam','syrup','sauce','dried']
 where scientific_name = 'Elaeagnus umbellata'
   and usage_notes is null;

-- Corylus americana, C. cornuta — hazelnuts.
update public.species
   set usage_notes = $$Small native hazelnuts in leafy bracts (American hazel) or long beaked husks (beaked hazel), ripening in late summer to early fall. Eaten raw, roasted, or ground; flavor is rich and similar to the cultivated European hazelnut.$$,
       harvest_tips = $$Pick whole husks when they begin to brown — squirrels strip a bush fast, so check often once they start coloring. Beaked hazel husks have stinging hairs; gloves recommended. Cure husks for a week before extracting nuts; shells crack easily with pliers.$$,
       toxicity_notes = $$No known toxicity. Common tree-nut allergen.$$,
       preparation_methods = array['raw','baked','candied']
 where scientific_name in ('Corylus americana','Corylus cornuta')
   and usage_notes is null;

-- Sambucus canadensis (American elderberry) — important toxicity caveat.
update public.species
   set usage_notes = $$Clusters of small dark purple-black berries, ripe August through September, traditionally cooked into syrup, jam, jelly, wine, and cordial. Flowers (in late June) are dipped in batter for fritters or steeped for cordial. Strong immune-supportive folk reputation; modern preparations widely sold.$$,
       harvest_tips = $$Pick whole umbel clusters when berries are fully dark and slightly drooping. Strip berries from stems with a fork over a bowl. Cook before consuming — fresh berries are unpleasant raw and contain enough of the toxic compounds to cause GI upset.$$,
       toxicity_notes = $$Important: leaves, stems, roots, and unripe (green) berries contain cyanogenic glycosides and are toxic raw. Even ripe berries can cause nausea and diarrhea if eaten raw in quantity. Cooking destroys the toxins — only consume cooked, ripe berries. Strip stems carefully.$$,
       preparation_methods = array['cooked','jam','jelly','syrup','wine','tea']
 where scientific_name = 'Sambucus canadensis'
   and usage_notes is null;

-- Prunus serotina (black cherry) — Prunus toxicity caveat.
update public.species
   set usage_notes = $$Small dark purple-black wild cherries, ripening in late summer. Too astringent for most people fresh, but excellent for jelly, syrup, wine, and cordial. The bark is the source of traditional cherry-flavored cough syrups.$$,
       harvest_tips = $$Pick when fruit is fully dark and easily detaches. Birds compete fiercely once color appears. A sheet under the tree catches drops as you shake or pick.$$,
       toxicity_notes = $$Eat only the flesh. Pits, leaves (especially wilted), and bark contain cyanogenic glycosides — wilted leaves are a known cause of livestock poisoning. Don't crush pits or chew on twigs.$$,
       preparation_methods = array['jelly','syrup','wine','cordial']
 where scientific_name = 'Prunus serotina'
   and usage_notes is null;

-- Prunus virginiana (chokecherry).
update public.species
   set usage_notes = $$Astringent dark red-to-black wild cherry, used historically by Native Americans dried or pounded into pemmican. Modern uses: jelly, syrup, wine, fruit leather. Very astringent fresh — cooking and sweetening transforms it.$$,
       harvest_tips = $$Pick when fully dark and slightly soft. Strip clusters from the bush. Fully ripe fruit is the only acceptable harvest.$$,
       toxicity_notes = $$Like all Prunus, the pits, leaves, and bark contain cyanogenic glycosides. Eat only the flesh; don't crush pits when extracting juice.$$,
       preparation_methods = array['jelly','syrup','wine','dried']
 where scientific_name = 'Prunus virginiana'
   and usage_notes is null;

-- Prunus pumila (sand cherry).
update public.species
   set usage_notes = $$Small dark purple-black cherries on a low shrub, native to dunes, sandy soils, and lake shores. Flavor varies tree to tree from sweet to astringent. Eaten fresh from the best plants, or used for jam and jelly.$$,
       harvest_tips = $$Pick when fully dark and yielding to gentle pressure. Taste-test individual plants — wild populations are genetically variable. Low growth makes hand-picking easy.$$,
       toxicity_notes = $$Same Prunus caveats: don't eat pits, leaves, or bark. Flesh is safe.$$,
       preparation_methods = array['raw','jam','jelly']
 where scientific_name = 'Prunus pumila'
   and usage_notes is null;

-- Prunus americana (American plum).
update public.species
   set usage_notes = $$Small yellow-to-red wild plums with a tart, plummy flavor, ripening in late summer. Eaten fresh from the better trees, or made into jam, jelly, and wine. Skin is tart, flesh is sweet — many people prefer them cooked.$$,
       harvest_tips = $$Pick when fruit is fully colored and yields to gentle pressure. The thicket-forming habit means a single colony can produce abundantly. Some trees produce sweeter fruit than others — taste before harvesting in quantity.$$,
       toxicity_notes = $$Flesh is safe. Pits, leaves, and bark contain cyanogenic glycosides — same Prunus caveats apply.$$,
       preparation_methods = array['raw','jam','jelly','wine','dried']
 where scientific_name = 'Prunus americana'
   and usage_notes is null;

-- Prunus dulcis (almond).
update public.species
   set usage_notes = $$Cultivated sweet almonds — the kernel is the edible part, harvested in fall from inside a leathery green hull. Eaten raw, roasted, ground into flour, or pressed for oil and almond milk.$$,
       harvest_tips = $$Pick when hulls split open. Cure briefly in a dry place, then crack the woody shell to release the kernel.$$,
       toxicity_notes = $$Cultivated sweet almonds are safe. WILD or BITTER almonds (var. amara) contain dangerous quantities of amygdalin and can be lethal — never eat almonds from a tree of unknown variety. Even sweet almond varieties contain trace amygdalin in unprocessed form; commercial almonds are heat-treated to deactivate it.$$,
       preparation_methods = array['raw','roasted','flour','oil','candied']
 where scientific_name = 'Prunus dulcis'
   and usage_notes is null;

-- Vaccinium — blueberries.
update public.species
   set usage_notes = $$Sweet blue-to-black berries, ripe in summer. Lowbush (V. angustifolium) produces small intensely flavored fruit on knee-high plants in acidic soils; highbush (V. corymbosum) produces larger fruit on shoulder-height shrubs in damp areas. Eaten raw, baked, in jam, dried, or fermented.$$,
       harvest_tips = $$Pick when berries are fully blue (no pink shoulders) and detach with the slightest touch. Hand-picking is best; rake harvesting is faster but bruises fruit. Lowbush is often best on burned or recently disturbed land.$$,
       toxicity_notes = $$No known toxicity. Look-alikes are minimal in the lowbush habitat; highbush is unmistakable.$$,
       preparation_methods = array['raw','baked','jam','dried','wine','sauce']
 where scientific_name in ('Vaccinium angustifolium','Vaccinium corymbosum')
   and usage_notes is null;

-- Ribes — currants.
update public.species
   set usage_notes = $$Clusters of small translucent red currants with a bright tart flavor — too sour for most people fresh, but exceptional in jelly, syrup, sauce, and cordial. Traditional companion to game meats.$$,
       harvest_tips = $$Strip whole strigs when berries are fully red and slightly translucent. Mid-summer harvest. Easier than picking individual berries.$$,
       toxicity_notes = $$No known toxicity in the fruit. Note: cultivation of Ribes is restricted or banned in some US states because they host white pine blister rust — check local regulations if you're considering planting.$$,
       preparation_methods = array['jelly','syrup','sauce','wine','jam']
 where scientific_name = 'Ribes rubrum'
   and usage_notes is null;

update public.species
   set usage_notes = $$Small dark purple-black currants with a strong, musky-sweet flavor — distinctive and divisive. Used for jam, jelly, syrup, cassis liqueur, and fruit leather. High in vitamin C.$$,
       harvest_tips = $$Strip strigs when berries are fully black and slightly soft. Mid-to-late summer. The leaves and bushes have a strong musky scent that some people dislike.$$,
       toxicity_notes = $$No known toxicity in the fruit. Same Ribes restrictions in some US states (white pine blister rust host).$$,
       preparation_methods = array['jam','jelly','syrup','wine','dried']
 where scientific_name = 'Ribes nigrum'
   and usage_notes is null;

-- Rubus — raspberries, blackberries, wineberry.
update public.species
   set usage_notes = $$Sweet-tart red raspberries, ripening in early-to-mid summer (and again in fall for ever-bearing varieties). Eaten raw straight from the cane, or used in jam, baking, and infused vinegars. Hollow when picked — that's the ripeness signal.$$,
       harvest_tips = $$Pick when berries pull off the receptacle cleanly with a hollow center — if the receptacle comes with the berry, it's not ripe. Wear long sleeves; canes are well-armed. Check daily during peak; ripe berries last about a day on the cane.$$,
       toxicity_notes = $$No known toxicity. Leaves are traditionally used for tea (raspberry leaf), generally regarded as safe.$$,
       preparation_methods = array['raw','jam','baked','syrup','tea','wine']
 where scientific_name = 'Rubus idaeus'
   and usage_notes is null;

update public.species
   set usage_notes = $$Black raspberries with a deep, slightly more complex flavor than red raspberries. Ripen in early-to-mid summer. Eaten raw, in jam, pies, and cordials. Distinguished from blackberries by the hollow center when picked.$$,
       harvest_tips = $$Pick when fully black and the berry separates from the receptacle leaving a hollow. Sometimes prickly; gloves help. Birds compete heavily — visit daily during peak.$$,
       toxicity_notes = $$No known toxicity.$$,
       preparation_methods = array['raw','jam','pie','syrup','wine']
 where scientific_name = 'Rubus occidentalis'
   and usage_notes is null;

update public.species
   set usage_notes = $$Wild blackberries — clusters of glossy black aggregate drupelets on long arching canes, ripe mid-to-late summer. Eaten raw, in cobblers, jam, jelly, wine, and cordials. The receptacle stays in the berry when picked, distinguishing blackberry from black raspberry.$$,
       harvest_tips = $$Pick when berries are fully glossy black and detach with the slightest pull — under-ripe berries are red or purple and tart. Wear sturdy clothes; thorns are aggressive. Best berries are often deep in the thicket.$$,
       toxicity_notes = $$No known toxicity.$$,
       preparation_methods = array['raw','jam','pie','wine','syrup']
 where scientific_name = 'Rubus allegheniensis'
   and usage_notes is null;

update public.species
   set usage_notes = $$Wineberry — a Japanese raspberry relative, invasive in much of the eastern US. Bright red translucent berries with a sticky, sweet-tart flavor, ripe in early-to-mid summer. Foraging is encouraged as ecological control. Used raw, in jam, pies, and fruit cordials.$$,
       harvest_tips = $$Distinctive bright red bristly canes make wineberry easy to spot year-round. Pick when berries are fully red and detach cleanly. Sticky resin coats the unripe fruit cluster — once that's gone, the berries below are ready.$$,
       toxicity_notes = $$No known toxicity.$$,
       preparation_methods = array['raw','jam','pie','syrup']
 where scientific_name = 'Rubus phoenicolasius'
   and usage_notes is null;

-- Vitis riparia (riverbank grape) — important moonseed lookalike caveat.
update public.species
   set usage_notes = $$Wild grape — small dark purple grapes in clusters, ripe in fall. Tart and seedy fresh; excellent for jelly, juice, wine, and traditional grape leaves. Leaves harvested in late spring for stuffed grape leaves (dolmades).$$,
       harvest_tips = $$Pick clusters when grapes are fully dark and slightly soft. Look for the characteristic tendrils opposite the leaves — true grape vines have these; the toxic look-alike moonseed does not. Each grape has 2–4 small seeds.$$,
       toxicity_notes = $$Critical look-alike: moonseed (Menispermum canadense) has dark fruit superficially similar to wild grape but is HIGHLY TOXIC. Distinguishing features: moonseed has a single crescent-moon-shaped seed (vs grape's 2–4 round seeds), no tendrils, and leaves attach to the petiole near the leaf edge rather than being deeply lobed. Cut a few berries open before eating any wild grape to confirm.$$,
       preparation_methods = array['jelly','wine','juice','raw']
 where scientific_name = 'Vitis riparia'
   and usage_notes is null;

-- Allium tricoccum (ramps) — critical lily-of-the-valley lookalike.
update public.species
   set usage_notes = $$Wild leek with a strong garlic-onion flavor, prized in spring foraging. Both leaves and bulbs are edible — used raw, sauteed, pickled, in soups, or as pesto. Limited harvest window: early-to-mid spring before the tree canopy closes.$$,
       harvest_tips = $$Look on rich north-facing forest slopes in early spring. Smell-test: ramps smell strongly of garlic-onion when a leaf is crushed; this is THE definitive ID feature. Take only a few leaves per plant (or harvest no more than 5–10% of a patch) — ramp populations are slow to recover from overharvesting.$$,
       toxicity_notes = $$CRITICAL look-alike: lily of the valley (Convallaria majalis), false hellebore (Veratrum viride), and trout lily can resemble ramps in early spring and are toxic to varying degrees. The garlic-onion smell is the single most reliable ID — if a crushed leaf doesn't smell strongly of onion, do not eat it. Lily of the valley has no smell; false hellebore has pleated leaves.$$,
       preparation_methods = array['raw','cooked','pickled','pesto']
 where scientific_name = 'Allium tricoccum'
   and usage_notes is null;

-- Asparagus officinalis (wild asparagus).
update public.species
   set usage_notes = $$Wild asparagus — escaped from cultivation, found along old fence rows, ditches, and abandoned gardens. Spring shoots are picked young and tender, used the same as cultivated asparagus: steamed, grilled, sauteed, or in salads.$$,
       harvest_tips = $$Look for the previous year's tall, ferny dead stalks in late winter — fresh shoots emerge nearby in spring. Pick spears at 6–8 inches, snapping them off at ground level. Return every 2–3 days during the harvest window for repeat shoots from the same crown. Don't take all spears from one plant — leave some to feed the crown.$$,
       toxicity_notes = $$Spears and stalks are safe. The red berries on female plants in fall are mildly toxic — don't eat them.$$,
       preparation_methods = array['raw','cooked','pickled']
 where scientific_name = 'Asparagus officinalis'
   and usage_notes is null;

-- Mentha (mint) — generic genus entry.
update public.species
   set usage_notes = $$Wild mints (multiple species in the genus) have leaves with the familiar cool, aromatic flavor, used for tea, infusions, garnishes, and flavoring. Most foraging encounters are with naturalized peppermint, spearmint, or wild bergamot relatives.$$,
       harvest_tips = $$Pick fresh leaves and tender stems anytime during the growing season. Best flavor is just before flowering. Crush a leaf and smell — true mints have an unmistakable aromatic profile. Found near streams, in damp meadows, and as garden escapes.$$,
       toxicity_notes = $$Most common Mentha species are safe in normal culinary quantities. Pennyroyal (Mentha pulegium) is more potent and contains pulegone — small culinary amounts are traditional but should be avoided in pregnancy and large doses.$$,
       preparation_methods = array['raw','tea','infusion']
 where scientific_name = 'Mentha'
   and usage_notes is null;

-- Cantharellus cibarius (chanterelle) — critical lookalike.
update public.species
   set usage_notes = $$Golden funnel-shaped mushroom with a fruity, apricot-like aroma. Sauteed in butter is the classic preparation; also dried, pickled, or added to soups, sauces, and risottos. Late summer to fall, in oak and hardwood forests.$$,
       harvest_tips = $$Look for solid, fleshy golden funnels with FALSE GILLS — shallow forked ridges that run down the stem rather than true blade-like gills. Fruity-apricot smell is a strong positive signal. Cut at the base rather than pulling, to leave the mycelium intact.$$,
       toxicity_notes = $$CRITICAL look-alikes: jack-o'-lantern mushroom (Omphalotus illudens, glows in the dark, true blade gills, grows on wood — toxic, causes severe GI distress) and false chanterelle (Hygrophoropsis aurantiaca, forked true gills, less fleshy, generally inedible). Always confirm chanterelle ID by FALSE GILLS, fruity smell, and ground-fruiting habit. When in doubt, do not eat any wild mushroom — verify with an experienced mycologist.$$,
       preparation_methods = array['cooked','dried','pickled']
 where scientific_name = 'Cantharellus cibarius'
   and usage_notes is null;

-- Morchella esculenta (morel) — must-cook + false morel caveat.
update public.species
   set usage_notes = $$Honeycomb-capped spring mushroom, prized in haute cuisine. Always cooked — sauteed in butter, in cream sauces, stuffed, or dried for later use. Very short fruiting season (typically late April through May in temperate North America), often near recently dead elms, ash, or in burned areas.$$,
       harvest_tips = $$Slice morels in half lengthwise — TRUE morels are completely hollow from cap to base. Cap pits are honeycomb-like, irregular, and continuous with the stem. Best in disturbed soil: old apple orchards, recently burned areas, ash and elm groves where trees have died in the last 1–3 years. Brush off debris; soak briefly in salt water if buggy.$$,
       toxicity_notes = $$Always cook morels thoroughly — raw morels contain hydrazines that cause GI distress, and even cooked morels can cause reactions in some people, especially when paired with alcohol. CRITICAL look-alike: false morels (Gyromitra esculenta and relatives) have brain-like, lobed caps (not honeycombed pits) and are NOT hollow when sliced — they contain gyromitrin which can be lethal. The hollow-vs-stuffed test is the single most reliable ID feature.$$,
       preparation_methods = array['cooked','dried']
 where scientific_name = 'Morchella esculenta'
   and usage_notes is null;
