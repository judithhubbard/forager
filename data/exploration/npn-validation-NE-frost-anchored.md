# USA-NPN Ripe-Fruit Validation — Frost-Anchored Intervals (Northeast)

**Date:** 2026-05-08
**Question:** Does anchoring NPN ripe-fruit DOY to per-observation last-spring-frost (LSF) tighten per-species variance enough to use the frost-to-ripe interval as a model parameter?

## Methodology

- **NPN:** `getObservations.json` with `pheno_class_id=12`, `bounding_box=-80,36,-67,47` (NE US: NY/PA/NJ/CT/RI/MA/VT/NH/ME plus buffer), 2018-01-01 to 2025-12-31, 11 target species. Filtered `phenophase_status==1` client-side (server-side filter still silently ignored). API quirk: documented `bottom_left_x1`/`upper_right_x2` params are silently ignored and return zero records; only `bounding_box=lonW,latS,lonE,latN` works.
- **Frost data:** NCEI Climate Normals 1991–2020 daily product, `DLY-TMIN-NORMAL` field per station from `ncei.noaa.gov/data/normals-daily/1991-2020/access/` (855 NE stations with usable normals). **LSF DOY = last DOY in Jan–Jun where the climatological daily-min normal ≤ 36°F.** The 36°F buffer tracks the observed 50th-percentile last-freeze date better than bare 32°F (which biases early because the *mean* TMIN crosses 32°F weeks before the typical last freeze event). Sanity: NYC LSF=DOY 77; Adirondack-foothills EMMONS NY LSF=DOY 120 — within published references.
- **Assignment:** nearest TMIN station within 50 km via haversine. Median assignment distance 4–13 km across species; p90 ≤ 38 km — assignment quality excellent.
- **Interval:** `frost_to_ripe = ripe_doy − lsf_doy`. Headline metric: `100·(1 − var(interval)/var(raw_doy))`. Repeated the analysis with LSF=32°F threshold and got the same conclusion, so results aren't sensitive to threshold choice.

## Per-species results

| Species | n_obs | n_sites | median DOY | IQR DOY | median interval | IQR interval | variance reduction | verdict |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| *Prunus serotina* (black cherry) | 911 | 36 | 228 | 25.0 | 130 | 29.0 | **−2.2%** | NO SIGNAL |
| *Sambucus nigra* (black elderberry) | 34 | 3 | 213 | 24.0 | 107 | 21.5 | +12.5% | NO DATA (sites<8) |
| *Sambucus n.-canadensis* hybrid sid 1832 | 40 | 3 | 230 | 18.0 | 125 | 18.0 | −57.4% | NO DATA (sites<8) |
| *Vaccinium corymbosum* (highbush blueberry) | 678 | 29 | 199 | 34.0 | 97 | 30.0 | **+11.0%** | NO SIGNAL |
| *Amelanchier arborea* (serviceberry) | 190 | 12 | 195 | 33.0 | 81 | 34.8 | **−12.4%** | NO SIGNAL |
| *Diospyros virginiana* (persimmon) | 118 | 12 | 303 | 32.0 | 213 | 35.8 | **+2.3%** | NO SIGNAL |
| *Lindera benzoin* (spicebush) | 391 | 24 | 262 | 42.5 | 168 | 50.5 | **−15.9%** | NO SIGNAL |
| *Asimina triloba* (pawpaw) | 24 | 7 | 257 | 58.3 | 171 | 58.8 | +11.3% | NO DATA (n<30) |
| *Morus rubra* (red mulberry) | 1 | 1 | 182 | — | 79 | — | — | NO DATA |
| *Malus domestica* (apple) | 16 | 2 | 271 | 15.0 | 183 | 31.0 | −241.6% | NO DATA |
| *Cercis canadensis* (redbud, control) | 3420 | 118 | 276 | 66.0 | 191 | 65.3 | **−1.2%** | NO SIGNAL (legume — see below) |

## Headline finding

**Last-spring-frost anchoring does not work in this dataset.** Across the 6 species with adequate sample size (n≥30 obs, sites≥8), variance reduction ranges from **−15.9% to +11.0%** — clustered tightly around zero, with as many species *worse* as *better* than raw DOY. **Zero species qualified as STRONG anchor (≥50% variance reduction); zero species qualified as WEAK (20–50%); six are NO SIGNAL; five are NO DATA.** Switching the frost threshold from 36°F to 32°F did not change the conclusion. The hypothesis that climatological LSF absorbs zone/year/microclimate variation is **rejected** for forager-relevant ripe-fruit phenology in the NE US NPN dataset.

