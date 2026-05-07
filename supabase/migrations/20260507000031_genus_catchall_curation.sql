-- Generic prose for the genus-level catch-all species rows
-- (Rubus sp., Cornus sp., Carya sp., etc.). These are inserted by
-- import scripts when a tree's species can't be pinned more
-- specifically — common in city tree inventories where the entry is
-- just "Cherry/Plum (unspecified)". They had no individual Wikipedia
-- entry to draw from in migration 30, so the prose stayed empty.
--
-- The prose here describes what's *consistent* across the genus —
-- general fruit/nut character, harvest signs, and any cross-species
-- cautions (Prunus pits, Juglans juglone, horse-chestnut confusion).
-- Each entry leads with "Genus including ..." so users immediately
-- understand they're looking at an aggregate row, not a single
-- identified species.
--
-- Idempotent gate as before: only fills rows where usage_notes is null.

update public.species set
  usage_notes = $$Genus of small native trees and shrubs producing dark purple-blue fruits in early summer (often called serviceberries, juneberries, or shadbush). Sweet, almond-noted, blueberry-like flavor. Common uses across all species: raw, in pies, jam, jelly.$$,
  harvest_tips = $$Pick when fully purple-black and slightly soft. Most species ripen May-July. Distinguish from blueberry by the apple-like 5-point star at the bottom of each fruit.$$,
  toxicity_notes = $$$$,
  preparation_methods = array['raw','jam','jelly','baked','wine']
 where scientific_name = 'Amelanchier sp.' and usage_notes is null;

update public.species set
  usage_notes = $$Genus of large North American nut trees including pecan, shagbark, and shellbark hickory. All produce hard-shelled nuts in fall, with kernels ranging from intensely rich and sweet (shagbark, pecan) to bitter (bitternut, mockernut).$$,
  harvest_tips = $$Husks split and drop nuts in fall. Wear gloves — green husks stain. Cure shelled nuts 1-2 weeks before cracking. A mallet or hickory cracker is needed; the shells are notoriously hard.$$,
  toxicity_notes = $$A few hickory species (bitternut, mockernut) are too bitter to eat — identification matters before processing a large batch.$$,
  preparation_methods = array['raw','baked','cooked']
 where scientific_name = 'Carya sp.' and usage_notes is null;

update public.species set
  usage_notes = $$Trees producing edible nuts in spiny burrs that split and drop in fall. American (now nearly extinct from blight), European, Chinese, and Japanese chestnuts all produce sweet, starchy nuts traditionally roasted, boiled, or ground into flour.$$,
  harvest_tips = $$Wait for burrs to drop and split open — wear thick gloves; the spines are sharp. Score and roast within 1-2 weeks for best flavor; nuts spoil quickly compared to other tree nuts.$$,
  toxicity_notes = $$Do not confuse with horse chestnut (Aesculus), which is unrelated and toxic. True chestnuts have spiny burrs with multiple nuts; horse chestnuts have a smoother spiny husk with usually one nut.$$,
  preparation_methods = array['cooked','baked','flour']
 where scientific_name = 'Castanea sp.' and usage_notes is null;

update public.species set
  usage_notes = $$Cornus mas and the closely related C. officinalis (Japanese cornelian cherry) produce tart-sweet bright red drupes — technically a cherry-like fruit, not a true cherry — ripening in late summer. Used for jam, jelly, syrup, wine, and Eastern European cordials.$$,
  harvest_tips = $$Pick when fully red-to-burgundy and slightly soft; can shake branches over a tarp. Cook with sugar to balance acidity.$$,
  toxicity_notes = $$Only the cornelian-cherry-type Cornus species (C. mas, C. officinalis) are foraged for fruit. Most other Cornus species (flowering dogwood, etc.) bear non-edible fruit — confirm species before eating.$$,
  preparation_methods = array['jam','jelly','syrup','wine','cooked']
 where scientific_name = 'Cornus sp.' and usage_notes is null;

