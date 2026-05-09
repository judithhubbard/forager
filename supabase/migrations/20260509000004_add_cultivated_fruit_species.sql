-- Add 12 cultivated fruit species that the regional guides reference but
-- were missing from our forageable_species catalog. With these in place,
-- the previously-skipped cells from data/exploration/regional-windows-v1.json
-- can be inserted into species_fruiting_windows in the next migration.
--
-- All 12 are common urban/orchard species — sweet/sour cherry, peach,
-- apricot, European/Japanese plum, Asian pear, quince, kiwi, ginkgo,
-- and the two main cultivated grape species. Each row provides the
-- minimum the schema requires (scientific + common names, forage parts,
-- interest tags); fuller prose (usage_notes, harvest_tips, etc.) can be
-- backfilled later.

insert into public.species
  (scientific_name, common_name, forage_parts, interest_tags, safety_notes, aliases)
values
  ('Prunus avium',         'Sweet cherry',
     '{fruit}',  '{tree_fruit}',
     'Pits contain trace cyanogenic compounds; do not consume.',
     '{wild sweet cherry,gean,mazzard}'),
  ('Prunus cerasus',       'Sour cherry',
     '{fruit}',  '{tree_fruit}',
     'Pits contain trace cyanogenic compounds; do not consume.',
     '{tart cherry,pie cherry,morello}'),
  ('Prunus armeniaca',     'Apricot',
     '{fruit}',  '{tree_fruit}',
     'Pits contain trace cyanogenic compounds; do not consume.',
     '{}'),
  ('Prunus persica',       'Peach',
     '{fruit}',  '{tree_fruit}',
     'Pits contain trace cyanogenic compounds; do not consume.',
     '{nectarine}'),
  ('Prunus domestica',     'European plum',
     '{fruit}',  '{tree_fruit}',
     'Pits contain trace cyanogenic compounds; do not consume.',
     '{Italian plum,greengage,Stanley plum,prune plum}'),
  ('Prunus salicina',      'Japanese plum',
     '{fruit}',  '{tree_fruit}',
     'Pits contain trace cyanogenic compounds; do not consume.',
     '{Asian plum,Santa Rosa plum}'),
  ('Pyrus pyrifolia',      'Asian pear',
     '{fruit}',  '{tree_fruit}',
     '',
     '{Japanese pear,nashi pear,sand pear,apple pear}'),
  ('Cydonia oblonga',      'Quince',
     '{fruit}',  '{tree_fruit}',
     'Astringent and hard raw — typically cooked, baked, or made into jelly.',
     '{}'),
  ('Actinidia deliciosa',  'Kiwifruit',
     '{fruit}',  '{mediterranean_tropical_fruit}',
     '',
     '{kiwi,fuzzy kiwifruit,Chinese gooseberry}'),
  ('Ginkgo biloba',        'Ginkgo',
     '{seed}',   '{nut_intensive}',
     'Edible kernel only. Fleshy outer seed coat is toxic and reeks; handle with gloves and remove the flesh before processing the kernel. Eat in moderation — large quantities of cooked kernels can cause MPN poisoning, especially in children.',
     '{maidenhair tree,ginkgo nut}'),
  ('Vitis vinifera',       'Wine grape',
     '{fruit,leaf}',  '{tree_fruit}',
     '',
     '{common grape vine,European grape}'),
  ('Vitis labrusca',       'Fox grape',
     '{fruit,leaf}',  '{tree_fruit}',
     '',
     '{Concord grape,Niagara grape,Catawba grape,northern fox grape}')
on conflict (scientific_name) do nothing;
