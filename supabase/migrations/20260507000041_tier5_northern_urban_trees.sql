-- Tier 5: northern + urban-tree forageables. Closes the catalog
-- gap exposed by the OpenTrees expansion audit (data/exploration/
-- AUDIT-REPORT.md).
--
-- 29 alive Canadian + US municipal tree-inventory sources matched
-- only 13% of 2.2M pins against the 144-species catalog. The biggest
-- unmatched clusters were spruces, pines, elms, ash, and aspen —
-- all with legitimate (if niche) forageable uses (needle tea, inner
-- bark, samaras). Adding these 10 species lifts the projected match
-- rate to ~38%.
--
-- Inclusion principles (same as Tiers 1-4):
-- - Add when widely planted in cities + has clear, low-confusion
--   edibility documented in standard foraging references (Thayer,
--   Elias & Dykeman, Indigenous PNW).
-- - Inline prose for usage/harvest/toxicity (no separate curation
--   migration). Most uses are bark/needle/samara — not table fare,
--   so prose is honest about niche / survival use.
-- - Tag as flower_aromatic group (covers basswood, white pine,
--   sumac, sassafras already — adjacent uses).
--
-- Deliberate omissions:
-- - Malus adstringens (rosybloom crabapple): would conflict with
--   the deliberate NO_FALLBACK on Malus genus (most ornamental
--   crabapples are inedible).
-- - Syringa reticulata: flowers technically edible but mostly
--   ornamental/medicinal use.
-- - Syagrus romanzoffianum (queen palm): fruit edible but stringy.
-- - Cotoneaster: berries are mildly cyanogenic. Skip.

-- ---- Tier 5A: spruces (needle tea, spring tip syrup) ----

insert into public.species (scientific_name, common_name, aliases, forage_parts, safety_notes, interest_tags, usage_notes, harvest_tips, toxicity_notes, preparation_methods) values

  ('Picea glauca', 'White spruce',
    array['Spruce White', 'SPRUCE WHITE', 'spruce, white']::text[],
    array['leaf', 'bark']::text[],
    '',
    array['flower_aromatic']::text[],
    $$Northern boreal conifer, widely planted across Canada and the US for shelterbelts and ornamentals. Bright young needle tips in spring make a citrusy vitamin-C-rich tea or syrup. Inner bark is a traditional Indigenous food across the boreal range.$$,
    $$Pick the bright lime-green new growth (called "spruce tips") in late spring, when tips are 1–3 cm long and still soft. Use fresh for tea, syrup, or finishing salt; freeze whole for later use. Do not strip whole branches — take a few tips per tree.$$,
    $$Avoid Pacific yew (Taxus brevifolia) — flat needles look superficially similar but yew is highly toxic. Spruce needles are square in cross-section and roll between fingers; yew needles are flat and bend.$$,
    array['raw', 'tea', 'syrup']::text[]),

  ('Picea pungens', 'Blue spruce',
    array['Colorado blue spruce', 'spruce, blue']::text[],
    array['leaf', 'bark']::text[],
    '',
    array['flower_aromatic']::text[],
    $$The familiar steel-blue ornamental conifer of municipal landscapes across North America. Same forageable uses as white spruce: spring needle tips for tea and syrup, with a slightly more resinous flavor. Inner bark less commonly harvested than the eastern/boreal spruces but the same principles apply.$$,
    $$Same as white spruce — pick bright new tips in spring while still soft. Older, fully-hardened needles are tough and over-resinous.$$,
    $$Same yew-confusion warning as white spruce. Heavily-trafficked urban ornamentals may have been treated with pesticides; ask the property steward before harvesting.$$,
    array['raw', 'tea', 'syrup']::text[]),

  ('Picea sp.', 'Spruce (unspecified)',
    array['picea', 'spruce']::text[],
    array['leaf', 'bark']::text[],
    '',
    array['flower_aromatic']::text[],
    $$Catch-all entry for spruce inventory pins where the city did not record the species. All Picea species share the same forageable use — young needle tips in spring for tea or syrup, inner bark in survival contexts. Confirm by smelling crushed needles (resinous, citrusy) and noting the square-cross-section needles attached to small woody pegs on the twig.$$,
    $$Identify before harvesting. Spruce needles are square-section and roll between fingers; the twigs have tiny woody pegs (sterigmata) where needles attach.$$,
    $$Confirm species before harvest. Yew (Taxus) has flat needles, no pegs, and is highly toxic.$$,
    array['raw', 'tea', 'syrup']::text[]),

