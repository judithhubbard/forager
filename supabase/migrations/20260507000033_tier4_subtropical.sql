-- Tier 4: subtropical, Mediterranean, and tropical edibles. Closes
-- the climate gap left by Tiers 1-3 (which were Northeast-temperate).
-- San Diego's tree inventory alone has ~10,000 public pins of
-- edibles we couldn't match against the prior 109-species catalog;
-- Phoenix, LA, Miami, Tampa, New Orleans, Honolulu have similar
-- gaps.
--
-- Inclusion principles (same as earlier tiers):
-- - Add when the species is widely planted in cities + has clear,
--   low-confusion edibility.
-- - Add usage_notes / harvest_tips / toxicity_notes / preparation_methods
--   inline (no separate curation migration).
-- - Add interest_tags so the welcome flow can offer them as part of
--   "Tree fruit" or another existing group — no new groups needed.
--
-- Deliberate omissions:
-- - Ornamental Ficus (F. microcarpa, F. macrophylla, F. rubiginosa):
--   technically edible but produce inferior fruit; risks foragers
--   confusing them with F. carica.
-- - Schinus terebinthifolia (Brazilian pepper): FDA has issued
--   caution; sensitive individuals get GI / dermatitis. S. molle
--   covers the "pink peppercorn" use-case more safely.
-- - Eucalyptus, oleander, camphor, sweetgum: not human-edible.
-- - Yucca baccata: SW desert specialty; flowers covered by Y. filamentosa.

-- ---- Tier 4A: Citrus + Mediterranean / fruit-bearing landscape ----

