-- Replace AI-derived species_fruiting_windows with Layer 2
-- regional-guide data extracted from CityFruit (Seattle), Hidden
-- Harvest (Ottawa), Not Far From The Tree (Toronto), Philadelphia
-- Orchard Project, and UCANR (California). 74 cells across 5 regions
-- expanded across each region's zone codes = 104 rows.
--
-- Source: data/exploration/regional-windows-v1.json
-- Provenance: each row carries its origin region + source guide in notes.
--
-- Replaces 3,322 rows of AI-seeded data (45 species in zone 5b from
-- data/species/ithaca.json, then heuristically frost-shifted to other
-- zones). The previous data wasn't expert-curated despite being
-- labeled 'curated' — see prior conversation in commit history.
--
-- Most species x zone combinations now have NO row, which the
-- harvest-window UI honestly renders as "no data for your region."
-- That's the intended state until Layer 1 (NPN empirical medians)
-- lands.
--
-- Species in the regional guides but absent from our species
-- catalog are skipped (see commit message for the list — they're
-- mostly cultivated fruit cultivars that should be added in a
-- follow-up).

-- Add new confidence values to the existing enum.
alter type public.window_confidence add value if not exists 'regional_guide';
alter type public.window_confidence add value if not exists 'empirical_npn';
alter type public.window_confidence add value if not exists 'expert_verified';

-- Wipe the AI-derived data.
truncate public.species_fruiting_windows;

-- Insert Layer 2 regional-guide cells. Each (species, zone) pair is
-- one row. Lookups via scientific_name + zone code so we don't hard-
-- code UUIDs.

insert into public.species_fruiting_windows
  (species_id, climate_zone_id, stage, start_doy, end_doy, confidence, notes)
select s.id, z.id, 'ripe'::public.stage, t.sd, t.ed,
       'regional_guide'::public.window_confidence, t.note