-- ---- Tier 5B: pines beyond eastern white + pinyon ----

  ('Pinus sylvestris', 'Scots pine',
    array['Scotch pine', 'pine, Scots']::text[],
    array['leaf', 'bark']::text[],
    '',
    array['flower_aromatic']::text[],
    $$The most-planted European pine, widely used as a Christmas tree and ornamental in North American cities. Two-needle bundles (in pairs). Young needles for tea (high vitamin C); pollen is collected and used as a protein supplement; inner bark traditionally eaten in northern Europe in lean years. Pine nuts are tiny (much smaller than P. edulis) and rarely harvested.$$,
    $$Pick young soft needles in late spring for tea. Pollen-collect from male catkins by tapping over a paper bag — collect on dry mornings in early summer.$$,
    $$Confirm species before harvest. Some pines (P. ponderosa) are mildly toxic to livestock during pregnancy but no documented human toxicity from needle tea. Yew is the look-alike to avoid.$$,
    array['raw', 'tea', 'syrup']::text[]),

  ('Pinus contorta', 'Lodgepole pine',
    array['Pinus contorta latifolia', 'shore pine', 'pine, lodgepole']::text[],
    array['leaf', 'bark']::text[],
    '',
    array['flower_aromatic']::text[],
    $$Pacific Northwest and Rocky Mountain pine, also planted as a fast-growing ornamental in colder zones. Inner bark (cambium) was an important traditional food for many Indigenous peoples of the PNW and northern Rockies — harvested in spring when sap is rising and the bark separates cleanly. Young needles for tea.$$,
    $$Inner-bark harvest is sustainable only on trees being felled or with permission to scar. Strip the outer bark in spring (May-June), then peel off the white inner cambium in long sheets — eaten fresh or dried into "bark noodles".$$,
    $$Same yew warning as other pines. Not toxic.$$,
    array['raw', 'tea']::text[]),

  ('Pinus sp.', 'Pine (unspecified)',
    array['pinus', 'pine']::text[],
    array['leaf', 'nut', 'bark']::text[],
    '',
    array['flower_aromatic']::text[],
    $$Catch-all entry for pine inventory pins where city data did not specify the species. All Pinus species share basic uses: needle tea (young soft needles), pollen (in season), inner bark (survival/traditional). Pine-nut yield varies enormously — only a handful of species (P. edulis, P. monophylla, P. cembra, P. koraiensis, P. pinea) produce nuts large enough for routine harvest.$$,
    $$Identify the species before harvest if pollen or nuts are the goal — the small-coned ornamental pines yield very little. Needle tea works for any pine.$$,
    $$Yew (Taxus) is the consistent look-alike to avoid: flat needles, red berry-like seed cones, highly toxic.$$,
    array['raw', 'tea', 'syrup']::text[]),

-- ---- Tier 5C: larch / tamarack ----

  ('Larix sibirica', 'Siberian larch',
    array['Larix decidua', 'larch', 'tamarack']::text[],
    array['leaf', 'bark']::text[],
    '',
    array['flower_aromatic']::text[],
    $$Deciduous conifer (sheds needles in fall) widely planted as a windbreak and timber tree in cold zones. Bright soft new needles in spring have a delicate lemon flavor — used for tea, herb butters, and as a salad accent. Larch resin (galipot) was traditionally chewed; bark and twigs steeped for vitamin C tea.$$,
    $$Pick fresh spring needles in May–June while still bright soft green. Once fully expanded and hardened by midsummer, they become tough and resinous. Use immediately or freeze.$$,
    $$Not toxic. The closely-related American tamarack (L. laricina) is interchangeable for these uses.$$,
    array['raw', 'tea', 'syrup']::text[]),

-- ---- Tier 5D: elms (samaras + inner bark) ----

  ('Ulmus americana', 'American elm',
    array['white elm', 'common elm', 'elm, American']::text[],
    array['seed', 'bark', 'leaf']::text[],
    '',
    array['flower_aromatic']::text[],
    $$Once the dominant urban shade tree across the eastern US and Canada, decimated by Dutch elm disease but still surviving in resistant cultivars and isolated trees. Young samaras (winged seeds, "elm wings") emerge in early spring before leaves and are crisp, mild, slightly sweet — eaten raw, sautéed, or pickled. Inner bark is a documented survival food across the species' range.$$,
    $$Pick samaras when bright green and tender, before the seed inside fully hardens (April–May, depending on latitude). Pinch a wing — if it cracks brittlely, too late. Sauté briefly or eat raw in salads.$$,
    $$Not toxic. Older samaras become bitter and tough. Inner bark harvest scars trees — only do this on trees being removed or with permission.$$,
    array['raw', 'cooked', 'pickle']::text[]),

  ('Ulmus pumila', 'Siberian elm',
    array['Asiatic elm', 'dwarf elm', 'elm, Siberian']::text[],
    array['seed', 'bark', 'leaf']::text[],
    '',
    array['flower_aromatic']::text[],
    $$Tough, fast-growing elm planted across North America after Dutch elm disease decimated U. americana. Often considered weedy. Same forageable uses as American elm: young samaras in spring, inner bark, young leaves cooked. Samaras are larger than A. elm and easier to harvest.$$,
    $$Same as American elm — pick samaras early in spring when bright green and tender. Larger samaras of Siberian elm are easier to bulk-harvest for stir-fry or pickling.$$,
    $$Not toxic. Some people get mild GI upset from large quantities raw; cook if uncertain.$$,
    array['raw', 'cooked', 'pickle']::text[]),

