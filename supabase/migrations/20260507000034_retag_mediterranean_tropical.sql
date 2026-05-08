-- Split warm-climate fruit out of the temperate "tree_fruit" group
-- into a new "mediterranean_tropical_fruit" group. Existing temperate
-- species (apples, cherries, mulberries, pawpaw, hawthorn, beach
-- plum, persimmon, autumn olive, cornelian cherry) stay tagged
-- 'tree_fruit'. Citrus, fig, olive, pomegranate, loquat, carob,
-- dates, prickly pear, and tropical fruits (mango, lychee, etc.)
-- move to the new tag.
--
-- Sambucus retains the dual tag (tree_fruit + flower_aromatic) since
-- elderberry is widely available across both temperate and warm
-- climates. Crataegus stays with both as well.
--
-- Idempotent: array_remove + array_append guard against duplicate
-- tags if the migration is re-run after manual edits.

-- Move all Citrus, plus Fortunella, plus the genus catch-all.
update public.species
   set interest_tags = array_append(
         array_remove(interest_tags, 'tree_fruit'),
         'mediterranean_tropical_fruit'
       )
 where scientific_name in (
   'Citrus sinensis', 'Citrus limon', 'Citrus reticulata',
   'Citrus paradisi', 'Citrus aurantium', 'Citrus medica',
   'Fortunella japonica', 'Citrus sp.',
   'Persea americana', 'Olea europaea', 'Ficus carica',
   'Punica granatum', 'Eriobotrya japonica', 'Diospyros kaki',
   'Ceratonia siliqua',
   'Phoenix dactylifera', 'Phoenix canariensis', 'Phoenix sp.',
   'Opuntia ficus-indica',
   'Mangifera indica', 'Litchi chinensis', 'Annona cherimola',
   'Annona squamosa', 'Psidium guajava', 'Acca sellowiana',
   'Casimiroa edulis', 'Eugenia uniflora', 'Carissa macrocarpa',
   'Coccoloba uvifera', 'Carica papaya'
 )
   and 'mediterranean_tropical_fruit' <> ALL(interest_tags);
