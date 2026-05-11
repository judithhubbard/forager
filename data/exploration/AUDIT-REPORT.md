# OpenTrees expansion: audit findings + proposed catalog growth

## Summary

29 alive USA+Canada tree-inventory sources downloaded (2.2M total rows).
Match rate against current 144-species catalog: **13%** (287k pins matched).

The 1.8M unmatched rows split into three buckets:

| Bucket | Volume | Action |
|---|---|---|
| Genus-only headers (`PICEA`, `POPULUS`, etc.) | ~520k | Skip — too ambiguous, not foragable as genus |
| Inverted common names (`Maple Sugar`, `Locust Honey`) | ~70k | **Add aliases to existing species** |
| Specific binomials of forageable species not in catalog | ~600k+ | **Add to catalog** |
| Long tail of ornamentals + uncommon trees | ~600k | Skip; revisit for high-MAU markets |

## Proposed catalog additions (Tier 5: northern + urban-tree forageables)

Each entry includes my edibility note. **Foraging legitimacy varies** — some are
"survival food" rather than table fare. User should confirm before merging.

### Conifers (needle tea, inner bark)

| Species | Common name | Pins | Edibility |
|---|---|---|---|
| **Picea glauca** | White spruce | 33,392 | **YES.** Young needle tips for tea (vitamin C), spruce tip syrup, traditional boreal forageable. |
| **Picea pungens** | Blue spruce | 52,913 | **YES.** Same uses as white spruce; widely planted ornamentally so common urban find. |
| **Pinus sylvestris** | Scots pine | 12,091 | **YES.** Pine-needle tea, edible cambium (inner bark), small pine nuts. Most-planted European pine. |
| **Pinus contorta** | Lodgepole pine | 11,609 | **YES.** Same uses as Scots pine; PNW Indigenous food (inner bark, bud tea). |
| **Larix sibirica** | Siberian larch | 8,418 | **YES.** Young needle tips edible (lemony); inner bark survival food. |

### Hardwoods (samaras, inner bark, sap)

| Species | Common name | Pins | Edibility |
|---|---|---|---|
| **Ulmus americana** | American elm | 138,420 | **YES.** Young samaras edible raw or cooked (mild peanut flavor); inner bark survival food. Widely planted before Dutch elm disease. |
| **Ulmus pumila** | Siberian elm | 21,999 | **YES.** Same as American elm; commonly planted post-DED. |
| **Fraxinus pennsylvanica** | Green ash | 182,734 | **MAYBE.** Young samaras edible pickled or cooked; bitter raw. Niche use; emerald ash borer is killing them off so opportunistic harvest. |
| **Populus tremuloides** | Quaking aspen | 17,492 | **YES.** Inner bark traditional food (Indigenous PNW); young leaves cooked; bud resin (propolis) for tinctures. |
| **Tilia × flavescens** | Hybrid linden/basswood | 9,094 | **YES.** Flowers for tea (well-known forager item), young leaves edible. Hybrid of T. americana × cordata. |

### Possible adds (ask before merging)

| Species | Common name | Pins | Note |
|---|---|---|---|
| Malus adstringens | Rosybloom crabapple | 17,082 | Edible jam/jelly but Malus is in NO_FALLBACK list deliberately — many ornamental crabapples are inedible. Adding this specific cv. would conflict with the policy. |
| Syringa reticulata | Japanese tree lilac | 13,469 | Flowers technically edible (mostly aromatic) but not a typical foraging target. |
| Syagrus romanzoffianum | Queen palm | 9,093 | Fruit pulp edible but stringy and not great. Common in southern US/CA. |

### Aliases to add to existing species (no new species needed)

Many sources publish common names in inverted form (`Maple Sugar` instead of `Sugar Maple`):

| Add alias | To existing species | Pins |
|---|---|---|
| Maple Sugar, MAPLE SUGAR | Acer saccharum | 22,047 |
| Maple Norway | Acer platanoides¹ | 19,617 |
| Maple Red, MAPLE RED | Acer rubrum | 15,485 |
| Locust Honey, Honeylocust | Gleditsia triacanthos | 13,217 |
| Ash Green | Fraxinus pennsylvanica² | 11,586 |
| Linden Littleleaf | Tilia cordata³ | 10,884 |
| Lilac Japanese | Syringa reticulata⁴ | 10,161 |
| Spruce White | Picea glauca¹ | 9,100 |

¹ Not yet in catalog — added by Tier 5 above.
² Same.
³ Tilia cordata is *also* not in our catalog. Should add.
⁴ Skip if we don't add Syringa.

## Sources with broken schema detection

These need bespoke handling (separate from catalog expansion):

| Source | Pins | Issue |
|---|---|---|
| Vancouver | — | URL-rotted; portal returns "Unknown dataset" error. Needs new URL. |
| Surrey | — | Returns HTML page, not data. Needs new URL. |
| Strathcona | — | Returns HTML page, not data. Needs new URL. |
| Westerville | — | Returns 0-row CSV. Empty dataset or pagination issue. |
| Mountain View | 28,305 | Source has `SPECIES` column but values appear to be common names; needs explicit mapping. |
| Cape Coral | 34,291 | Has `SPECIES` column with epithet-only values + no genus column. Needs separate handling or skip. |
| UNT (U North Texas) | 5,053 | Schema not detected. |
| Naperville | 95,508 | Schema not detected — mid-tier impact. |

Per-source fix is ~15–30 min each. Worth it for Naperville, Mountain View, Cape Coral. Skip the dead URLs unless we want to chase fresh portal links.

## Match-rate forecast after catalog expansion

If we add the 10 Tier-5 species + the inverted-common aliases:

| Match status | Today | After Tier 5 | After T5 + aliases |
|---|---|---|---|
| Matched | 13% (287k) | ~38% (838k) | ~42% (924k) |
| Unmatched | 87% | 62% | 58% |

The remaining unmatched are mostly genus-only headers (un-fixable) and the long
tail of urban ornamentals (low priority).

## Recommended next actions

1. **Add the 10 Tier-5 species** to the catalog (each needs prose + photo + windows; ~30 min × 10 = 5 hours of curation, or batch via wikidata-edibility script).
2. **Add aliases** (10 min — a single migration `update species set aliases = aliases || ARRAY[...] where ...`).
3. **Re-run dry-run** to verify match-rate improvement.
4. **Fix the 4 high-impact schema issues** (Naperville, Mountain View, Cape Coral, Cupertino).
5. **Run the actual import** for all sources, using the same trigger-disable pattern as existing importers.
