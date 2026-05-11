# Chestnut Harvest-Window Calibration Summary

**Run:** 2026-05-09T23:22:18.819Z
**Generator:** scripts/chestnut-evidence-crawl.cjs

## Per-species results

### Castanea pumila
- Zones populated (8): 5b, 6a, 6b, 7a, 7b, 8a, 8b, 9a
- Distinct sources (4): NC State Extension, USDA Forest Service Silvics, Eat The Weeds, Wikipedia
- Rows inserted this run: 0; rows already present: 8
- Evidence entries added this run: 0

| Zone | start_doy | end_doy | peak_doy |
|------|-----------|---------|----------|
| 5b | 248 | 279 | 265 |
| 6a | 241 | 272 | 258 |
| 6b | 234 | 265 | 251 |
| 7a | 227 | 258 | 244 |
| 7b | 220 | 251 | 237 |
| 8a | 213 | 244 | 230 |
| 8b | 206 | 237 | 223 |
| 9a | 199 | 230 | 216 |

### Castanea mollissima
- Zones populated (8): 5a, 5b, 6a, 6b, 7a, 7b, 8a, 8b
- Distinct sources (5): Penn State Extension, University of Missouri Center for Agroforestry, Practical Self Reliance, Wikipedia, NC State Extension
- Rows inserted this run: 0; rows already present: 8
- Evidence entries added this run: 0

| Zone | start_doy | end_doy | peak_doy |
|------|-----------|---------|----------|
| 5a | 274 | 306 | 289 |
| 5b | 267 | 299 | 282 |
| 6a | 260 | 292 | 275 |
| 6b | 253 | 285 | 268 |
| 7a | 246 | 278 | 261 |
| 7b | 239 | 271 | 254 |
| 8a | 232 | 264 | 247 |
| 8b | 225 | 257 | 240 |

### Castanea sativa
- Zones populated (7): 6a, 6b, 7a, 7b, 8a, 8b, 9a
- Distinct sources (5): Royal Horticultural Society, PFAF, California Rare Fruit Growers, Wikipedia, Forager Chef
- Rows inserted this run: 0; rows already present: 7
- Evidence entries added this run: 0

| Zone | start_doy | end_doy | peak_doy |
|------|-----------|---------|----------|
| 6a | 292 | 327 | 310 |
| 6b | 285 | 320 | 303 |
| 7a | 278 | 313 | 296 |
| 7b | 271 | 306 | 289 |
| 8a | 264 | 299 | 282 |
| 8b | 257 | 292 | 275 |
| 9a | 250 | 285 | 268 |

### Castanea sp.
- Zones populated (7): 5a, 5b, 6a, 6b, 7a, 7b, 8a
- Distinct sources (3): Wikipedia, Practical Self Reliance, The American Chestnut Foundation (GA)
- Rows inserted this run: 0; rows already present: 7
- Evidence entries added this run: 0

| Zone | start_doy | end_doy | peak_doy |
|------|-----------|---------|----------|
| 5a | 258 | 318 | 299 |
| 5b | 251 | 311 | 292 |
| 6a | 244 | 304 | 285 |
| 6b | 237 | 297 | 278 |
| 7a | 230 | 290 | 271 |
| 7b | 223 | 283 | 264 |
| 8a | 216 | 276 | 257 |

## Verification (post-run)

| Species | Zones | Evidence entries | Distinct sources |
|---------|-------|-------------------|-------------------|
| Castanea pumila | 8 | 32 | 4 |
| Castanea mollissima | 8 | 40 | 5 |
| Castanea sativa | 7 | 35 | 5 |
| Castanea sp. | 7 | 17 | 3 |
| Castanea dentata | 7 | 17 | 3 |

## Spread vs. Castanea dentata (overlapping zones)

Difference shown as (this species DOY) - (C. dentata DOY); positive = later, negative = earlier.

| Zone | C. dentata peak | C. pumila peak (delta) | C. mollissima peak (delta) | C. sativa peak (delta) |
|------|------------------|--------------------------|------------------------------|--------------------------|
| 5a | 299 | — | 289 (-10d) | — |
| 5b | 292 | 265 (-27d) | 282 (-10d) | — |
| 6a | 285 | 258 (-27d) | 275 (-10d) | 310 (+25d) |
| 6b | 278 | 251 (-27d) | 268 (-10d) | 303 (+25d) |
| 7a | 271 | 244 (-27d) | 261 (-10d) | 296 (+25d) |
| 7b | 264 | 237 (-27d) | 254 (-10d) | 289 (+25d) |
| 8a | 257 | 230 (-27d) | 247 (-10d) | 282 (+25d) |
| 8b | — | 223 | 240 | 275 |
| 9a | — | 216 | — | 268 |

## DOY-range justifications

- **Castanea pumila** (base 7a, DOY 227-258, peak 244): Allegheny chinkapin ripens distinctly earlier than other chestnuts — mid-Aug to mid-Sep at the species' core southeastern range (zones 7a-8a). NC State (native range), USDA Forest Service Silvics ("late August through September"), Eat The Weeds (FL: "as early as late July"), and Wikipedia all corroborate. Window narrowed (~31d) because chinkapins shed quickly off the tree.
- **Castanea mollissima** (base 6b, DOY 253-285, peak 268): Chinese chestnut is the dominant cultivated chestnut in the US, with reliable mid-Sep through early-Oct drop. Penn State Extension, U Missouri Center for Agroforestry, NC State, Practical Self Reliance, and Wikipedia all converge on this range. Window ~32d.
- **Castanea sativa** (base 7a, DOY 278-313, peak 296): European/Sweet chestnut ripens distinctly later than American or Chinese chestnut — early Oct through early Nov. RHS (UK), PFAF, CRFG (CA), Wikipedia, and Forager Chef all corroborate the late window. Window ~35d.
- **Castanea sp.** (catch-all): mirrors Castanea dentata zone-by-zone with confidence demoted to `cited_thin` and a `defaulted_from` tag on each evidence entry. Note explains the user should reclassify when the actual species becomes known.

## Method notes

- Each species has a `baseZone` and base DOY range; per-zone DOY values are computed by zone-shift (~+7d per cooler half-zone, ~-7d per warmer half-zone), matching the pattern in scripts/blog-evidence-crawl.cjs and the existing C. dentata calibration.
- All rows inserted with `stage = ripe` and `confidence = regional_guide` (extension-service / academic backing) for the three real species; `cited_thin` for the catch-all.
- Idempotent: insert checks (species_id, climate_zone_id, stage); evidence append filters duplicate URLs.
- Source URLs cached to data/exploration/blog-cache/ for offline trace (best-effort; fetch failures don't block insert).
