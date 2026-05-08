-- Tier 5b: follow-up adds based on the post-Tier-5 dry-run.
-- After Tier 5 the match rate hit 58.9%; this round adds the
-- next-tier-down forageable trees and patches up city-portal
-- alias variants. Forecast bump: 58.9% → ~65%.

insert into public.species (scientific_name, common_name, aliases, forage_parts, safety_notes, interest_tags, usage_notes, harvest_tips, toxicity_notes, preparation_methods) values

  ('Acer saccharinum', 'Silver maple',
    array['Maple Silver', 'MAPLE SILVER', 'Maple, Silver', 'soft maple']::text[],
    array['sap']::text[],
    '',
    array['sap_syrup']::text[],
    $$Fast-growing river-bottom maple, planted heavily as a city street tree before its weak wood and surface roots fell out of favor. Sap is tappable like sugar maple but at roughly half the sugar content (~1.5%) — needs more boil-down for syrup. Common in older neighborhoods across the eastern half of the continent.$$,
    $$Tap January–March when nights freeze and days thaw. Drill a 7/16" hole 2" deep, slightly upward, on the sunny side of a tree at least 12" diameter. Boil 70–90 parts sap to 1 part syrup (vs ~40:1 for sugar maple). Plug holes after season ends.$$,
    $$Not toxic. The lower sugar content makes silver maple sap a poor commercial choice but fine for backyard syrup making.$$,
    array['syrup']::text[]),

  ('Celtis occidentalis', 'Common hackberry',
    array['Hackberry', 'HACKBERRY', 'nettle tree', 'sugarberry']::text[],
    array['fruit']::text[],
    '',
    array['tree_fruit']::text[],
    $$Underrated forageable tree planted as a tough, urban-tolerant street tree across the central US. Late-summer/fall fruit is a small dark-purple drupe with a hard pit and a thin layer of dry-sweet date-flavored flesh — eaten whole (the pit crunches like a seed) or processed into "hackberry cakes" of pulverized fruit + pit, an Indigenous food across the Plains. Persists on the tree through winter; can still be harvested in January.$$,
    $$Pick when fully purple-black and slightly raisined (October–March). Crush the whole drupe to release the date-pulp + pit; either eat as-is or grind in a food processor for cakes. Persists best in dry winters.$$,
    $$Not toxic. The pit is hard enough to break a tooth — crush before eating.$$,
    array['raw', 'cooked', 'baked']::text[]),

  ('Fraxinus americana', 'White ash',
    array['Ash White', 'ASH WHITE', 'Ash, White', 'American ash']::text[],
    array['seed']::text[],
    'Like green ash, white ash is being decimated by emerald ash borer; harvest opportunistically.',
    array['flower_aromatic']::text[],
    $$Eastern North American ash, slightly taller and more woodland-prone than green ash but planted ornamentally too. Same forageable use: young samaras pickled or cooked in late spring (caper-substitute). Famous as the wood for baseball bats. Now critically threatened by emerald ash borer.$$,
    $$Same as green ash — pick samaras while bright green and tender; pickle in vinegar+salt brine.$$,
    $$Same advisory as green ash: niche use, mature seeds + leaves are mildly emetic in quantity. Pickled samaras in moderation are safe.$$,
    array['pickle', 'cooked']::text[]),

  ('Fraxinus nigra', 'Black ash',
    array['swamp ash', 'basket ash', 'hoop ash', 'Ash, Black']::text[],
    array['seed']::text[],
    'Like other ashes, also being decimated by emerald ash borer.',
    array['flower_aromatic']::text[],
    $$Northern wetland ash with a culturally significant role: its wood is the traditional material for Algonquian/Haudenosaunee splint baskets — pounded billets separate cleanly along annual rings. Young samaras are pickle-able like other ashes. Standing trees are now extremely rare due to EAB.$$,
    $$Pick samaras while green and tender. Skin and pickle as for white or green ash.$$,
    $$Same as other ashes.$$,
    array['pickle', 'cooked']::text[]),

  ('Acer ginnala', 'Amur maple',
    array['Acer tataricum subsp. ginnala', 'Russian maple', 'Maple, Amur']::text[],
    array['sap', 'leaf']::text[],
    '',
    array['sap_syrup']::text[],
    $$Small ornamental maple from northeast Asia, widely planted in cold-climate cities for its brilliant fall color. Sap is tappable like other maples (low sugar but produces drinkable sap-water "tree water"). Young leaves can be cooked as a green. Frequently considered invasive in the Midwest and Plains.$$,
    $$Tap in early spring (Feb–March) for sap-water — drink fresh or lightly reduce. Young spring leaves can be sautéed or added to soups; older leaves get tough.$$,
    $$Not toxic. The very low sugar content makes syrup-making impractical but the spring sap is a refreshing forest beverage.$$,
    array['raw', 'cooked', 'syrup']::text[])

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

-- ---- Alias patches for inverted/misspelled forms in city portal data ----

update public.species
   set aliases = (
     select array(select distinct unnest(coalesce(aliases, '{}'::text[]) ||
       array['Spruce Colorado', 'SPRUCE COLORADO', 'Spruce, Colorado', 'Colorado Spruce']))
   )
 where scientific_name = 'Picea pungens';

update public.species
   set aliases = (
     select array(select distinct unnest(coalesce(aliases, '{}'::text[]) ||
       array['Larix siberica', 'LARIX SIBERICA']))  -- common typo of L. sibirica
   )
 where scientific_name = 'Larix sibirica';

update public.species
   set aliases = (
     select array(select distinct unnest(coalesce(aliases, '{}'::text[]) ||
       array['Elm American', 'ELM AMERICAN', 'Elm, American']))
   )
 where scientific_name = 'Ulmus americana';

update public.species
   set aliases = (
     select array(select distinct unnest(coalesce(aliases, '{}'::text[]) ||
       array['Elm Siberian', 'ELM SIBERIAN', 'Elm, Siberian']))
   )
 where scientific_name = 'Ulmus pumila';

-- Tilia × flavescens hybrid (commonly listed in Canadian Prairie city
-- portals) is a hybrid of T. cordata × T. americana. Foraging uses
-- mirror both parents. Alias to T. cordata since the urban-tree-portal
-- entries are usually clones of European-origin parentage.
update public.species
   set aliases = (
     select array(select distinct unnest(coalesce(aliases, '{}'::text[]) ||
       array['Tilia flavescens', 'Tilia × flavescens', 'Tilia x flavescens']))
   )
 where scientific_name = 'Tilia cordata';

update public.species
   set aliases = (
     select array(select distinct unnest(coalesce(aliases, '{}'::text[]) ||
       array['Aspen', 'ASPEN', 'Poplar Trembling', 'Poplar, Trembling']))
   )
 where scientific_name = 'Populus tremuloides';