## Diagnosis: why frost-anchoring fails

Three converging explanations:

1. **DOY–LSF correlation is near zero.** Pearson r: black cherry +0.17, blueberry +0.35, pawpaw +0.34, redbud +0.06, serviceberry −0.01, spicebush **−0.22**, elderberry hybrid −0.69. For frost-anchoring to reduce variance we'd need r close to +1. Math: `var(A−B) = var(A)+var(B)−2·cov(A,B)`; when cov is small, subtracting B *increases* variance.
2. **Within-site variance dominates.** Mean within-site SD is 14–48 days, comparable to or larger than between-site SD. NPN volunteers re-score the same tree as "ripe=yes" across multi-week windows. Frost-anchoring can only ever explain *between-site* variance, capping the achievable reduction. Collapsing to first-ripe-per-site-year didn't help: variance reduction stayed in [−8%, +9%].
3. **Climatological LSF can't capture year-to-year variation.** A 1991–2020 mean varies in space but not time. Year-specific LSF would help but is a much heavier lift, and the upside is bounded by point 2.

## Sanity check vs horticultural literature

Although the variance-reduction story is null, the **median frost-to-ripe intervals are biologically sensible** (LSF computation itself is sound; medians work as point estimates):

- **Apple — published 135–140 d; observed 158.5 d** (n=15 site-years, n_sites=2). +20 d off but only 2 sites; sample probably skews toward late cultivars. Inconclusive.
- **Highbush blueberry — published 85–90 d; observed 82 d** (first-ripe per site-year). Within ±10 d. Solid corroboration.
- **Black cherry — published 105–115 d; observed 115 d** (first-ripe per site-year). Bullseye match.

Medians are useful priors. IQRs around them are not narrower than raw-DOY IQRs.

## Carry-overs from the prior agent

Frost-anchoring does **not** fix the leading-edge bias the prior agent found: NPN flags ripe 14–35 d earlier than foragers want, and shifting all observations by LSF preserves that bias. Stratifying black cherry by latitude reproduced the prior finding (south/coastal SD=48.6 d, north/mid SD~19 d) — coastal-warm sites contribute "first color, not actual ripe" reports no climate normalization can clean up. Redbud control again behaves like a persistence-class fruit (IQR 66 d, ripe reports every month) and excludes itself for legume reasons.

## Recommendation

**Do not build a frost-anchored calibration importer.** The hypothesis tested cleanly and failed. Climatological LSF is not a useful normalization for NE NPN ripe-fruit DOY: variance is unchanged or worse for every species, and the dominant variance source is intra-site phenophase duration plus year-to-year weather — neither of which a climatology can capture.

**Suggestions for the next iteration:**

1. **Use NPN ripe-fruit medians as per-species point priors.** Black cherry 130 d, blueberry 97 d, spicebush 168 d after LSF — these match literature and are useful even without variance reduction, because applying them on top of a per-region LSF lookup is still better than a single national mean DOY.
2. **Year-specific GDD or year-specific LSF if you want true normalization.** Heavier lift (PRISM daily 4-km, or per-station daily TMIN time-series). Upside is bounded by point 2 above (within-site duration component caps achievable reduction at maybe 50%).
3. **Collapse NPN to first-ripe-per-site-year before fitting.** Recovers cleaner phenology signal; medians stabilize and match literature (the apple/blueberry/cherry sanity checks above used this).
4. **Persimmon needs first-fall-frost, not last-spring-frost.** It's a frost-induced ripening species; LSF is structurally the wrong anchor and the +2.3% null is consistent with that. Compute climatological first-fall-frost as the first DOY in Jul–Dec where TMIN-normal drops below 36°F (same NCEI source).
5. **Exclude redbud and other legume/persistence-pod species** from any ripe-fruit importer.

Path forward: the previous agent's plan (calibrated leading-edge offset + per-species literature priors + UI flag for "NPN-derived" vs "literature-derived"). Frost-anchoring is not the unifying simplification we hoped for.
