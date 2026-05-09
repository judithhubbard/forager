# Layer 1 USA-NPN Empirical Window Summary

**Date:** 2026-05-09

## Inputs

- Forageable species in catalog: 174
- Matched to an NPN species_id: 87
- Dropped (legume/persistent-pod): 4 (Ceratonia siliqua, Cercis canadensis, Gleditsia triacanthos, Robinia pseudoacacia)
- No NPN match: 83

## NPN observation pull

- CONUS bbox -130,24 to -66,50, years 2018-2025, pheno_class_id=12.
- Raw observations returned: 536686
- After client-side filter `phenophase_status==1`: 30500
- Fetch errors (non-fatal, partial result): 0

## Aggregation

- (species, zone) cells with any data: 428
- Cells passing n_obs>=30 AND n_sites>=8: 64
- New empirical_npn rows emitted: 61
- Peak_doy fill-ins on existing regional_guide rows: 3
- Cells skipped because regional_guide already has peak_doy filled: see migration comments

## Per-species coverage

| Species | NPN obs (status=1) | Cells passed | Zones covered |
|---|---:|---:|---|
| _Acer saccharum_ | 4355 | 7 | 5b, 6b, 7b, 5a, 7a, 6a, 4b |
| _Acer rubrum_ | 1962 | 9 | 6a, 7b, 8a, 6b, 5b, 7a, 9a, 5a, 9b |
| _Tilia americana_ | 1532 | 1 | 6b |
| _Quercus alba_ | 1362 | 6 | 6a, 7a, 7b, 6b, 5a, 8a |
| _Acer negundo_ | 1146 | 1 | 7b |
| _Prunus serotina_ | 1108 | 4 | 6a, 7b, 7a, 6b |
| _Olea europaea_ | 1081 | 0 | — |
| _Fagus grandifolia_ | 998 | 2 | 7b, 5a |
| _Pinus strobus_ | 968 | 6 | 4b, 5a, 7a, 5b, 6b, 6a |
| _Rhus typhina_ | 957 | 0 | — |
| _Sambucus nigra_ | 899 | 1 | 10b |
| _Tsuga canadensis_ | 868 | 1 | 6b |
| _Taraxacum officinale_ | 818 | 3 | 5b, 6a, 5a |
| _Vaccinium corymbosum_ | 818 | 2 | 6a, 6b |
| _Quercus macrocarpa_ | 732 | 5 | 5b, 5a, 4b, 6a, 6b |
| _Ginkgo biloba_ | 684 | 1 | 7b |
| _Vitis vinifera_ | 655 | 0 | — |
| _Fraxinus pennsylvanica_ | 613 | 0 | — |
| _Lindera benzoin_ | 561 | 4 | 7b, 6b, 6a, 7a |
| _Cydonia oblonga_ | 544 | 0 | — |
| _Juglans nigra_ | 530 | 3 | 7a, 6a, 6b |
| _Acer saccharinum_ | 466 | 4 | 5a, 7b, 6a, 6b |
| _Celtis occidentalis_ | 413 | 0 | — |
| _Pinus edulis_ | 372 | 0 | — |
| _Carya ovata_ | 359 | 0 | — |
| _Picea glauca_ | 334 | 1 | 4b |
| _Amelanchier arborea_ | 320 | 0 | — |
| _Diospyros virginiana_ | 285 | 0 | — |
| _Prunus virginiana_ | 282 | 0 | — |
| _Gaultheria shallon_ | 267 | 0 | — |
| _Vaccinium angustifolium_ | 246 | 0 | — |
| _Fraxinus americana_ | 206 | 0 | — |
| _Tilia cordata_ | 188 | 0 | — |
| _Pyrus communis_ | 185 | 0 | — |
| _Gaultheria procumbens_ | 180 | 0 | — |
| _Sassafras albidum_ | 174 | 0 | — |
| _Achillea millefolium_ | 171 | 0 | — |
| _Ulmus americana_ | 171 | 0 | — |
| _Prunus americana_ | 157 | 0 | — |
| _Prunus maritima_ | 157 | 0 | — |
| _Amelanchier canadensis_ | 143 | 0 | — |
| _Rosa rugosa_ | 142 | 0 | — |
| _Asparagus officinalis_ | 136 | 0 | — |
| _Carya illinoinensis_ | 132 | 0 | — |
| _Vaccinium macrocarpon_ | 129 | 0 | — |
| _Vaccinium ovatum_ | 118 | 0 | — |
| _Prunus persica_ | 108 | 0 | — |
| _Rubus spectabilis_ | 103 | 0 | — |
| _Malus domestica_ | 98 | 0 | — |
| _Populus tremuloides_ | 94 | 1 | 5b |
| _Ulmus pumila_ | 92 | 1 | 7b |
| _Aronia melanocarpa_ | 91 | 0 | — |
| _Fraxinus nigra_ | 88 | 0 | — |
| _Amelanchier laevis_ | 84 | 1 | 6a |
| _Galium aparine_ | 84 | 0 | — |
| _Corylus cornuta_ | 82 | 0 | — |
| _Pinus contorta_ | 67 | 0 | — |
| _Asimina triloba_ | 57 | 0 | — |
| _Morus rubra_ | 56 | 0 | — |
| _Castanea dentata_ | 51 | 0 | — |
| _Corylus americana_ | 42 | 0 | — |
| _Rubus idaeus_ | 42 | 0 | — |
| _Rubus parviflorus_ | 34 | 0 | — |
| _Prunus armeniaca_ | 24 | 0 | — |
| _Elaeagnus umbellata_ | 16 | 0 | — |
| _Prunus dulcis_ | 15 | 0 | — |
| _Prunus cerasus_ | 12 | 0 | — |
| _Stellaria media_ | 11 | 0 | — |
| _Ribes rubrum_ | 11 | 0 | — |
| _Allium tricoccum_ | 11 | 0 | — |
| _Morus alba_ | 11 | 0 | — |
| _Hemerocallis fulva_ | 8 | 0 | — |
| _Coccoloba uvifera_ | 7 | 0 | — |
| _Urtica dioica_ | 7 | 0 | — |
| _Rubus phoenicolasius_ | 3 | 0 | — |
| _Cornus officinalis_ | 2 | 0 | — |
| _Prunus domestica_ | 2 | 0 | — |
| _Persea americana_ | 1 | 0 | — |
| _Nasturtium officinale_ | 1 | 0 | — |

