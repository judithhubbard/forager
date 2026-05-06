-- More "Genus sp." entries for users who can identify a forageable
-- to genus but not species. Same pattern as Amelanchier sp. — adds
-- the species row plus a default fruiting-window envelope per
-- existing region.
--
-- All idempotent (safe to re-run).

insert into public.species (
  scientific_name, common_name, aliases, forage_parts, safety_notes
) values
  ('Carya sp.', 'Hickory (unspecified)',
    array['Carya', 'Hickory'],
    array['nut'],
    'Use when the species is unclear. Hickories vary in shell hardness and meat yield; treat ripeness window as approximate.'),
  ('Vaccinium sp.', 'Blueberry (unspecified)',
    array['Vaccinium', 'Blueberry', 'Huckleberry'],
    array['fruit'],
    'Use when you can ID a Vaccinium but not the specific species (highbush vs. lowbush, etc.).'),
  ('Prunus sp.', 'Cherry/Plum (unspecified)',
    array['Prunus', 'Cherry', 'Plum'],
    array['fruit'],
    'Use when the Prunus species is unclear. Note that some wild Prunus species have toxic seeds and bitter or unsafe fruits — always confirm before eating.'),
  ('Cornus sp.', 'Cornelian cherry (unspecified)',
    array['Cornus'],
    array['fruit'],
    'Use for Cornelian-cherry-type Cornus when species is unclear (mas vs. officinalis). Cornus species vary widely in edibility — confirm before eating.'),
  ('Castanea sp.', 'Chestnut (unspecified)',
    array['Castanea', 'Chestnut'],
    array['nut'],
    'Use when species is unclear. Distinguish from horse chestnut (Aesculus, inedible).'),
  ('Corylus sp.', 'Hazelnut (unspecified)',
    array['Corylus', 'Hazelnut', 'Filbert'],
    array['nut'],
    'Use when species is unclear (American vs. beaked hazelnut, etc.).'),
  ('Juglans sp.', 'Walnut (unspecified)',
    array['Juglans', 'Walnut'],
    array['nut'],
    'Use when species is unclear. Note that Juglans nigra hulls stain skin/clothing.'),
  ('Rubus sp.', 'Bramble (unspecified)',
    array['Rubus', 'Raspberry', 'Blackberry', 'Bramble'],
    array['fruit'],
    'Use when the bramble species is unclear. Brambles vary in cane structure, prickles, and fruit color — distinguish from inedible look-alikes.')
on conflict (scientific_name) do nothing;

-- Per-region default fruiting windows. Outer envelopes pulled from
-- the typical ranges of the contained species in temperate Northeast
-- conditions. Refine per-species via observations.
with sps as (
  select scientific_name, id from public.species
   where scientific_name in (
     'Carya sp.', 'Vaccinium sp.', 'Prunus sp.', 'Cornus sp.',
     'Castanea sp.', 'Corylus sp.', 'Juglans sp.', 'Rubus sp.'
   )
), defaults(scientific_name, stage, start_doy, end_doy) as (
  values
    -- Hickories: late-spring catkin → fall nut drop.
    ('Carya sp.',     'flowering'::stage, 130, 155),
    ('Carya sp.',     'ripe'::stage,      270, 310),
    -- Blueberries: late spring flowering → midsummer ripening.
    ('Vaccinium sp.', 'flowering'::stage, 130, 160),
    ('Vaccinium sp.', 'green'::stage,     150, 180),
    ('Vaccinium sp.', 'ripening'::stage,  170, 195),
    ('Vaccinium sp.', 'ripe'::stage,      175, 215),
    -- Prunus generic: covers cherries → plums.
    ('Prunus sp.',    'flowering'::stage, 110, 145),
    ('Prunus sp.',    'green'::stage,     130, 175),
    ('Prunus sp.',    'ripening'::stage,  165, 195),
    ('Prunus sp.',    'ripe'::stage,      170, 230),
    -- Cornus mas / officinalis: very early spring flowering.
    ('Cornus sp.',    'flowering'::stage,  80, 110),
    ('Cornus sp.',    'ripe'::stage,      225, 265),
    -- Chestnuts: late summer flowering → late fall nut drop.
    ('Castanea sp.',  'flowering'::stage, 170, 200),
    ('Castanea sp.',  'ripe'::stage,      265, 310),
    -- Hazelnuts: very early catkin in late winter, nuts in fall.
    ('Corylus sp.',   'flowering'::stage,  60,  95),
    ('Corylus sp.',   'ripe'::stage,      235, 290),
    -- Walnuts: spring flowering, fall hulling.
    ('Juglans sp.',   'flowering'::stage, 130, 155),
    ('Juglans sp.',   'ripe'::stage,      270, 310),
    -- Brambles: midsummer ripening; flowering 2-3 weeks earlier.
    ('Rubus sp.',     'flowering'::stage, 145, 175),
    ('Rubus sp.',     'green'::stage,     160, 195),
    ('Rubus sp.',     'ripening'::stage,  175, 200),
    ('Rubus sp.',     'ripe'::stage,      180, 225)
)
insert into public.species_fruiting_windows
  (species_id, region_id, stage, start_doy, end_doy)
select sps.id, r.id, d.stage, d.start_doy, d.end_doy
  from sps
  join defaults d on d.scientific_name = sps.scientific_name
  cross join public.regions r
 where not exists (
   select 1 from public.species_fruiting_windows w
    where w.species_id = sps.id
      and w.region_id  = r.id
      and w.stage      = d.stage
 );