insert into public.species (scientific_name, common_name, aliases, forage_parts, safety_notes, interest_tags, usage_notes, harvest_tips, toxicity_notes, preparation_methods) values

  ('Citrus sinensis', 'Sweet orange',
    array['orange', 'navel orange', 'Valencia orange'], array['fruit'],
    '', array['tree_fruit'],
    $$The familiar sweet orange — fresh-eating fruit, juice, marmalade, candied peel. Trees produce heavily and bear fruit through winter into spring in mild climates. Mature city trees often go un-harvested for years.$$,
    $$Pick when fully colored and slightly soft to the touch. Citrus does not ripen further off the tree — pick when sweet on the tree. Confirm the tree is unsprayed (often street trees are not) and not overhanging private property.$$, $$$$,
    array['raw', 'baked', 'jam', 'jelly', 'pickle']),

  ('Citrus limon', 'Lemon',
    array['Eureka lemon', 'Meyer lemon (subset)'], array['fruit'],
    '', array['tree_fruit'],
    $$Common landscape and street tree in subtropical cities. Acidic juice and oily peel. Indispensable for cooking, preserves, drinks. Heavy croppers; mature trees produce hundreds of fruit a year.$$,
    $$Pick when fully yellow and slightly soft. Some varieties color before peak juice — squeeze test if uncertain. Use peel zest immediately or freeze; juice freezes well in ice cube trays.$$, $$$$,
    array['raw', 'baked', 'jam', 'jelly', 'pickle', 'syrup']),

  ('Citrus reticulata', 'Mandarin orange',
    array['mandarin', 'tangerine', 'satsuma', 'clementine'], array['fruit'],
    '', array['tree_fruit'],
    $$Loose-skinned, easy-peeling oranges; sweeter than navel oranges. Several cultivar groups (mandarin, tangerine, satsuma, clementine) all share the loose-peel character.$$,
    $$Pick when fully colored and easily detached with a slight twist. Best fresh; juice quickly loses character.$$, $$$$,
    array['raw', 'baked', 'jam']),

  ('Citrus paradisi', 'Grapefruit',
    array[]::text[], array['fruit'],
    '', array['tree_fruit'],
    $$Large, bitter-sweet citrus. Pink/ruby varieties sweeter than yellow. Used fresh, juiced, in segments. Very heavy croppers — common around mid-century homes in Florida and California.$$,
    $$Pick when fully colored and somewhat heavy for size. Fruit can stay on the tree for months and only sweeten further.$$,
    $$Grapefruit interacts with several common medications (statins, calcium channel blockers, some antihistamines). Check with a pharmacist if you take prescription drugs.$$,
    array['raw', 'jam', 'jelly']),

  ('Citrus aurantium', 'Sour orange',
    array['Seville orange', 'bitter orange'], array['fruit'],
    '', array['tree_fruit'],
    $$Inedibly sour as fresh fruit but the only orange traditionally used for British marmalade. Common Mediterranean street tree (the "Seville oranges" of the city of Seville). Peel and pulp both used.$$,
    $$Harvest in winter when fully colored. The bitter peel is the prize — needed for proper marmalade. Trees often heavily fruited and entirely uneaten.$$, $$$$,
    array['jam', 'jelly', 'pickle']),

  ('Citrus medica', 'Citron',
    array[]::text[], array['fruit'],
    '', array['tree_fruit'],
    $$Among the oldest cultivated citrus. Mostly thick fragrant peel, very little flesh. Used for candied peel, in confiture, and in Jewish ritual (etrog). Two main forms: lemon-shaped (etrog) and Buddha's-hand (fingered).$$,
    $$Harvest when fully colored and firm. The peel is the food — pulp is incidental. Slice and candy the peel in syrup.$$, $$$$,
    array['pickle', 'jam']),

  ('Fortunella japonica', 'Kumquat',
    array['Citrus japonica', 'round kumquat'], array['fruit'],
    '', array['tree_fruit'],
    $$Small thumb-sized citrus eaten whole — the sweet peel and tart pulp combine in one bite. Common landscape shrub. Several closely related cultivars (Nagami, Marumi, Meiwa) — all foraged similarly.$$,
    $$Pick when fully orange and slightly soft. Eat whole or use to make marmalade, brandy infusion, or candied syrup.$$, $$$$,
    array['raw', 'jam', 'jelly', 'pickle']),

  ('Citrus sp.', 'Citrus (unspecified)',
    array['citrus'], array['fruit'],
    '', array['tree_fruit'],
    $$Genus including sweet orange, lemon, mandarin, grapefruit, citron, sour orange, kumquat, and many hybrids. Cities often inventory only by genus when cultivar is unknown. All Citrus species are edible; specific use depends on flavor (sweet vs. sour).$$,
    $$Identify by leaf, flower fragrance, and fruit shape; smell the leaves of an unknown tree to confirm citrus. Pick when fully colored — citrus does not ripen further off the tree.$$, $$$$,
    array['raw', 'baked', 'jam', 'jelly']),

  ('Persea americana', 'Avocado',
    array['alligator pear', 'aguacate'], array['fruit'],
    '', array['tree_fruit'],
    $$The familiar buttery green-fleshed fruit. Hass and Fuerte are the dominant California cultivars; Florida grows watery thin-skinned tropical varieties. Trees common in older California yards and as street trees.$$,
    $$Avocados ripen OFF the tree, never on it — pick when full-sized but firm, then ripen at room temperature 3-7 days. Mature tree fruit can sit unripe for weeks. Ground-fall avocados are usually overripe.$$,
    $$Pits and skin contain persin, toxic to birds and dogs. Edible flesh is fine for humans.$$,
    array['raw']),

  ('Olea europaea', 'Olive',
    array['common olive'], array['fruit'],
    'Fresh fruit is inedibly bitter — must be cured before eating.', array['tree_fruit'],
    $$Mediterranean tree widely planted in California/Arizona/Texas as ornamentals (often unfruited "fruitless" cultivars, but many fruit heavily). The fresh fruit is intensely bitter from oleuropein and inedible — curing in salt brine, lye, or repeated water changes over weeks transforms it into edible olives.$$,
    $$Pick green olives in fall for crisp brine-cured product, or wait for fully black ones for richer Mediterranean-style cures. Process within a day of picking; freshly fallen olives bruise quickly.$$,
    $$Curing is mandatory — DO NOT eat fresh olives. Several proven recipes; lye-cure is fastest, brine-cure is safest for beginners.$$,
    array['pickle']),

  ('Ficus carica', 'Common fig',
    array['fig'], array['fruit'],
    '', array['tree_fruit'],
    $$The edible fig — distinct from ornamental Ficus species (F. microcarpa, F. macrophylla, etc.) which produce inedible or inferior fruit. Common naturalized escape from cultivation; often along roads, fences, abandoned lots.$$,
    $$Fully ripe figs droop on their stems, soften considerably, and may show a tear or "drop of nectar" at the bottom. Pick gently — flesh tears easily. Most varieties bear two crops: a small breba crop in summer and a heavier main crop in fall.$$,
    $$Latex sap from unripe fruit and from leaves can cause skin irritation in sensitive individuals — wash hands after picking.$$,
    array['raw', 'jam', 'baked', 'dried', 'wine']),

  ('Punica granatum', 'Pomegranate',
    array[]::text[], array['fruit'],
    '', array['tree_fruit'],
    $$Drought-tolerant ornamental shrub or small tree, common in California and Arizona. Tough leathery skin; juicy seed-arils inside. Eaten fresh or juiced for the bright red-pink juice.$$,
    $$Pick when fully colored, slightly squared in shape (rounded fruit is unripe), and the skin is leathery rather than smooth. Score the skin in quarters and crack open underwater to keep arils from staining clothes.$$, $$$$,
    array['raw', 'jam', 'jelly', 'syrup']),

  ('Eriobotrya japonica', 'Loquat',
    array['Japanese plum', 'Japanese medlar'], array['fruit'],
    '', array['tree_fruit'],
    $$Evergreen tree producing clusters of small yellow-orange plum-like fruit in spring (one of the earliest fruits of the year in California). Mildly sweet-tart with a few large stones. Common landscape tree in CA, FL, TX.$$,
    $$Pick when fully golden-orange and slightly soft; some varieties have an orange blush. The fruit ripens slowly over weeks; visit the same tree multiple times. Easy to bruise — pick gently.$$,
    $$Pits contain cyanogenic compounds. Do not crush, chew, or steep them.$$,
    array['raw', 'jam', 'jelly', 'wine', 'baked']),

  ('Diospyros kaki', 'Japanese persimmon',
    array['kaki', 'fuyu', 'hachiya'], array['fruit'],
    '', array['tree_fruit'],
    $$Native to East Asia; widely planted ornamental and fruit tree in California. Two main types: Fuyu (eat firm, like an apple) and Hachiya (must be fully soft — astringent until then). Late-season fruit, often persisting on bare branches into winter.$$,
    $$Fuyu types: pick when orange and firm, like a tomato. Hachiya: pick when fully soft, almost jelly-like — eating one before this stage delivers an unforgettable mouth-puckering tannic experience. Both ripen further off the tree.$$,
    $$Astringent (unripe Hachiya) types must be fully soft before eating. The astringency is harmless but profoundly unpleasant.$$,
    array['raw', 'baked', 'dried', 'jam']),

  ('Ceratonia siliqua', 'Carob',
    array['locust bean', 'St. John''s bread'], array['fruit'],
    '', array['tree_fruit'],
    $$Mediterranean evergreen tree producing long flat leathery brown pods. Sweet pulp around hard seeds is the food — ground for chocolate-substitute powder, eaten as snack pods, or used in syrup. Common drought-tolerant street tree in California.$$,
    $$Pods drop in late summer to fall when fully brown and leathery. Crack to chew the pulp; remove the very hard seeds. Pulp can be ground into carob powder once dried.$$, $$$$,
    array['raw', 'flour', 'syrup', 'baked']),

  ('Laurus nobilis', 'Bay laurel',
    array['true laurel', 'sweet bay', 'bay leaf'], array['leaf'],
    '', array['flower_aromatic'],
    $$The classical Mediterranean bay tree — the actual culinary "bay leaf" of European cooking. Common in California gardens; not the same as California bay laurel (Umbellularia californica), which is much more strongly flavored.$$,
    $$Pick mature dark-green leaves any time of year. Dry on a screen for a few days before storing — fresh leaves have a sharper, almost menthol note.$$,
    $$Confirm Laurus nobilis vs Umbellularia californica (California bay): Umbellularia leaves are much more strongly aromatic — overpowering in cooking — and the trees are much larger. Both are technically edible; quantities differ.$$,
    array['cooked', 'tea', 'dried']),

  ('Phoenix dactylifera', 'Date palm',
    array['true date', 'medjool date palm'], array['fruit'],
    '', array['tree_fruit'],
    $$The commercial date palm — same species that produces medjool, deglet noor, and other commercial dates. Common in California and Arizona desert landscaping. Often heavy with fruit late summer/fall but rarely picked.$$,
    $$Pick when fruit is fully colored (yellow-amber-brown depending on variety) and partially shriveled. Several ripening stages: khalal (firm yellow), rutab (softening, half ripe), and tamar (fully soft, brown, the typical sold date). Use whichever stage matches your variety.$$, $$$$,
    array['raw', 'cooked', 'baked', 'dried']),

  ('Phoenix canariensis', 'Canary Island date palm',
    array['Canary palm'], array['fruit'],
    '', array['tree_fruit'],
    $$Massive ornamental palm with a stout trunk. Produces small (~2 cm) date-like fruit — edible but with a fibrous flesh and a much larger pit-to-flesh ratio than commercial dates. Foraged opportunistically; rarely commercially produced.$$,
    $$Pick mid-fall to early winter when fruit is fully amber-orange and slightly soft. Test flavor first — some specimens are too fibrous or astringent to be worth processing.$$, $$$$,
    array['raw', 'jam', 'cooked']),

  ('Phoenix sp.', 'Date palm (unspecified)',
    array['date palm'], array['fruit'],
    '', array['tree_fruit'],
    $$Genus of palms. P. dactylifera (true date palm) and P. canariensis (Canary Island date palm) are common ornamentals — both produce edible fruit, though canariensis is much smaller and more fibrous. Other Phoenix species (P. roebelenii, pygmy date palm) bear small unpalatable fruit.$$,
    $$Identify by trunk and frond — true date palms have stout trunks with diamond-pattern leaf scars; canariensis is similar but with bigger crowns. Pick fruit when fully colored.$$, $$$$,
    array['raw', 'cooked', 'jam', 'dried']),

  ('Opuntia ficus-indica', 'Prickly pear',
    array['Indian fig', 'tuna', 'nopal'], array['fruit', 'shoot'],
    '', array['tree_fruit'],
    $$Cactus widely naturalized in the Southwest and along the Mediterranean. Both the magenta-purple fruit (tuna) and the young paddles (nopales) are eaten — tuna fresh or as juice; nopales grilled, sliced into salads, or stewed.$$,
    $$Wear thick gloves and use long tongs. Fruit: pick when fully colored and slightly soft, then carefully scrape or burn off the tiny glochid hairs (worse than the bigger spines). Paddles: pick young pads (under 8 inches) in spring; remove glochids by scraping with a knife. Cooking eliminates remaining hair risk.$$,
    $$Glochids — tiny barbed hairs at each spine cluster — are far more dangerous than the visible thorns. Sight-flame the fruit briefly with a torch or scrub vigorously under water before handling bare-handed.$$,
    array['raw', 'cooked', 'jam', 'jelly', 'syrup']);