## Coverage gaps: matched in NPN but no usable data

Species had < 30 obs OR < 8 sites in every zone. They contribute nothing to this migration.

- _Achillea millefolium_ (NPN id 144, 171 ripe obs)
- _Allium tricoccum_ (NPN id 1800, 11 ripe obs)
- _Amelanchier arborea_ (NPN id 1431, 320 ripe obs)
- _Amelanchier canadensis_ (NPN id 64, 143 ripe obs)
- _Aronia melanocarpa_ (NPN id 1849, 91 ripe obs)
- _Asimina triloba_ (NPN id 1201, 57 ripe obs)
- _Asparagus officinalis_ (NPN id 803, 136 ripe obs)
- _Carya illinoinensis_ (NPN id 824, 132 ripe obs)
- _Carya ovata_ (NPN id 68, 359 ripe obs)
- _Castanea dentata_ (NPN id 724, 51 ripe obs)
- _Castanea sativa_ (NPN id 2232, 0 ripe obs)
- _Celtis occidentalis_ (NPN id 829, 413 ripe obs)
- _Coccoloba uvifera_ (NPN id 837, 7 ripe obs)
- _Cornus mas_ (NPN id 2240, 0 ripe obs)
- _Cornus officinalis_ (NPN id 1447, 2 ripe obs)
- _Corylus americana_ (NPN id 71, 42 ripe obs)
- _Corylus cornuta_ (NPN id 72, 82 ripe obs)
- _Cydonia oblonga_ (NPN id 1345, 544 ripe obs)
- _Diospyros kaki_ (NPN id 2247, 0 ripe obs)
- _Diospyros virginiana_ (NPN id 303, 285 ripe obs)
- _Elaeagnus umbellata_ (NPN id 1857, 16 ripe obs)
- _Fraxinus americana_ (NPN id 74, 206 ripe obs)
- _Fraxinus nigra_ (NPN id 873, 88 ripe obs)
- _Fraxinus pennsylvanica_ (NPN id 75, 613 ripe obs)
- _Galium aparine_ (NPN id 2136, 84 ripe obs)
- _Gaultheria procumbens_ (NPN id 879, 180 ripe obs)
- _Gaultheria shallon_ (NPN id 311, 267 ripe obs)
- _Hemerocallis fulva_ (NPN id 890, 8 ripe obs)
- _Juglans ailantifolia_ (NPN id 2259, 0 ripe obs)
- _Juglans cinerea_ (NPN id 2143, 0 ripe obs)
- _Juglans regia_ (NPN id 2260, 0 ripe obs)
- _Malus domestica_ (NPN id 83, 98 ripe obs)
- _Morus alba_ (NPN id 2266, 11 ripe obs)
- _Morus rubra_ (NPN id 2007, 56 ripe obs)
- _Nasturtium officinale_ (NPN id 998, 1 ripe obs)
- _Olea europaea_ (NPN id 1360, 1081 ripe obs)
- _Persea americana_ (NPN id 124, 1 ripe obs)
- _Pinus contorta_ (NPN id 762, 67 ripe obs)
- _Pinus edulis_ (NPN id 50, 372 ripe obs)
- _Prunus americana_ (NPN id 206, 157 ripe obs)
- _Prunus armeniaca_ (NPN id 1362, 24 ripe obs)
- _Prunus cerasus_ (NPN id 1753, 12 ripe obs)
- _Prunus domestica_ (NPN id 1363, 2 ripe obs)
- _Prunus dulcis_ (NPN id 86, 15 ripe obs)
- _Prunus maritima_ (NPN id 982, 157 ripe obs)
- _Prunus persica_ (NPN id 88, 108 ripe obs)
- _Prunus virginiana_ (NPN id 29, 282 ripe obs)
- _Pyrus communis_ (NPN id 1364, 185 ripe obs)
- _Pyrus pyrifolia_ (NPN id 2273, 0 ripe obs)
- _Rhus typhina_ (NPN id 315, 957 ripe obs)
- _Ribes rubrum_ (NPN id 1759, 11 ripe obs)
- _Rosa rugosa_ (NPN id 314, 142 ripe obs)
- _Rubus idaeus_ (NPN id 1762, 42 ripe obs)
- _Rubus parviflorus_ (NPN id 321, 34 ripe obs)
- _Rubus phoenicolasius_ (NPN id 1873, 3 ripe obs)
- _Rubus spectabilis_ (NPN id 719, 103 ripe obs)
- _Sassafras albidum_ (NPN id 1019, 174 ripe obs)
- _Stellaria media_ (NPN id 1879, 11 ripe obs)
- _Tilia cordata_ (NPN id 1775, 188 ripe obs)
- _Ulmus americana_ (NPN id 1048, 171 ripe obs)
- _Urtica dioica_ (NPN id 1050, 7 ripe obs)
- _Vaccinium angustifolium_ (NPN id 1503, 246 ripe obs)
- _Vaccinium macrocarpon_ (NPN id 1055, 129 ripe obs)
- _Vaccinium ovatum_ (NPN id 1057, 118 ripe obs)
- _Vitis labrusca_ (NPN id 1066, 0 ripe obs)
- _Vitis vinifera_ (NPN id 96, 655 ripe obs)