update public.species set
  usage_notes = $$Shrubs and small trees producing small round nuts in leafy husks (involucres). All Corylus species are edible and similar in character — sweet, oily, classic hazelnut flavor.$$,
  harvest_tips = $$Pick in late summer to early fall when husks brown and nuts come out easily. Squirrels compete heavily — visit daily during peak. Cure shelled nuts a few weeks before cracking.$$,
  toxicity_notes = $$$$,
  preparation_methods = array['raw','cooked','baked']
 where scientific_name = 'Corylus sp.' and usage_notes is null;

update public.species set
  usage_notes = $$Genus of large nut trees including English walnut (J. regia), black walnut (J. nigra), and butternut (J. cinerea). All produce nuts in green husks that ripen and drop in fall. Black walnut has the strongest, smokiest flavor; English walnut is mildest.$$,
  harvest_tips = $$Collect from the ground in autumn. Wear gloves — husks stain skin and clothing dark brown for weeks. Remove husks promptly; husks left to dry on the nut darken the kernel. Cure 3-4 weeks before cracking.$$,
  toxicity_notes = $$Husks and roots release juglone, an allelopathic chemical toxic to many garden plants. Not toxic to humans.$$,
  preparation_methods = array['raw','cooked','baked','wine']
 where scientific_name = 'Juglans sp.' and usage_notes is null;

update public.species set
  usage_notes = $$Genus including peaches, plums, cherries, almonds, and many wild stone fruits. Common foragers' targets are wild plums, black cherry, chokecherry, and beach plum — all stone fruits ripening in late summer. Most are too astringent for raw eating but excellent for jelly, jam, syrup, or wine.$$,
  harvest_tips = $$Pick when fully colored and slightly soft. Beware: chokecherry and black cherry are too astringent for fresh eating; preserve with sugar.$$,
  toxicity_notes = $$Pits, leaves, and twigs contain cyanogenic glycosides. Do not crush, chew, or steep pits. The flesh is safe; strain pits before use.$$,
  preparation_methods = array['jam','jelly','syrup','wine','cooked']
 where scientific_name = 'Prunus sp.' and usage_notes is null;

update public.species set
  usage_notes = $$Genus of brambles including raspberries, blackberries, dewberries, salmonberries, thimbleberries, and wineberries. Compound fruits of small drupelets. Eaten raw, in jam, baked goods, wine; raspberry leaf is also brewed for tea.$$,
  harvest_tips = $$Pick when fully colored and the fruit detaches easily from the receptacle. Raspberries leave a hollow center when picked; blackberries pull off with the white core attached. Birds compete heavily — visit daily during peak.$$,
  toxicity_notes = $$$$,
  preparation_methods = array['raw','jam','jelly','wine','baked','tea']
 where scientific_name = 'Rubus sp.' and usage_notes is null;

update public.species set
  usage_notes = $$Genus including blueberries, huckleberries, cranberries, lingonberries, and bilberries. Small dark berries with sweet-tart flavor, varying intensity by species. Eaten raw, in jam, pies, syrups, dried.$$,
  harvest_tips = $$Pick when fully colored (blue, purple, red, or black depending on species) and slightly soft. Cranberries and lingonberries persist into winter; blueberries and huckleberries best in summer.$$,
  toxicity_notes = $$$$,
  preparation_methods = array['raw','jam','jelly','baked','dried']
 where scientific_name = 'Vaccinium sp.' and usage_notes is null;

update public.species set
  usage_notes = $$Genus of thorny climbing vines. Spring shoots are the foragers' target — tender, asparagus-like, mild flavor. Several species (S. herbacea, S. hispida, S. rotundifolia) commonly used.$$,
  harvest_tips = $$Cut tender new shoots in spring before they harden — the tender stage lasts only a couple of weeks. Older growth is tough and viciously thorny.$$,
  toxicity_notes = $$$$,
  preparation_methods = array['cooked','pickle']
 where scientific_name = 'Smilax sp.' and usage_notes is null;
