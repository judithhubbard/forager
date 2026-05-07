# Proposed species additions

Audit of commonly-foraged species missing from the global catalog
(`data/forageable_species.json`, currently 45 + 9 genus-level catch-alls).
The current catalog is heavily Northeast-fruit-tree biased and reflects
JK's curated Ithaca list. Public-pin data now spans 60+ US cities and a
broader-set US user base needs species relevant to their region.

Tier breakdown:
- **Tier 1 (~25)** — widely-foraged, low-confusion, multi-region. Ship without ceremony.
- **Tier 2 (~15)** — regional or specialized but well-known to foragers.
- **Tier 3 (~10)** — niche, higher-caution, or contested. Include only if you want broader coverage.

Format per row: `Scientific name — Common name (forage parts) — note`.

---

## Tier 1 — broad, low-friction

### Trees (15)
- *Juglans nigra* — Black walnut (nut) — explicitly noted as "user removed" in the import framework. Widely foraged across eastern US.
- *Cercis canadensis* — Eastern redbud (flower, young pod) — flowers are mild and edible raw.
- *Tilia americana* — American basswood / linden (flower, young leaf) — flowers for tea, leaves as salad.
- *Sassafras albidum* — Sassafras (root bark, young leaf) — root for tea (caveat: safrole), leaves for filé powder.
- *Acer saccharum* — Sugar maple (sap) — primary syrup source.
- *Acer rubrum* — Red maple (sap) — also tappable, lower sugar content.
- *Acer negundo* — Box elder (sap) — tappable, often weedy in cities.
- *Crataegus* spp. — Hawthorn (fruit) — at genus level given many species.
- *Quercus alba* — White oak (acorn) — sweetest acorns, leach tannins.
- *Quercus macrocarpa* — Bur oak (acorn) — large, less tannic.
- *Fagus grandifolia* — American beech (nut) — small, sweet beechnuts.
- *Pinus strobus* — Eastern white pine (needle, inner bark) — needles for tea.
- *Tsuga canadensis* — Eastern hemlock (needle) — for tea (caveat: not the toxic herb).
- *Robinia pseudoacacia* — Black locust (flower) — fragrant, fritter-friendly. **Note: only flowers; rest is toxic.**
- *Gleditsia triacanthos* — Honey locust (pod pulp) — sweet pulp around seeds.

### Shrubs (5)
- *Lindera benzoin* — Spicebush (berry, twig) — berries dried as allspice substitute.
- *Aronia melanocarpa* — Black chokeberry (fruit) — high-antioxidant, often planted.
- *Rosa rugosa* — Rugosa rose (hip) — beach rose, large hips.
- *Rhus typhina* — Staghorn sumac (drupe) — for "sumac-ade".
- *Sambucus nigra* — Black elderberry (fruit, flower) — Eurasian/Western complement to *S. canadensis*.

### Herbs / greens (6)
- *Urtica dioica* — Stinging nettle (young shoot, leaf) — cooked.
- *Taraxacum officinale* — Dandelion (leaf, flower, root) — every part edible.
- *Portulaca oleracea* — Common purslane (leaf, stem) — succulent green.
- *Chenopodium album* — Lamb's quarters (leaf, seed) — wild spinach.
- *Allium vineale* — Field garlic (leaf, bulb) — common urban-lawn forage.
- *Hemerocallis fulva* — Daylily (flower, bud, tuber) — orange roadside type.

### Mushrooms (4)
- *Pleurotus ostreatus* — Oyster mushroom — fall/winter, easy ID.
- *Hericium erinaceus* — Lion's mane — easy ID, no toxic lookalikes.
- *Laetiporus sulphureus* — Chicken of the woods — easy ID; stomach upset for some.
- *Grifola frondosa* — Hen of the woods / maitake — at oak base, fall.

**Tier 1 total: 30** (slight overshoot)

---

## Tier 2 — regional or specialized

### Regional fruits / shrubs
- *Prunus maritima* — Beach plum — Atlantic coast.
- *Vaccinium macrocarpon* — Cranberry — bogs.
- *Vaccinium ovatum* — Evergreen huckleberry — Pacific NW.
- *Mahonia aquifolium* — Oregon grape — Pacific NW.
- *Gaultheria shallon* — Salal — Pacific NW.
- *Gaultheria procumbens* — Wintergreen — eastern woodlands.
- *Rubus spectabilis* — Salmonberry — Pacific NW.
- *Rubus parviflorus* — Thimbleberry — northern + western.
- *Sambucus cerulea* — Blue elderberry — Western.
- *Pinus edulis* — Pinyon pine (nut) — Southwest.

### More herbs / wetland
- *Stellaria media* — Chickweed (leaf) — early-spring green.
- *Plantago major* — Common plantain (leaf) — ubiquitous.
- *Galium aparine* — Cleavers (shoot) — spring tonic.
- *Nasturtium officinale* — Watercress (leaf) — clean streams only.
- *Arctium minus* — Burdock (root, young petiole) — biennial root.
- *Achillea millefolium* — Yarrow (leaf, flower) — flavoring, tea.

**Tier 2 total: 16**

---

## Tier 3 — niche or higher-caution

- *Allium canadense* — Wild onion / meadow garlic — overlaps field garlic but distinct.
- *Allium tuberosum* — Garlic chives — semi-naturalized.
- *Helianthus tuberosus* — Jerusalem artichoke / sunchoke (tuber).
- *Apios americana* — Groundnut (tuber) — hard to find.
- *Smilax* spp. — Greenbrier (shoot) — asparagus-like.
- *Phytolacca americana* — Pokeweed (young shoot) — **mature plant toxic**; needs careful prep, multi-water cook.
- *Boletus edulis* — Porcini / king bolete (mushroom).
- *Coprinus comatus* — Shaggy mane (mushroom) — antabuse effect with alcohol.
- *Auricularia auricula-judae* — Wood ear (mushroom).
- *Mahonia repens* — Creeping Oregon grape — Northwest.

**Tier 3 total: 10**

---

## Grand total: 56 proposed additions (30 + 16 + 10)

Combined with the current 54, the catalog would land at ~110 species — a solid US-wide forageable catalog without going overboard.

## Notable deliberate omissions

- *Conium maculatum*, *Cicuta maculata* (poison hemlock, water hemlock) — toxic; some look like wild parsnip/carrot. Not adding even with toxicity_notes; too high-stakes.
- *Toxicodendron radicans* (poison ivy) — already covered as a hazard, not a forageable.
- *Symphytum officinale* (comfrey) — internal use is now widely advised against (PA toxicity).
- Most *Amanita* species — even the edible ones (caesarea, jacksonii) have deadly relatives.
- Wild parsnip — phototoxic sap, low payoff, easy to confuse with its toxic relatives.

## Process for applying

If you green-light the list (or a subset):
1. Append to `data/forageable_species.json`.
2. Migration that inserts the new rows into `public.species` with conservative `safety_notes` and empty `usage_notes` / `harvest_tips` / `toxicity_notes` (manual curation can add prose later).
3. Migration that inserts `user_species_preferences` rows for JK's account marking the new species as `enabled=false` so the existing Ithaca view is unchanged. New users start with no rows = all enabled (deny-list semantics).
4. Optional: re-run a Wikidata pull (`scripts/import/wikidata-pull.ts`) for the new entries to fill in attribution and aliases.
5. Optional: hand-curated prose for the higher-stakes entries (pokeweed, sassafras, black locust) before they ship.