## Coverage gaps: not in NPN at all

- _Acca sellowiana_
- _Acer ginnala_
- _Actinidia deliciosa_
- _Allium canadense_
- _Allium tuberosum_
- _Allium vineale_
- _Amelanchier sp._
- _Annona cherimola_
- _Annona squamosa_
- _Apios americana_
- _Arctium minus_
- _Auricularia auricula-judae_
- _Boletus edulis_
- _Cantharellus cibarius_
- _Carica papaya_
- _Carissa macrocarpa_
- _Carya laciniosa_
- _Carya sp._
- _Casimiroa edulis_
- _Castanea mollissima_
- _Castanea pumila_
- _Castanea sp._
- _Chenopodium album_
- _Citrus aurantium_
- _Citrus limon_
- _Citrus medica_
- _Citrus paradisi_
- _Citrus reticulata_
- _Citrus sinensis_
- _Citrus sp._
- _Coprinus comatus_
- _Cornus sp._
- _Corylus sp._
- _Crataegus sp._
- _Eriobotrya japonica_
- _Eugenia uniflora_
- _Ficus carica_
- _Fortunella japonica_
- _Grifola frondosa_
- _Helianthus tuberosus_
- _Hericium erinaceus_
- _Juglans sp._
- _Laetiporus sulphureus_
- _Larix sibirica_
- _Laurus nobilis_
- _Litchi chinensis_
- _Macadamia integrifolia_
- _Macadamia tetraphylla_
- _Mahonia aquifolium_
- _Mahonia repens_
- _Mangifera indica_
- _Mentha_
- _Morchella esculenta_
- _Opuntia ficus-indica_
- _Phoenix canariensis_
- _Phoenix dactylifera_
- _Phoenix sp._
- _Picea pungens_
- _Picea sp._
- _Pinus sp._
- _Pinus sylvestris_
- _Plantago major_
- _Pleurotus ostreatus_
- _Portulaca oleracea_
- _Prunus avium_
- _Prunus pumila_
- _Prunus salicina_
- _Prunus sp._
- _Psidium guajava_
- _Punica granatum_
- _Pyrus ussuriensis_
- _Ribes nigrum_
- _Rubus allegheniensis_
- _Rubus occidentalis_
- _Rubus sp._
- _Sambucus canadensis_
- _Sambucus cerulea_
- _Schinus molle_
- _Smilax sp._
- _Syringa reticulata_
- _Vaccinium sp._
- _Vitis riparia_
- _Yucca filamentosa_

## Method notes

- `start_doy = max(1, p10 + 14)` to correct the prior-validated 14d
  early-flagging bias of NPN volunteers vs forager harvest peak.
- `end_doy = p90`; `peak_doy = median`.
- Layer 2 regional_guide cells take precedence for the bracket; this
  layer only fills `peak_doy` on those rows when it was null.
- `Cercis canadensis`, `Robinia pseudoacacia`, `Gleditsia triacanthos`,
  `Ceratonia siliqua` dropped: dry pods persist year-round and NPN
  observers cannot reliably distinguish ripe from dropped/dehiscing.
- `Ginkgo biloba` kept: the edible sarcotesta has a true ripening signal.
- Frost-anchoring NOT used: prior validation showed it does not tighten
  variance (data/exploration/npn-validation-NE-frost-anchored.md).
