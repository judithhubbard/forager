-- Catalog expansion + interest-group taxonomy.
--
-- (1) Adds species.interest_tags so the welcome flow can group
--     species by user interest ("tree fruit", "wild greens", etc.)
--     rather than asking the user to pick from a flat list of 100+
--     species. Also lets the flow honest about which categories
--     have public-data coverage and which are personal-only.
--
-- (2) Tags every existing species (54 rows) with appropriate
--     interest groups.
--
-- (3) Inserts ~54 commonly-foraged species the original seed
--     omitted: Black walnut, Eastern redbud, sugar maple, oak
--     species, sumac, beech, basswood, sassafras, white pine,
--     hemlock needle, oyster mushroom, lion's mane, hen-of-the-
--     woods, etc. — covers Tier 1 + Tier 2 + Tier 3 (minus
--     pokeweed, which got pulled for risk reasons).
--
-- (4) Tags morel + chanterelle as 'mushroom_advanced' (they're
--     classic foraging mushrooms but have potentially-fatal
--     lookalikes — Gyromitra, jack-o-lantern). New users
--     opting in to "mushrooms — beginner" see only the no-toxic-
--     LA mushrooms (oyster, lion's mane, hen, wood ear).
--
-- A separate one-shot script (scripts/import/stamp-jk-prefs.ts)
-- pre-populates user_species_preferences for the project owner
-- with the new species marked enabled=false so the existing
-- Ithaca view is unchanged. Done outside the migration so we
-- don't hard-code a user UUID in version-controlled SQL.

-- ---- (1) Schema ----

alter table public.species
  add column if not exists interest_tags text[] not null default '{}';

create index if not exists species_interest_tags_idx
  on public.species using gin (interest_tags);

-- ---- (2) Tag existing species ----

-- Tree fruit + close cousins (apples, pears, mulberries, cherries,
-- pawpaw, persimmon, autumn olive, cornelian cherry, riverbank grape).
update public.species set interest_tags = array['tree_fruit'] where scientific_name in (
  'Asimina triloba', 'Cornus mas', 'Cornus officinalis', 'Cornus sp.',
  'Diospyros virginiana', 'Elaeagnus umbellata', 'Malus domestica',
  'Morus alba', 'Morus rubra', 'Prunus americana', 'Prunus pumila',
  'Prunus serotina', 'Prunus sp.', 'Prunus virginiana', 'Pyrus communis',
  'Pyrus ussuriensis', 'Vitis riparia'
);

-- Berries & brambles (Amelanchier, Vaccinium, Ribes, Rubus).
update public.species set interest_tags = array['bramble_berry'] where scientific_name in (
  'Amelanchier arborea', 'Amelanchier canadensis', 'Amelanchier laevis',
  'Amelanchier sp.', 'Ribes nigrum', 'Ribes rubrum', 'Rubus allegheniensis',
  'Rubus idaeus', 'Rubus occidentalis', 'Rubus phoenicolasius', 'Rubus sp.',
  'Vaccinium angustifolium', 'Vaccinium corymbosum', 'Vaccinium sp.'
);

-- Nuts — easy (chestnuts, hazelnuts, almonds: shelling but no leaching).
update public.species set interest_tags = array['nut_easy'] where scientific_name in (
  'Castanea dentata', 'Castanea mollissima', 'Castanea pumila',
  'Castanea sativa', 'Castanea sp.',
  'Corylus americana', 'Corylus cornuta', 'Corylus sp.',
  'Prunus dulcis'
);

-- Nuts — intensive (hickory, walnut: hard shell, juglone, processing).
update public.species set interest_tags = array['nut_intensive'] where scientific_name in (
  'Carya illinoinensis', 'Carya laciniosa', 'Carya ovata', 'Carya sp.',
  'Juglans ailantifolia', 'Juglans cinerea', 'Juglans regia', 'Juglans sp.'
);

-- Wild greens (ramps, asparagus).
update public.species set interest_tags = array['wild_green'] where scientific_name in (
  'Allium tricoccum', 'Asparagus officinalis'
);

-- Aromatic (mint counts as both an herb you can chew and a tea).
update public.species set interest_tags = array['wild_green', 'flower_aromatic']
 where scientific_name = 'Mentha';

-- Elderberry — fruit AND flower forager territory.
update public.species set interest_tags = array['tree_fruit', 'flower_aromatic']
 where scientific_name = 'Sambucus canadensis';

-- Mushrooms: morel + chanterelle move to 'advanced' tier (toxic LAs).
update public.species set interest_tags = array['mushroom_advanced']
 where scientific_name in ('Cantharellus cibarius', 'Morchella esculenta');

-- ---- (3) Insert new species ----

-- Tier 1: trees (Black walnut, redbud, basswood, sassafras, maples,
-- hawthorn, oaks, beech, white pine, hemlock, locusts).
insert into public.species (scientific_name, common_name, aliases, forage_parts, safety_notes, interest_tags) values
  ('Juglans nigra', 'Black walnut',
    array['walnut'], array['nut'],
    'Hulls stain hands and clothes; juglone is allelopathic to nearby plants.',
    array['nut_intensive']),
  ('Cercis canadensis', 'Eastern redbud',
    array['redbud'], array['flower'],
    'Flowers and young pods only.',
    array['flower_aromatic']),
  ('Tilia americana', 'American basswood',
    array['linden', 'lime tree'], array['flower', 'leaf'],
    'Flowers for tea; very young leaves as salad green.',
    array['flower_aromatic']),
  ('Sassafras albidum', 'Sassafras',
    array['sassafras'], array['root', 'leaf'],
    'Root bark contains safrole; FDA banned commercial root beer use. Tea in moderation; pregnant women should avoid.',
    array['flower_aromatic']),
  ('Acer saccharum', 'Sugar maple',
    array['hard maple', 'rock maple'], array['sap'],
    '',
    array['sap_syrup']),
  ('Acer rubrum', 'Red maple',
    array['soft maple'], array['sap'],
    'Tappable but lower sugar content than A. saccharum.',
    array['sap_syrup']),
  ('Acer negundo', 'Box elder',
    array['ashleaf maple'], array['sap'],
    'Tappable; common urban weed-tree.',
    array['sap_syrup']),
  ('Crataegus sp.', 'Hawthorn (unspecified)',
    array['hawthorn', 'thornapple', 'mayhaw'], array['fruit'],
    'Fruit (haws) edible; seeds contain cyanogenic compounds — do not crush.',
    array['tree_fruit', 'flower_aromatic']),
  ('Quercus alba', 'White oak',
    array['oak'], array['nut'],
    'Acorns require leaching tannins (cold or hot water, multiple changes) before eating.',
    array['nut_intensive']),
  ('Quercus macrocarpa', 'Bur oak',
    array['mossycup oak'], array['nut'],
    'Larger acorns, often less tannic than other oaks but still benefit from leaching.',
    array['nut_intensive']),
  ('Fagus grandifolia', 'American beech',
    array['beech'], array['nut'],
    'Small triangular nuts; eat raw or roasted in moderation. Excessive raw consumption can upset stomach.',
    array['nut_easy']),
  ('Pinus strobus', 'Eastern white pine',
    array['white pine'], array['leaf', 'bark'],
    'Needles for tea (vitamin C). NOT for pregnant women — some pines induce abortion in cattle.',
    array['flower_aromatic']),
  ('Tsuga canadensis', 'Eastern hemlock',
    array['hemlock'], array['leaf'],
    'TREE hemlock (needles) — distinct from poison hemlock (Conium maculatum) which is an unrelated TOXIC herb.',
    array['flower_aromatic']),
  ('Robinia pseudoacacia', 'Black locust',
    array['locust'], array['flower'],
    'FLOWERS ONLY. All other parts (bark, leaves, seeds) are toxic.',
    array['flower_aromatic']),
  ('Gleditsia triacanthos', 'Honey locust',
    array['honeylocust'], array['fruit'],
    'Sweet pulp around seeds in pods. Long thorns on wild trees — cultivars are thornless.',
    array['flower_aromatic']),
  -- Shrubs
  ('Lindera benzoin', 'Spicebush',
    array['common spicebush'], array['fruit', 'leaf'],
    'Berries dried as allspice substitute; twigs for tea.',
    array['flower_aromatic']),
  ('Aronia melanocarpa', 'Black chokeberry',
    array['aronia'], array['fruit'],
    'Astringent raw; usually cooked or juiced.',
    array['bramble_berry']),
  ('Rosa rugosa', 'Rugosa rose',
    array['beach rose', 'Japanese rose'], array['fruit', 'flower'],
    'Hips after first frost are sweetest. Avoid sprayed roadside roses.',
    array['bramble_berry']),
  ('Rhus typhina', 'Staghorn sumac',
    array['sumac'], array['fruit'],
    'Distinct from POISON sumac (Toxicodendron vernix) which has white drupes in wet areas; staghorn has red upright clusters in dry areas.',
    array['flower_aromatic']),
  ('Sambucus nigra', 'Black elderberry',
    array['european elderberry'], array['fruit', 'flower'],
    'Cook berries before eating — raw causes GI distress. Avoid stems/leaves/unripe berries (cyanogenic glycosides).',
    array['tree_fruit', 'flower_aromatic']),
  -- Wild greens
  ('Urtica dioica', 'Stinging nettle',
    array['nettle'], array['shoot', 'leaf'],
    'Cook to neutralize stinging hairs. Wear gloves to harvest.',
    array['wild_green']),
  ('Taraxacum officinale', 'Dandelion',
    array['common dandelion'], array['leaf', 'flower', 'root'],
    'Avoid sprayed lawns. Bitterness peaks after flowering.',
    array['wild_green']),
  ('Portulaca oleracea', 'Common purslane',
    array['purslane'], array['leaf', 'shoot'],
    'Distinguish from spurge (Euphorbia spp.) which has milky sap; purslane has clear sap.',
    array['wild_green']),
  ('Chenopodium album', 'Lamb''s quarters',
    array['goosefoot', 'wild spinach', 'pigweed'], array['leaf'],
    'Contains oxalates (like spinach); cook for best digestion. Avoid in large quantities.',
    array['wild_green']),
  ('Allium vineale', 'Field garlic',
    array['crow garlic', 'wild garlic'], array['leaf', 'bulb'],
    'Round hollow leaves and onion smell distinguish from toxic Death Camas (Zigadenus, no smell, flat leaves).',
    array['wild_green']),
  ('Hemerocallis fulva', 'Common daylily',
    array['orange daylily', 'tawny daylily'], array['flower', 'shoot'],
    'Flowers, buds, young shoots edible. Some people experience GI upset; eat in moderation when first trying.',
    array['flower_aromatic']),
  -- Mushrooms (Tier 1: no toxic lookalikes)
  ('Pleurotus ostreatus', 'Oyster mushroom',
    array['oyster'], array['mushroom'],
    'Bitter look-alikes (Crepidotus, Lentinellus) but no deadly LAs. Verify white/cream gills running down the stem.',
    array['mushroom_beginner']),
  ('Hericium erinaceus', 'Lion''s mane',
    array['hericium', 'pom pom'], array['mushroom'],
    'Distinctive icicle-like spines hanging from a single mass. No toxic look-alikes.',
    array['mushroom_beginner']),
  ('Laetiporus sulphureus', 'Chicken of the woods',
    array['sulfur shelf', 'chicken mushroom'], array['mushroom'],
    'On HARDWOOD only — specimens on conifers (esp. eucalyptus, hemlock) cause GI upset. No deadly LAs.',
    array['mushroom_beginner']),
  ('Grifola frondosa', 'Hen of the woods',
    array['maitake'], array['mushroom'],
    'Found at base of oaks in fall. Berkeley''s polypore is bitter look-alike but not toxic.',
    array['mushroom_beginner']);

-- Tier 2: regional or specialized.
insert into public.species (scientific_name, common_name, aliases, forage_parts, safety_notes, interest_tags) values
  ('Prunus maritima', 'Beach plum',
    array['shore plum'], array['fruit'], '',
    array['tree_fruit']),
  ('Vaccinium macrocarpon', 'American cranberry',
    array['cranberry'], array['fruit'],
    'Astringent raw; usually cooked.',
    array['bramble_berry']),
  ('Vaccinium ovatum', 'Evergreen huckleberry',
    array['huckleberry'], array['fruit'], '',
    array['bramble_berry']),
  ('Mahonia aquifolium', 'Oregon grape',
    array['holly-leaved barberry'], array['fruit'],
    'Tart; usually for jelly. Roots medicinally used elsewhere.',
    array['bramble_berry']),
  ('Gaultheria shallon', 'Salal',
    array['shallon'], array['fruit'], '',
    array['bramble_berry']),
  ('Gaultheria procumbens', 'Wintergreen',
    array['eastern teaberry', 'checkerberry'], array['leaf', 'fruit'],
    'Methyl salicylate is metabolized like aspirin; avoid if salicylate-sensitive.',
    array['wild_green']),
  ('Rubus spectabilis', 'Salmonberry',
    array[]::text[], array['fruit'], '',
    array['bramble_berry']),
  ('Rubus parviflorus', 'Thimbleberry',
    array[]::text[], array['fruit'], '',
    array['bramble_berry']),
  ('Sambucus cerulea', 'Blue elderberry',
    array['Sambucus mexicana'], array['fruit', 'flower'],
    'Cook berries before eating. Avoid stems/leaves/unripe berries.',
    array['tree_fruit', 'flower_aromatic']),
  ('Pinus edulis', 'Pinyon pine',
    array['piñon pine', 'two-needle pinyon'], array['nut'],
    'Pine nuts; toast to extract from cone. Some commercial pine nuts cause "pine mouth" — wild local pinyon usually doesn''t.',
    array['nut_easy']),
  ('Stellaria media', 'Common chickweed',
    array['chickweed'], array['leaf', 'stem'],
    'Mild flavor; raw in salads. Distinguish from poisonous Anagallis (scarlet pimpernel) by the line of hairs along chickweed stem.',
    array['wild_green']),
  ('Plantago major', 'Common plantain',
    array['greater plantain'], array['leaf', 'seed'],
    'Young leaves only; older leaves are too fibrous. NOT the banana-type plantain.',
    array['wild_green']),
  ('Galium aparine', 'Cleavers',
    array['goosegrass', 'sticky willy'], array['shoot'],
    'Tender spring shoots only.',
    array['wild_green']),
  ('Nasturtium officinale', 'Watercress',
    array[]::text[], array['leaf'],
    'ONLY harvest from clean unpolluted streams; absorbs contaminants from water.',
    array['wild_green']),
  ('Arctium minus', 'Lesser burdock',
    array['burdock'], array['root'],
    'First-year roots only (before flower stalk forms). Distinguish from foxglove (Digitalis) seedlings which are TOXIC.',
    array['root_tuber']),
  ('Achillea millefolium', 'Yarrow',
    array['common yarrow', 'milfoil'], array['leaf', 'flower'],
    'Bitter; small amounts as flavoring. Avoid during pregnancy.',
    array['flower_aromatic', 'wild_green']);

-- Tier 3 (minus pokeweed): niche or higher-caution.
insert into public.species (scientific_name, common_name, aliases, forage_parts, safety_notes, interest_tags) values
  ('Allium canadense', 'Wild onion',
    array['meadow garlic', 'Canada garlic'], array['leaf', 'bulb'],
    'Onion smell required — distinguish from toxic Death Camas (no smell).',
    array['wild_green']),
  ('Allium tuberosum', 'Garlic chives',
    array['Chinese chives'], array['leaf', 'flower'],
    'Garlic-like smell required to confirm ID.',
    array['wild_green']),
  ('Helianthus tuberosus', 'Jerusalem artichoke',
    array['sunchoke', 'sunroot'], array['root'],
    'Inulin causes GI distress for some — eat small portions when first trying.',
    array['root_tuber']),
  ('Apios americana', 'Groundnut',
    array['hopniss', 'Indian potato'], array['root'],
    'A few people experience allergic reaction; cook before eating.',
    array['root_tuber']),
  ('Smilax sp.', 'Greenbrier',
    array['catbrier'], array['shoot'],
    'Spring shoots only — like asparagus. Older growth becomes tough and thorny.',
    array['wild_green']),
  ('Boletus edulis', 'King bolete',
    array['porcini', 'cep'], array['mushroom'],
    'Bolete safety rules: avoid blue staining, red pores, bitter taste. Tylopilus felleus look-alike is bitter but not toxic; Boletus huronensis causes GI.',
    array['mushroom_advanced']),
  ('Coprinus comatus', 'Shaggy mane',
    array['lawyer''s wig'], array['mushroom'],
    'Do NOT consume with alcohol — related Coprinopsis atramentaria contains coprine (antabuse-like reaction); shaggy mane usually clean but caution warranted.',
    array['mushroom_advanced']),
  ('Auricularia auricula-judae', 'Wood ear',
    array['black fungus', 'cloud ear'], array['mushroom'],
    'Distinctive jelly-fungus texture. No toxic look-alikes.',
    array['mushroom_beginner']),
  ('Mahonia repens', 'Creeping Oregon grape',
    array['creeping mahonia'], array['fruit'],
    'Tart; usually for jelly.',
    array['bramble_berry'])
on conflict (scientific_name) do nothing;