-- ---- Tier 5E: ash ----

  ('Fraxinus pennsylvanica', 'Green ash',
    array['Ash Green', 'red ash', 'Fraxinus pennsylvanica var. subintegerrima', 'ash, green']::text[],
    array['seed']::text[],
    'Ash trees are being decimated by emerald ash borer; many urban trees are dying. Harvest opportunistically.',
    array['flower_aromatic']::text[],
    $$Dominant urban ash species across central and eastern North America, planted heavily after Dutch elm disease and now itself being killed by emerald ash borer (EAB). Young samaras (winged seeds) are pickled or cooked in some traditional cuisines (Sicily, parts of the Levant), with a flavor reminiscent of capers when brined. Bark and leaves not generally eaten.$$,
    $$Pick samaras in late spring through early summer while still bright green and tender. Pickle in vinegar+salt brine; the result is similar to capers and keeps for months. Older brown samaras are bitter and tough.$$,
    $$Not toxic, but a niche use — most North American foragers will not have tried this. Mature ash leaves and seeds are mildly emetic in large quantities; pickled samaras in moderate amounts are safe.$$,
    array['pickle', 'cooked']::text[]),

-- ---- Tier 5F: poplars / aspens ----

  ('Populus tremuloides', 'Quaking aspen',
    array['trembling aspen', 'aspen', 'poplar', 'Populus tremula']::text[],
    array['bark', 'flower', 'leaf']::text[],
    '',
    array['flower_aromatic']::text[],
    $$Wide-ranging poplar, the most widely distributed tree in North America. Inner bark is a traditional Indigenous food across the boreal and Rocky Mountain ranges — harvested in spring when sap is flowing and the cambium is sweet. Bud resin (called "balm of Gilead" when sourced from balsam poplar) is collected for salves and infused honey. Young leaves and catkins are edible cooked.$$,
    $$Inner bark in spring (April–June) on trees being felled or with permission. Bud resin in late winter (February) on warm days — sticky red-amber buds smell like vanilla; tincture in oil or alcohol.$$,
    $$Not human-toxic. Aspirin-like compounds (salicin) in bark; people sensitive to aspirin should use sparingly. Bud resin is a strong fragrance and sticky; wear gloves.$$,
    array['raw', 'cooked', 'tea']::text[]),

-- ---- Tier 5G: hybrid / additional linden ----

  ('Tilia cordata', 'Littleleaf linden',
    array['Linden Littleleaf', 'small-leaved lime', 'linden, littleleaf']::text[],
    array['flower', 'leaf']::text[],
    '',
    array['flower_aromatic']::text[],
    $$European species heavily planted as a city street tree across temperate North America (often replacing diseased elms and ashes). Same forageable uses as native T. americana: fragrant flower clusters in early summer for tea, young leaves edible raw or cooked. Linden honey is one of the most prized monofloral honeys in Europe.$$,
    $$Pick flower clusters when fully open in late June through mid-July. Dry on screens or in a low oven for tea. Young leaves are tender and mild in late spring before they harden.$$,
    $$Not toxic. Excessive flower-tea consumption (multiple cups daily over weeks) has been associated with mild cardiac stimulation; moderate use is safe.$$,
    array['raw', 'cooked', 'tea']::text[])

  on conflict (scientific_name) do update set
    common_name = excluded.common_name,
    aliases = excluded.aliases,
    forage_parts = excluded.forage_parts,
    safety_notes = excluded.safety_notes,
    interest_tags = excluded.interest_tags,
    usage_notes = excluded.usage_notes,
    harvest_tips = excluded.harvest_tips,
    toxicity_notes = excluded.toxicity_notes,
    preparation_methods = excluded.preparation_methods;

-- ---- Aliases for inverted-common-name forms used by some city portals ----
-- Some sources publish 'Maple, Sugar' / 'Maple Sugar' instead of 'Sugar Maple'.

update public.species
   set aliases = (
     select array(
       select distinct unnest(coalesce(aliases, '{}'::text[]) ||
                              array['Maple Sugar', 'MAPLE SUGAR', 'Maple, Sugar', 'maple, sugar'])
     )
   )
 where scientific_name = 'Acer saccharum';

update public.species
   set aliases = (
     select array(
       select distinct unnest(coalesce(aliases, '{}'::text[]) ||
                              array['Maple Red', 'MAPLE RED', 'Maple, Red', 'maple, red'])
     )
   )
 where scientific_name = 'Acer rubrum';

update public.species
   set aliases = (
     select array(
       select distinct unnest(coalesce(aliases, '{}'::text[]) ||
                              array['Locust Honey', 'LOCUST HONEY', 'Honeylocust', 'honey locust', 'Locust, Honey'])
     )
   )
 where scientific_name = 'Gleditsia triacanthos';

update public.species
   set aliases = (
     select array(
       select distinct unnest(coalesce(aliases, '{}'::text[]) ||
                              array['Linden American', 'Linden, American', 'basswood, American'])
     )
   )
 where scientific_name = 'Tilia americana';

-- Norway maple (Acer platanoides) is NOT in the catalog — it's an
-- invasive that's not commonly foraged. The "Maple Norway" / "MAPLE
-- NORWAY" tokens stay unmatched, which is correct.