from (values
    ('Malus domestica', '8a', 182, 334, 'Seattle metro — JUL-NOV per guide; Transparent variety ripens late June, span covers many cultivars'),
    ('Malus domestica', '8b', 182, 334, 'Seattle metro — JUL-NOV per guide; Transparent variety ripens late June, span covers many cultivars'),
    ('Pyrus communis', '8a', 213, 304, 'Seattle metro — AUG-OCT per guide (European pears, picked unripe to ripen off-tree)'),
    ('Pyrus communis', '8b', 213, 304, 'Seattle metro — AUG-OCT per guide (European pears, picked unripe to ripen off-tree)'),
    ('Ficus carica', '8a', 213, 273, 'Seattle metro — AUG-SEP per guide; main crop only'),
    ('Ficus carica', '8b', 213, 273, 'Seattle metro — AUG-SEP per guide; main crop only'),
    ('Diospyros kaki', '8a', 274, 365, 'Seattle metro — OCT-DEC per guide'),
    ('Diospyros kaki', '8b', 274, 365, 'Seattle metro — OCT-DEC per guide'),
    ('Diospyros virginiana', '8a', 274, 365, 'Seattle metro — OCT-DEC per guide; co-listed with kaki'),
    ('Diospyros virginiana', '8b', 274, 365, 'Seattle metro — OCT-DEC per guide; co-listed with kaki'),
    ('Amelanchier canadensis', '5a', 161, 191, 'Ottawa metro — Mid-June to mid-July (serviceberries)'),
    ('Amelanchier canadensis', '5b', 161, 191, 'Ottawa metro — Mid-June to mid-July (serviceberries)'),
    ('Morus rubra', '5a', 171, 222, 'Ottawa metro — Late June to early August'),
    ('Morus rubra', '5b', 171, 222, 'Ottawa metro — Late June to early August'),
    ('Malus domestica', '5a', 202, 304, 'Ottawa metro — Late July to late October; Ottawa-localized, matches NFFTT Toronto'),
    ('Malus domestica', '5b', 202, 304, 'Ottawa metro — Late July to late October; Ottawa-localized, matches NFFTT Toronto'),
    ('Pyrus communis', '5a', 222, 273, 'Ottawa metro — Mid-August to late September'),
    ('Pyrus communis', '5b', 222, 273, 'Ottawa metro — Mid-August to late September'),
    ('Vitis riparia', '5a', 222, 253, 'Ottawa metro — Mid-August to mid-September'),
    ('Vitis riparia', '5b', 222, 253, 'Ottawa metro — Mid-August to mid-September'),
    ('Sambucus canadensis', '5a', 222, 253, 'Ottawa metro — Mid-August to mid-September (American elderberry; raw berries toxic)'),
    ('Sambucus canadensis', '5b', 222, 253, 'Ottawa metro — Mid-August to mid-September (American elderberry; raw berries toxic)'),
    ('Malus domestica', '6a', 202, 304, 'Toronto metro — Late July to late October'),
    ('Malus domestica', '6b', 202, 304, 'Toronto metro — Late July to late October'),
    ('Juglans nigra', '6a', 253, 304, 'Toronto metro — Mid-September to late October'),
    ('Juglans nigra', '6b', 253, 304, 'Toronto metro — Mid-September to late October'),
    ('Sambucus canadensis', '6a', 222, 253, 'Toronto metro — Mid-August to mid-September'),
    ('Sambucus canadensis', '6b', 222, 253, 'Toronto metro — Mid-August to mid-September'),
    ('Vitis riparia', '6a', 222, 253, 'Toronto metro — Mid-August to mid-September'),
    ('Vitis riparia', '6b', 222, 253, 'Toronto metro — Mid-August to mid-September'),
    ('Morus rubra', '6a', 171, 222, 'Toronto metro — Late June to early August'),
    ('Morus rubra', '6b', 171, 222, 'Toronto metro — Late June to early August'),
    ('Asimina triloba', '6a', 253, 283, 'Toronto metro — Mid-September to mid-October'),
    ('Asimina triloba', '6b', 253, 283, 'Toronto metro — Mid-September to mid-October'),
    ('Pyrus communis', '6a', 222, 273, 'Toronto metro — Mid-August to late September'),
    ('Pyrus communis', '6b', 222, 273, 'Toronto metro — Mid-August to late September'),
    ('Amelanchier canadensis', '6a', 161, 191, 'Toronto metro — Mid-June to mid-July'),
    ('Amelanchier canadensis', '6b', 161, 191, 'Toronto metro — Mid-June to mid-July'),
    ('Rubus idaeus', '7a', 152, 273, 'Philadelphia metro — JUN-SEP per calendar; everbearing extends to OCT'),
    ('Rubus idaeus', '7b', 152, 273, 'Philadelphia metro — JUN-SEP per calendar; everbearing extends to OCT'),
    ('Vaccinium corymbosum', '7a', 152, 212, 'Philadelphia metro — JUN-JUL per calendar'),
    ('Vaccinium corymbosum', '7b', 152, 212, 'Philadelphia metro — JUN-JUL per calendar'),
    ('Amelanchier canadensis', '7a', 152, 181, 'Philadelphia metro — JUN per calendar (juneberry)'),
    ('Amelanchier canadensis', '7b', 152, 181, 'Philadelphia metro — JUN per calendar (juneberry)'),
    ('Ribes rubrum', '7a', 152, 212, 'Philadelphia metro — JUN-JUL per calendar (currants)'),
    ('Ribes rubrum', '7b', 152, 212, 'Philadelphia metro — JUN-JUL per calendar (currants)'),
    ('Ribes nigrum', '7a', 152, 212, 'Philadelphia metro — JUN-JUL per calendar (currants)'),
    ('Ribes nigrum', '7b', 152, 212, 'Philadelphia metro — JUN-JUL per calendar (currants)'),
    ('Rubus allegheniensis', '7a', 182, 243, 'Philadelphia metro — JUL-AUG per calendar (blackberry)'),
    ('Rubus allegheniensis', '7b', 182, 243, 'Philadelphia metro — JUL-AUG per calendar (blackberry)'),
    ('Morus rubra', '7a', 182, 212, 'Philadelphia metro — JUL per calendar'),
    ('Morus rubra', '7b', 182, 212, 'Philadelphia metro — JUL per calendar'),
    ('Ficus carica', '7a', 213, 273, 'Philadelphia metro — AUG-SEP per calendar'),
    ('Ficus carica', '7b', 213, 273, 'Philadelphia metro — AUG-SEP per calendar'),
    ('Sambucus canadensis', '7a', 213, 243, 'Philadelphia metro — AUG per calendar'),
    ('Sambucus canadensis', '7b', 213, 243, 'Philadelphia metro — AUG per calendar'),
    ('Malus domestica', '7a', 244, 304, 'Philadelphia metro — SEP-OCT per calendar'),
    ('Malus domestica', '7b', 244, 304, 'Philadelphia metro — SEP-OCT per calendar'),
    ('Pyrus communis', '7a', 244, 304, 'Philadelphia metro — SEP-OCT per calendar'),
    ('Pyrus communis', '7b', 244, 304, 'Philadelphia metro — SEP-OCT per calendar'),
    ('Asimina triloba', '7a', 244, 273, 'Philadelphia metro — SEP per calendar'),
    ('Asimina triloba', '7b', 244, 273, 'Philadelphia metro — SEP per calendar'),
    ('Punica granatum', '7a', 244, 273, 'Philadelphia metro — SEP per calendar'),
    ('Punica granatum', '7b', 244, 273, 'Philadelphia metro — SEP per calendar'),
    ('Diospyros virginiana', '7a', 274, 334, 'Philadelphia metro — OCT-NOV per calendar'),
    ('Diospyros virginiana', '7b', 274, 334, 'Philadelphia metro — OCT-NOV per calendar'),
    ('Diospyros kaki', '7a', 274, 334, 'Philadelphia metro — OCT-NOV per calendar; co-listed with native'),
    ('Diospyros kaki', '7b', 274, 334, 'Philadelphia metro — OCT-NOV per calendar; co-listed with native'),
    ('Citrus limon', '8b', 1, 365, 'California (UCANR statewide) — Year-round in CA; calendar lists JAN-MAY peak but available throughout'),
    ('Citrus limon', '9a', 1, 365, 'California (UCANR statewide) — Year-round in CA; calendar lists JAN-MAY peak but available throughout'),
    ('Citrus limon', '9b', 1, 365, 'California (UCANR statewide) — Year-round in CA; calendar lists JAN-MAY peak but available throughout'),
    ('Citrus limon', '10a', 1, 365, 'California (UCANR statewide) — Year-round in CA; calendar lists JAN-MAY peak but available throughout'),
    ('Citrus sinensis', '8b', 1, 334, 'California (UCANR statewide) — Navel JAN-APR; Valencia MAY-NOV; combined window'),
    ('Citrus sinensis', '9a', 1, 334, 'California (UCANR statewide) — Navel JAN-APR; Valencia MAY-NOV; combined window'),
    ('Citrus sinensis', '9b', 1, 334, 'California (UCANR statewide) — Navel JAN-APR; Valencia MAY-NOV; combined window'),
    ('Citrus sinensis', '10a', 1, 334, 'California (UCANR statewide) — Navel JAN-APR; Valencia MAY-NOV; combined window'),
    ('Citrus paradisi', '8b', 60, 334, 'California (UCANR statewide) — MAR-NOV per calendar'),
    ('Citrus paradisi', '9a', 60, 334, 'California (UCANR statewide) — MAR-NOV per calendar'),
    ('Citrus paradisi', '9b', 60, 334, 'California (UCANR statewide) — MAR-NOV per calendar'),
    ('Citrus paradisi', '10a', 60, 334, 'California (UCANR statewide) — MAR-NOV per calendar'),
    ('Citrus reticulata', '8b', 1, 90, 'California (UCANR statewide) — JAN-MAR per calendar (tangerines/tangelos)'),
    ('Citrus reticulata', '9a', 1, 90, 'California (UCANR statewide) — JAN-MAR per calendar (tangerines/tangelos)'),
    ('Citrus reticulata', '9b', 1, 90, 'California (UCANR statewide) — JAN-MAR per calendar (tangerines/tangelos)'),
    ('Citrus reticulata', '10a', 1, 90, 'California (UCANR statewide) — JAN-MAR per calendar (tangerines/tangelos)'),
    ('Persea americana', '8b', 1, 365, 'California (UCANR statewide) — Year-round in CA with JAN-MAY peak'),
    ('Persea americana', '9a', 1, 365, 'California (UCANR statewide) — Year-round in CA with JAN-MAY peak'),
    ('Persea americana', '9b', 1, 365, 'California (UCANR statewide) — Year-round in CA with JAN-MAY peak'),
    ('Persea americana', '10a', 1, 365, 'California (UCANR statewide) — Year-round in CA with JAN-MAY peak'),
    ('Malus domestica', '8b', 182, 334, 'California (UCANR statewide) — JUL-NOV per calendar'),
    ('Malus domestica', '9a', 182, 334, 'California (UCANR statewide) — JUL-NOV per calendar'),
    ('Malus domestica', '9b', 182, 334, 'California (UCANR statewide) — JUL-NOV per calendar'),
    ('Malus domestica', '10a', 182, 334, 'California (UCANR statewide) — JUL-NOV per calendar'),
    ('Ficus carica', '8b', 182, 304, 'California (UCANR statewide) — JUL-OCT per calendar; covers both breba and main crop'),
    ('Ficus carica', '9a', 182, 304, 'California (UCANR statewide) — JUL-OCT per calendar; covers both breba and main crop'),
    ('Ficus carica', '9b', 182, 304, 'California (UCANR statewide) — JUL-OCT per calendar; covers both breba and main crop'),
    ('Ficus carica', '10a', 182, 304, 'California (UCANR statewide) — JUL-OCT per calendar; covers both breba and main crop'),
    ('Pyrus communis', '8b', 182, 334, 'California (UCANR statewide) — JUL-NOV per calendar'),
    ('Pyrus communis', '9a', 182, 334, 'California (UCANR statewide) — JUL-NOV per calendar'),
    ('Pyrus communis', '9b', 182, 334, 'California (UCANR statewide) — JUL-NOV per calendar'),
    ('Pyrus communis', '10a', 182, 334, 'California (UCANR statewide) — JUL-NOV per calendar'),
    ('Diospyros kaki', '8b', 182, 334, 'California (UCANR statewide) — JUL/NOV per calendar; Japanese persimmon dominant in CA'),
    ('Diospyros kaki', '9a', 182, 334, 'California (UCANR statewide) — JUL/NOV per calendar; Japanese persimmon dominant in CA'),
    ('Diospyros kaki', '9b', 182, 334, 'California (UCANR statewide) — JUL/NOV per calendar; Japanese persimmon dominant in CA'),
    ('Diospyros kaki', '10a', 182, 334, 'California (UCANR statewide) — JUL/NOV per calendar; Japanese persimmon dominant in CA')
) as t(sci, zone, sd, ed, note)
join public.species s on s.scientific_name = t.sci
join public.climate_zones z on z.code = t.zone;