-- ---- Tier 4B: Florida / Gulf / Hawaii / true tropical ----

insert into public.species (scientific_name, common_name, aliases, forage_parts, safety_notes, interest_tags, usage_notes, harvest_tips, toxicity_notes, preparation_methods) values

  ('Mangifera indica', 'Mango',
    array[]::text[], array['fruit'],
    '', array['tree_fruit'],
    $$Tropical fruit tree common in Florida, Hawaii, Southern California (warmer microclimates). Many cultivars; flesh ranges from fibrous to silky.$$,
    $$Pick when fully colored, slightly soft, and aromatic at the stem end. Mangoes ripen further off the tree — pick mature-firm and finish at room temperature. Mind the latex sap from the stem cut.$$,
    $$Skin and sap contain urushiol-like compounds (related to poison ivy / poison oak). Sensitive individuals develop contact dermatitis from peeling. Wear gloves first time.$$,
    array['raw', 'cooked', 'pickle', 'jam', 'baked', 'dried']),

  ('Litchi chinensis', 'Lychee',
    array['litchi'], array['fruit'],
    '', array['tree_fruit'],
    $$Tropical fruit tree from southern China. Bumpy red-pink rind with translucent white flesh; fragrant, sweetly floral. Sometimes grown in southern Florida and southern California.$$,
    $$Pick whole clusters when fully red. Lychees do not ripen off the tree — pick at peak. Eat fresh; refrigerate briefly.$$,
    $$Unripe lychees and excessive consumption on empty stomach have been linked to hypoglycemic encephalopathy in undernourished children — rare but documented; eat ripe fruit in moderation.$$,
    array['raw']),

  ('Annona cherimola', 'Cherimoya',
    array['custard apple'], array['fruit'],
    '', array['tree_fruit'],
    $$Subtropical fruit tree from Andean South America. Large green heart-shaped fruit with creamy white flesh tasting of banana-pineapple-strawberry. Grown in Southern California.$$,
    $$Pick when slightly soft (yields to gentle pressure). Ripens quickly off the tree once cut from stem. Eat fresh — flesh oxidizes quickly.$$,
    $$Seeds and bark are toxic — do not chew or crush seeds.$$,
    array['raw']),

  ('Annona squamosa', 'Sugar apple',
    array['sweetsop'], array['fruit'],
    '', array['tree_fruit'],
    $$Tropical relative of cherimoya, grown in southern Florida and Hawaii. Lumpy green fruit; sweet white flesh with a custardy texture.$$,
    $$Fruit segments separate when fully ripe and easily come apart. Pick when starting to soften.$$,
    $$Same warning as cherimoya — seeds are toxic; do not crush or eat.$$,
    array['raw']),

  ('Psidium guajava', 'Common guava',
    array['guava'], array['fruit'],
    '', array['tree_fruit'],
    $$Tropical to subtropical fruit tree, naturalized in Florida, Hawaii, and southern California. Strongly fragrant fruit; many seeds, sweet pink or white flesh.$$,
    $$Pick when fully aromatic and slightly soft — quality drops fast once over-ripe. Best eaten fresh or quickly processed; very fragrant juice.$$, $$$$,
    array['raw', 'jam', 'jelly', 'syrup']),

  ('Acca sellowiana', 'Pineapple guava',
    array['feijoa', 'Feijoa sellowiana'], array['fruit', 'flower'],
    '', array['tree_fruit'],
    $$Hardy subtropical evergreen shrub, common landscape plant in California and Pacific Northwest mild zones. Egg-shaped green fruit with strongly perfumed flavor (pineapple-strawberry-mint). Petals also edible — sweet, with the same perfume.$$,
    $$Fruit drops when ripe — collect daily in late fall, before they ferment on the ground. Cut and scoop the soft flesh; rind is edible but bitter. Pick petals when flowers are fully open in late spring.$$, $$$$,
    array['raw', 'jam', 'jelly', 'wine', 'baked']),

  ('Casimiroa edulis', 'White sapote',
    array['casimiroa', 'Mexican apple'], array['fruit'],
    '', array['tree_fruit'],
    $$Mexican-origin tree grown in California. Large green fruit with sweet creamy yellow-white flesh; flavor described as banana-vanilla-pear. Heavy bearer.$$,
    $$Pick when slightly soft and the skin yellows from green; ripens further off the tree. Bruises easily — handle gently.$$,
    $$Seeds reportedly somewhat narcotic in quantity; do not eat. Some people get drowsy from large fruit consumption.$$,
    array['raw']),

  ('Eugenia uniflora', 'Surinam cherry',
    array['Pitanga', 'Brazilian cherry'], array['fruit'],
    '', array['tree_fruit'],
    $$Brazilian shrub naturalized in Florida and Hawaii; common hedge plant. Small ribbed cherry-like fruits ranging from yellow-orange to deep red-black. Flavor varies wildly by cultivar — from resinous to candy-sweet.$$,
    $$Pick when fully colored (varies by variety — taste-test red versus dark before harvesting in quantity). Thin oily skin makes them easily crushed; pick gently.$$, $$$$,
    array['raw', 'jam', 'jelly']),

  ('Carissa macrocarpa', 'Natal plum',
    array['amatungulu'], array['fruit'],
    '', array['tree_fruit'],
    $$South African coastal hedge shrub, very common in California, Florida, Hawaii. Bright red fruit with milky sap; cranberry-like tart-sweet flavor. Often un-foraged.$$,
    $$Pick when fully red. Mind the long sharp branched thorns. The latex sap is harmless but stains.$$,
    $$Unripe fruit and other plant parts (leaves, stems) contain irritating latex; ripe fruit is fine.$$,
    array['raw', 'jam', 'jelly']),

  ('Coccoloba uvifera', 'Sea grape',
    array[]::text[], array['fruit'],
    '', array['tree_fruit'],
    $$Coastal shrub/tree of southern Florida, Caribbean, Gulf coast. Hangs grape-like clusters of round purple fruit on coastal dunes. Sweet-tart, slightly resinous.$$,
    $$Pick when individual fruits darken from green to purple — clusters ripen unevenly. Pick selectively rather than whole clusters.$$, $$$$,
    array['raw', 'jam', 'jelly', 'wine']),

  ('Carica papaya', 'Papaya',
    array[]::text[], array['fruit'],
    '', array['tree_fruit'],
    $$Tropical short-lived tree common in Hawaii, southern Florida, sometimes in microclimates of southern California. Soft orange flesh with central cavity of small black seeds.$$,
    $$Pick when half-yellow and slightly soft; ripens further off the tree. Black seeds are edible but peppery — typically discarded.$$,
    $$Unripe (green) papaya and the leaves contain papain, which can stimulate uterine contractions; pregnant women traditionally avoid green-papaya dishes.$$,
    array['raw', 'cooked']),

  ('Macadamia integrifolia', 'Macadamia',
    array['Queensland nut'], array['nut'],
    '', array['nut_easy'],
    $$Australian-origin tree, widely grown in Hawaii and California. Hardest-shelled commonly-eaten nut — requires a special cracker or vise. Buttery rich flavor.$$,
    $$Nuts drop when ripe in fall through winter. Collect and dry in shell for several weeks before cracking. Cracking requires steady pressure (a vise or specialty macadamia cracker).$$, $$$$,
    array['raw', 'cooked', 'baked']),

  ('Macadamia tetraphylla', 'Rough-shell macadamia',
    array['macadamia'], array['nut'],
    '', array['nut_easy'],
    $$Sister species to M. integrifolia, common in California landscaping. Slightly larger nuts; many commercial cultivars are hybrids. Same use, same shell-cracking challenge.$$,
    $$Same as integrifolia.$$, $$$$,
    array['raw', 'cooked', 'baked']);

