-- Layer 1 NPN empirical fruiting windows.
--
-- Source: USA-NPN getObservations.json, pheno_class_id=12 (Ripe fruits),
-- CONUS bbox -130,24 to -66,50, years 2018-2025, phenophase_status==1
-- (filtered client-side because the API ignores the query param).
-- Generator: scripts/npn-layer1-calibration.cjs
-- Process documented in data/exploration/layer1-npn-summary.md
--
-- Cells require n_obs >= 30 AND n_sites >= 8 (drop weaker cells).
-- start_doy = max(1, p10 + 14) — the +14d leading-edge offset
-- corrects for NPN volunteers flagging "ripe" ~14d before harvest peak.
-- end_doy   = p90.
-- peak_doy  = median.
--
-- For (species, zone) cells already populated by Layer 2 regional_guide,
-- the regional bracket wins; we only fill in peak_doy when null.
-- For empty cells, this migration inserts a fresh empirical_npn row.
--
-- Dropped species (legume/persistent dry pods that NPN can't tell apart
-- from ripe fruit): Cercis canadensis, Robinia pseudoacacia, Gleditsia triacanthos, Ceratonia siliqua.
-- Ginkgo biloba kept: edible part is the seed sarcotesta with a real ripening signal.

-- Coverage: 61 new empirical cells, 3 peak_doy fill-ins on existing regional_guide rows.

begin;

-- ---- 1. peak_doy fill-ins for existing regional_guide rows where peak_doy IS NULL ----

update public.species_fruiting_windows w set peak_doy = 260,     notes = coalesce(w.notes, '') || ' [Layer 1: peak ' || 260 || ' from NPN n=138, sites=12, range 218-292]' from public.species s, public.climate_zones z where w.species_id = s.id and w.climate_zone_id = z.id and w.stage = 'ripe' and s.scientific_name = 'Juglans nigra' and z.code = '6a' and w.peak_doy is null;
update public.species_fruiting_windows w set peak_doy = 298,     notes = coalesce(w.notes, '') || ' [Layer 1: peak ' || 298 || ' from NPN n=167, sites=11, range 262-326]' from public.species s, public.climate_zones z where w.species_id = s.id and w.climate_zone_id = z.id and w.stage = 'ripe' and s.scientific_name = 'Ginkgo biloba' and z.code = '7b' and w.peak_doy is null;
update public.species_fruiting_windows w set peak_doy = 274,     notes = coalesce(w.notes, '') || ' [Layer 1: peak ' || 274 || ' from NPN n=100, sites=15, range 247-297]' from public.species s, public.climate_zones z where w.species_id = s.id and w.climate_zone_id = z.id and w.stage = 'ripe' and s.scientific_name = 'Juglans nigra' and z.code = '6b' and w.peak_doy is null;

-- ---- 2. New empirical_npn rows for cells with no regional_guide coverage ----

insert into public.species_fruiting_windows
  (species_id, climate_zone_id, stage, start_doy, end_doy, peak_doy, confidence, notes)
select s.id, z.id, 'ripe'::public.stage, t.start_doy, t.end_doy, t.peak_doy,
       'empirical_npn'::public.window_confidence, t.note
