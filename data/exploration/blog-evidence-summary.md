# Blog-Evidence Crawl Summary (lifetime delta)

**Run:** 2026-05-09T23:08:13.507Z
**Generator:** scripts/blog-evidence-crawl.cjs

**Species processed:** 73
**Reached >=3 sources:** 73
**Still under 3:** 0
**Total catalog entries:** 176 (curated foraging-blog quotes across 73 species)
**Evidence entries appended to DB:** ~190 across the run iterations
**Total evidence entries currently in `species_fruiting_windows.evidence`:** 694
**Cached blog HTML files:** 164 in `data/exploration/blog-cache/`

## Per-species delta (starting -> ending source count)

### Starting source count = 0 (37 species)
- Actinidia deliciosa: 0 -> 3 OK
- Amelanchier canadensis: 0 -> 3 OK
- Amelanchier laevis: 0 -> 3 OK
- Citrus limon: 0 -> 3 OK
- Citrus paradisi: 0 -> 3 OK
- Citrus reticulata: 0 -> 3 OK
- Citrus sinensis: 0 -> 3 OK
- Cydonia oblonga: 0 -> 3 OK
- Diospyros kaki: 0 -> 3 OK
- Fagus grandifolia: 0 -> 3 OK
- Ficus carica: 0 -> 3 OK
- Ginkgo biloba: 0 -> 3 OK
- Juglans nigra: 0 -> 3 OK
- Malus domestica: 0 -> 3 OK
- Morchella esculenta: 0 -> 3 OK
- Persea americana: 0 -> 3 OK
- Picea glauca: 0 -> 3 OK
- Pinus strobus: 0 -> 3 OK
- Populus tremuloides: 0 -> 3 OK
- Prunus armeniaca: 0 -> 3 OK
- Prunus avium: 0 -> 3 OK
- Prunus cerasus: 0 -> 3 OK
- Prunus domestica: 0 -> 3 OK
- Prunus persica: 0 -> 3 OK
- Prunus salicina: 0 -> 3 OK
- Punica granatum: 0 -> 3 OK
- Pyrus communis: 0 -> 3 OK
- Pyrus pyrifolia: 0 -> 3 OK
- Quercus alba: 0 -> 3 OK
- Quercus macrocarpa: 0 -> 3 OK
- Sambucus nigra: 0 -> 3 OK
- Taraxacum officinale: 0 -> 3 OK
- Tilia americana: 0 -> 3 OK
- Tsuga canadensis: 0 -> 3 OK
- Ulmus pumila: 0 -> 3 OK
- Vitis labrusca: 0 -> 3 OK
- Vitis vinifera: 0 -> 3 OK

### Starting source count = 1 (24 species)
- Allium tricoccum: 1 -> 3 OK
- Asparagus officinalis: 1 -> 3 OK
- Carya laciniosa: 1 -> 3 OK
- Carya ovata: 1 -> 3 OK
- Castanea dentata: 1 -> 3 OK
- Corylus cornuta: 1 -> 3 OK
- Helianthus tuberosus: 1 -> 3 OK
- Juglans cinerea: 1 -> 3 OK
- Morus rubra: 1 -> 3 OK
- Prunus americana: 1 -> 3 OK
- Prunus maritima: 1 -> 3 OK
- Prunus serotina: 1 -> 3 OK
- Prunus virginiana: 1 -> 3 OK
- Ribes nigrum: 1 -> 3 OK
- Ribes rubrum: 1 -> 3 OK
- Rubus allegheniensis: 1 -> 3 OK
- Rubus occidentalis: 1 -> 3 OK
- Rubus phoenicolasius: 1 -> 3 OK
- Sambucus canadensis: 1 -> 3 OK
- Vaccinium angustifolium: 1 -> 3 OK
- Vaccinium corymbosum: 1 -> 3 OK
- Vaccinium macrocarpon: 1 -> 3 OK
- Vaccinium sp.: 1 -> 3 OK
- Vitis riparia: 1 -> 3 OK