-- ---- Tier 4C: pepper trees + yucca ----

insert into public.species (scientific_name, common_name, aliases, forage_parts, safety_notes, interest_tags, usage_notes, harvest_tips, toxicity_notes, preparation_methods) values

  ('Schinus molle', 'California pepper tree',
    array['Peruvian pepper tree', 'pepper tree'], array['fruit'],
    '', array['flower_aromatic'],
    $$Drooping fern-leaved tree with hanging clusters of pink-red drupes. Drupes are the traditional source of "pink peppercorns" — milder than black pepper, slightly fruity-resinous. Common California street tree.$$,
    $$Pick clusters when fully pink-red and dry. Strip drupes from the cluster. Use whole or coarsely cracked as a finishing pepper.$$,
    $$Use in moderation as a seasoning. The closely-related Brazilian pepper tree (Schinus terebinthifolia) has more reported sensitivity issues; identify by the fern-like compound leaves of S. molle vs the simpler-pinnate leaves of S. terebinthifolia.$$,
    array['spice', 'dried']),

  ('Yucca filamentosa', 'Adam''s needle',
    array['common yucca'], array['flower'],
    '', array['flower_aromatic'],
    $$Stiff-leaved Eastern US yucca, common landscape plant. Tall flower stalk in midsummer with creamy bell-like blossoms — petals are the foraged part. Mild, faintly soapy-floral.$$,
    $$Pick fully-open petals from fresh flowers; remove the bitter green parts (stamens, pistil). Use raw in salads or briefly fried.$$,
    $$Roots and most other plant parts contain saponins — soapy, mildly toxic raw. Stick to the petals.$$,
    array['raw', 'cooked']);