from (values
    ('Acer negundo', '7b', 226, 329, 288, 'NPN n=336, sites=11, range 212-329'),
    ('Acer rubrum', '6a', 144, 165, 149, 'NPN n=372, sites=39, range 130-165'),
    ('Acer rubrum', '7b', 109, 141, 113, 'NPN n=258, sites=42, range 95-141'),
    ('Acer rubrum', '8a', 75, 293, 95, 'NPN n=94, sites=20, range 61-293'),
    ('Acer rubrum', '6b', 133, 175, 143, 'NPN n=320, sites=25, range 119-175'),
    ('Acer rubrum', '5b', 148, 162, 148, 'NPN n=151, sites=16, range 134-162'),
    ('Acer rubrum', '7a', 110, 138, 117, 'NPN n=353, sites=36, range 96-138'),
    ('Acer rubrum', '9a', 72, 89, 73, 'NPN n=132, sites=13, range 58-89'),
    ('Acer rubrum', '5a', 158, 266, 166, 'NPN n=74, sites=19, range 144-266'),
    ('Acer rubrum', '9b', 64, 78, 65, 'NPN n=123, sites=9, range 50-78'),
    ('Acer saccharum', '5b', 196, 306, 266, 'NPN n=336, sites=13, range 182-306'),
    ('Acer saccharum', '6b', 88, 321, 262, 'NPN n=2738, sites=29, range 74-321'),
    ('Acer saccharum', '7b', 182, 305, 256, 'NPN n=430, sites=19, range 168-305'),
    ('Acer saccharum', '5a', 195, 289, 263, 'NPN n=99, sites=11, range 181-289'),
    ('Acer saccharum', '7a', 132, 311, 272, 'NPN n=166, sites=12, range 118-311'),
    ('Acer saccharinum', '5a', 148, 227, 146, 'NPN n=113, sites=20, range 134-227'),
    ('Acer saccharinum', '7b', 95, 135, 110, 'NPN n=134, sites=15, range 81-135'),
    ('Acer saccharinum', '6a', 134, 154, 140, 'NPN n=80, sites=9, range 120-154'),
    ('Amelanchier laevis', '6a', 160, 201, 170, 'NPN n=59, sites=9, range 146-201'),
    ('Pinus strobus', '4b', 83, 200, 115, 'NPN n=129, sites=13, range 69-200'),
    ('Pinus strobus', '5a', 84, 285, 196, 'NPN n=97, sites=10, range 70-285'),
    ('Pinus strobus', '7a', 61, 293, 160, 'NPN n=34, sites=13, range 47-293'),
    ('Pinus strobus', '5b', 110, 345, 245, 'NPN n=489, sites=13, range 96-345'),
    ('Pinus strobus', '6b', 158, 325, 281, 'NPN n=104, sites=10, range 144-325'),
    ('Pinus strobus', '6a', 163, 303, 264, 'NPN n=108, sites=15, range 149-303'),
    ('Fagus grandifolia', '7b', 253, 306, 270, 'NPN n=281, sites=8, range 239-306'),
    ('Fagus grandifolia', '5a', 223, 273, 250, 'NPN n=130, sites=13, range 209-273'),
    ('Juglans nigra', '7a', 241, 291, 272, 'NPN n=113, sites=13, range 227-291'),
    ('Lindera benzoin', '7b', 249, 305, 269, 'NPN n=150, sites=10, range 235-305'),
    ('Lindera benzoin', '6b', 252, 306, 263, 'NPN n=50, sites=10, range 238-306'),
    ('Lindera benzoin', '6a', 205, 290, 252, 'NPN n=194, sites=8, range 191-290'),
    ('Lindera benzoin', '7a', 232, 307, 260, 'NPN n=164, sites=9, range 218-307'),
    ('Populus tremuloides', '5b', 123, 173, 131, 'NPN n=51, sites=9, range 109-173'),
    ('Prunus serotina', '6a', 204, 257, 228, 'NPN n=197, sites=12, range 190-257'),
    ('Prunus serotina', '7b', 215, 252, 231, 'NPN n=424, sites=14, range 201-252'),
    ('Prunus serotina', '7a', 219, 256, 232, 'NPN n=89, sites=11, range 205-256'),
    ('Prunus serotina', '6b', 210, 236, 220, 'NPN n=52, sites=10, range 196-236'),
    ('Sambucus nigra', '10b', 179, 262, 203, 'NPN n=593, sites=13, range 165-262'),
    ('Quercus alba', '6a', 257, 291, 270, 'NPN n=132, sites=13, range 243-291'),
    ('Quercus alba', '7a', 259, 310, 278, 'NPN n=223, sites=16, range 245-310'),
    ('Quercus alba', '7b', 241, 303, 274, 'NPN n=188, sites=25, range 227-303'),
    ('Quercus alba', '6b', 261, 291, 268, 'NPN n=529, sites=19, range 247-291'),
    ('Quercus alba', '5a', 239, 271, 245, 'NPN n=48, sites=8, range 225-271'),
    ('Quercus alba', '8a', 262, 311, 288, 'NPN n=91, sites=15, range 248-311'),
    ('Quercus macrocarpa', '5b', 256, 319, 269, 'NPN n=78, sites=9, range 242-319'),
    ('Quercus macrocarpa', '5a', 238, 280, 259, 'NPN n=92, sites=11, range 224-280'),
    ('Quercus macrocarpa', '4b', 243, 296, 265, 'NPN n=33, sites=10, range 229-296'),
    ('Quercus macrocarpa', '6a', 261, 276, 261, 'NPN n=86, sites=9, range 247-276'),
    ('Quercus macrocarpa', '6b', 260, 288, 267, 'NPN n=215, sites=10, range 246-288'),
    ('Taraxacum officinale', '5b', 144, 171, 145, 'NPN n=73, sites=11, range 130-171'),
    ('Taraxacum officinale', '6a', 142, 208, 143, 'NPN n=63, sites=12, range 128-208'),
    ('Taraxacum officinale', '5a', 160, 271, 179, 'NPN n=108, sites=12, range 146-271'),
    ('Tsuga canadensis', '6b', 116, 343, 297, 'NPN n=274, sites=9, range 102-343'),
    ('Tilia americana', '6b', 142, 314, 264, 'NPN n=827, sites=11, range 128-314'),
    ('Vaccinium corymbosum', '6a', 204, 247, 214, 'NPN n=167, sites=10, range 190-247'),
    ('Vaccinium corymbosum', '6b', 192, 240, 203, 'NPN n=599, sites=11, range 178-240'),
    ('Ulmus pumila', '7b', 110, 127, 107, 'NPN n=58, sites=9, range 96-127'),
    ('Acer saccharum', '6a', 197, 311, 259, 'NPN n=388, sites=15, range 183-311'),
    ('Acer saccharum', '4b', 226, 294, 259, 'NPN n=154, sites=8, range 212-294'),
    ('Acer saccharinum', '6b', 127, 151, 132, 'NPN n=53, sites=8, range 113-151'),
    ('Picea glauca', '4b', 93, 125, 110, 'NPN n=82, sites=13, range 79-125')
  ) as t(sci, zone, start_doy, end_doy, peak_doy, note)
  join public.species s on s.scientific_name = t.sci
  join public.climate_zones z on z.code = t.zone
on conflict do nothing;

commit;