### Starting source count = 2 (12 species)
- Acer ginnala: 2 -> 3 OK
- Acer negundo: 2 -> 3 OK
- Acer rubrum: 2 -> 3 OK
- Acer saccharinum: 2 -> 3 OK
- Acer saccharum: 2 -> 3 OK
- Aronia melanocarpa: 2 -> 3 OK
- Asimina triloba: 2 -> 3 OK
- Corylus americana: 2 -> 3 OK
- Diospyros virginiana: 2 -> 3 OK
- Lindera benzoin: 2 -> 3 OK
- Rubus idaeus: 2 -> 3 OK
- Sassafras albidum: 2 -> 3 OK

## Method notes

- Evidence entries were curated from web-search results pointing to foraging-blog and extension-service URLs. The Catalog in scripts/blog-evidence-crawl.cjs lists the verbatim quote, the source URL, and the matched climate-zone region for each entry.
- Each entry is appended to ONE existing row per species (the row whose climate zone best matches the blog's stated region). For species whose canonical stage is `sap_run` (maples), `leaf` (greens, conifers), or `mushroom` (morels), evidence is attached to the most-populous stage rather than `ripe`.
- DOY values, peak_doy, and confidence are NOT modified by this script. Only the `evidence` JSONB array is appended to.
- Idempotent: re-runs skip URLs already present in any row of the species' evidence array.
- All blog HTML cached to data/exploration/blog-cache/.

## Source URLs cached (per species)

See per-run log written by the script for the latest fetch status (CACHED/OK/MISS).
## Final source list per species

### Acer ginnala (Amur maple)
Sources (3): `Cornell Maple Program`, `Minnesota Wildflowers`, `Vermont Maple Sugar Makers Association`

### Acer negundo (Box elder)
Sources (3): `Cornell Maple Program`, `DIYself.blog`, `Vermont Maple Sugar Makers Association`

### Acer rubrum (Red maple)
Sources (3): `Cornell Maple Program`, `University of Maine Cooperative Extension`, `Vermont Maple Sugar Makers Association`

### Acer saccharinum (Silver maple)
Sources (3): `Cornell Maple Program`, `St. Lawrence Nurseries`, `Vermont Maple Sugar Makers Association`

### Acer saccharum (Sugar maple)
Sources (3): `Cornell Maple Program`, `University of Maine Cooperative Extension`, `Vermont Maple Sugar Makers Association`

### Actinidia deliciosa (Kiwifruit)
Sources (3): `Gardenia.net`, `UC ANR Small Farms Network`, `Wikipedia`

### Allium tricoccum (Ramps)
Sources (3): `Penn State Extension`, `Practical Self Reliance`, `Wikipedia`

### Amelanchier canadensis (Eastern serviceberry)
Sources (3): `Backyard Forager`, `Practical Self Reliance`, `Tyrant Farms`

### Amelanchier laevis (Allegheny serviceberry)
Sources (3): `Backyard Forager`, `Northern Woodlands`, `Practical Self Reliance`

### Aronia melanocarpa (Black chokeberry)
Sources (3): `Forager Chef`, `USDA NRCS Plant Guide (Aronia melanocarpa)`, `Wikipedia`

### Asimina triloba (Pawpaw)
Sources (3): `Penn State Arboretum`, `USDA NRCS Plant Guide (Asimina triloba)`, `Wikipedia`

### Asparagus officinalis (Wild asparagus)
Sources (3): `Honest Food (Hank Shaw)`, `Practical Self Reliance`, `Wikipedia`

### Carya laciniosa (Shellbark hickory)
Sources (3): `Hardy Fruit Tree Nursery`, `NC State Extension`, `USDA NRCS Plant Guide (Carya laciniosa)`

### Carya ovata (Shagbark hickory)
Sources (3): `Forager Chef`, `Northern Woodlands`, `Wikipedia`

### Castanea dentata (American chestnut)
Sources (3): `Practical Self Reliance`, `The American Chestnut Foundation (GA)`, `Wikipedia`

### Citrus limon (Lemon)
Sources (3): `Four Winds Growers`, `UC ANR Marin Master Gardeners`, `Wikipedia`

### Citrus paradisi (Grapefruit)
Sources (3): `Florida Citrus Growers`, `Pickyourown.org Florida`, `Wikipedia`

### Citrus reticulata (Mandarin orange)
Sources (3): `Four Winds Growers`, `Pickyourown.org Florida`, `Wikipedia`

### Citrus sinensis (Sweet orange)
Sources (3): `Halegroves.com`, `Pickyourown.org Florida`, `Wikipedia`

### Corylus americana (American hazelnut)
Sources (3): `Practical Self Reliance`, `USDA NRCS Plant Guide (Corylus americana)`, `Wikipedia`

### Corylus cornuta (Beaked hazelnut)
Sources (3): `Hardy Fruit Tree Nursery`, `Native Plants PNW`, `USDA NRCS Plant Guide (Corylus cornuta)`

### Cydonia oblonga (Quince)
Sources (3): `Master Gardeners Association of BC`, `PFAF`, `Wikipedia`

### Diospyros kaki (Japanese persimmon)
Sources (3): `NC State Extension`, `UF/IFAS`, `Wikipedia`

### Diospyros virginiana (American persimmon)
Sources (3): `Backyard Forager`, `USDA NRCS Plant Guide (Diospyros virginiana)`, `Wikipedia`

### Fagus grandifolia (American beech)
Sources (3): `Eat the Planet`, `Practical Self Reliance`, `Wikipedia`

### Ficus carica (Common fig)
Sources (3): `Permaculture Magazine`, `Philadelphia Orchard Project`, `Wikipedia`

### Ginkgo biloba (Ginkgo)
Sources (3): `Backyard Forager`, `Hoyt Arboretum`, `Tyrant Farms`

### Helianthus tuberosus (Jerusalem artichoke)
Sources (3): `Backyard Forager`, `Ohio State Extension (Ohioline)`, `Wikipedia`

### Juglans cinerea (Butternut)
Sources (3): `Forager Chef`, `Practical Self Reliance`, `USDA NRCS Plant Guide (Juglans cinerea)`

### Juglans nigra (Black walnut)
Sources (3): `Old Farmer's Almanac`, `Practical Self Reliance`, `Wikipedia`

### Lindera benzoin (Spicebush)
Sources (3): `Backyard Forager`, `USDA NRCS Plant Guide (Lindera benzoin)`, `Wikipedia`

### Malus domestica (Apple)
Sources (3): `Eat the Weeds`, `MOFGA`, `Practical Self Reliance`

### Morchella esculenta (Yellow morel)
Sources (3): `Edible Wild Food`, `Missouri Department of Conservation`, `Wikipedia`

### Morus rubra (Red mulberry)
Sources (3): `Alabama Cooperative Extension`, `Under A Tin Roof`, `Wikipedia`

### Persea americana (Avocado)
Sources (3): `California Avocados`, `California Rare Fruit Growers`, `Wikipedia`

### Picea glauca (White spruce)
Sources (3): `Eat the Planet`, `Edible Wild Food`, `Forager Chef`

### Pinus strobus (Eastern white pine)
Sources (3): `Eat the Planet`, `Edible Wild Food`, `Old Farmer's Almanac`

### Populus tremuloides (Quaking aspen)
Sources (3): `Eat the Weeds`, `Edible Wild Food`, `Wikipedia`

### Prunus americana (American plum)
Sources (3): `Backyard Forager`, `Forager Chef`, `USDA NRCS Plant Guide (Prunus americana)`

### Prunus armeniaca (Apricot)
Sources (3): `Santa Fe Botanical Garden`, `USU Extension`, `Wikipedia`

### Prunus avium (Sweet cherry)
Sources (3): `British Local Food`, `Eat the Planet`, `Wikipedia`

### Prunus cerasus (Sour cherry)
Sources (3): `K-State Research and Extension`, `NC State Extension`, `Wikipedia`

### Prunus domestica (European plum)
Sources (3): `NC State Extension`, `Old Farmer's Almanac`, `Wikipedia`

### Prunus maritima (Beach plum)
Sources (3): `Orleans Conservation Trust`, `University of Maryland Extension`, `Wikipedia`

### Prunus persica (Peach)
Sources (3): `Old Farmer's Almanac`, `The Peach Truck`, `Wikipedia`

### Prunus salicina (Japanese plum)
Sources (3): `A Food Forest in your Garden`, `NC State Extension`, `Wikipedia`

### Prunus serotina (Black cherry)
Sources (3): `Practical Self Reliance`, `Tyrant Farms`, `USDA NRCS Plant Guide (Prunus serotina)`

### Prunus virginiana (Chokecherry)
Sources (3): `Forage Colorado`, `Practical Self Reliance`, `Wikipedia`

### Punica granatum (Pomegranate)
Sources (3): `Clemson HGIC`, `UC ANR Marin Master Gardeners`, `Wikipedia`

### Pyrus communis (European pear)
Sources (3): `Old Farmer's Almanac`, `Raintree Nursery`, `Wikipedia`

### Pyrus pyrifolia (Asian pear)
Sources (3): `NC State Extension`, `Philadelphia Orchard Project`, `Wikipedia`

### Quercus alba (White oak)
Sources (3): `Foraging Texas`, `The Druids Garden`, `Wikipedia`

### Quercus macrocarpa (Bur oak)
Sources (3): `Forage Finds`, `Morton Arboretum`, `Wikipedia`

### Ribes nigrum (Black currant)
Sources (3): `PFAF`, `University of Minnesota Extension`, `Wikipedia`

### Ribes rubrum (Red currant)
Sources (3): `Foraging Course Company`, `Paul Kirtley`, `Wikipedia`

### Rubus allegheniensis (Allegheny blackberry)
Sources (3): `Curious By Nature`, `Minnesota Wildflowers`, `Wikipedia`

### Rubus idaeus (Red raspberry)
Sources (3): `Never A Goose Chase`, `USDA NRCS Plant Guide (Rubus idaeus)`, `Wikipedia`

### Rubus occidentalis (Black raspberry)
Sources (3): `Forager Chef`, `The Druids Garden`, `Wikipedia`

### Rubus phoenicolasius (Wineberry)
Sources (3): `Backyard Forager`, `University of Maryland Extension`, `Wikipedia`

### Sambucus canadensis (American elderberry)
Sources (3): `Forage Finds`, `Why Farm It`, `Wikipedia`

### Sambucus nigra (Black elderberry)
Sources (3): `Coastal Maine Botanical Gardens`, `NC State Extension`, `Wikipedia`

### Sassafras albidum (Sassafras)
Sources (3): `Foraging Texas`, `USDA NRCS Plant Guide (Sassafras albidum)`, `Wikipedia`

### Taraxacum officinale (Dandelion)
Sources (3): `Eatweeds (Robin Harford)`, `Grow Forage Cook Ferment`, `Practical Self Reliance`

### Tilia americana (American basswood)
Sources (3): `Eat the Weeds`, `Forager Chef`, `Practical Self Reliance`

### Tsuga canadensis (Eastern hemlock)
Sources (3): `Eat the Planet`, `Song of the Woods`, `The Druids Garden`

### Ulmus pumila (Siberian elm)
Sources (3): `Backyard Forager`, `Forager Chef`, `Wild Food Girl`

### Vaccinium angustifolium (Lowbush blueberry)
Sources (3): `Maine's State Fruit (DACF)`, `University of Maine Cooperative Extension`, `Wikipedia`

### Vaccinium corymbosum (Highbush blueberry)
Sources (3): `Forage Finds`, `NC State Extension`, `USDA NRCS Plant Guide (Vaccinium corymbosum)`

### Vaccinium macrocarpon (American cranberry)
Sources (3): `Herb Society of America`, `Never A Goose Chase`, `Wikipedia`

### Vaccinium sp. (Blueberry (unspecified))
Sources (3): `Forager Chef`, `The Outdoor Apothecary`, `Wikipedia`

### Vitis labrusca (Fox grape)
Sources (3): `Eat the Planet`, `Northern Woodlands`, `Wikipedia`

### Vitis riparia (Riverbank grape)
Sources (3): `Forager Chef`, `Minnesota Wildflowers`, `Wikipedia`

### Vitis vinifera (Wine grape)
Sources (3): `NC State Extension`, `Wikipedia`, `Wikipedia (Harvest_(wine))`
