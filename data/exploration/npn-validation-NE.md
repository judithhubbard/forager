# USA-NPN Ripe-Fruit Validation — Northeast Forager Calibration

**Date:** 2026-05-08
**Question:** Does NPN ripe-fruit median DOY (and p10/p90 spread) predict real harvest timing for foragers in the Northeast?

## Methodology

- Endpoint: `getObservations.json` with `request_src=forager-validation`, `pheno_class_id=12` (Ripe fruits class), `state=NY`, `start_date=2018-01-01`, `end_date=2025-12-31`, single `species_id[i]=…` per call.
- Note: the API ignores `phenophase_status=1` server-side and returns all status records (0 = no, 1 = yes, -1 = uncertain). I filtered client-side to `status==1`.
- Stats per species: `n_obs` (yes records), `n_distinct_sites`, p10/median/p90 of `day_of_year`. Linear-interp percentiles.
- Verdict thresholds: TIGHT = both p10 and p90 within ±7 d of truth bracket; DIRECTIONAL = within ±21 d; POOR = beyond ±21 d; NO DATA = <20 yes-obs OR <5 distinct sites.
- Raw JSON for *Prunus serotina* (richest set, 7,005 records → 408 yes) saved to `npn-validation-NE-raw-prunus-serotina.json`.

## Results

| Species | NPN sid | n_obs | n_sites | NPN p10/median/p90 (DOY) | Truth window (DOY) | med − mid | p10 − tStart | p90 − tEnd | NPN width / truth width | Verdict |
|---|---:|---:|---:|---|---|---:|---:|---:|---:|---|
| Black cherry (*Prunus serotina*) | 28 | 408 | 9 | 182 / 222 / 252 | 217–258 | −16 | **−35** | −6 | 70 / 41 | **POOR** |
| American elderberry (*Sambucus nigra-canadensis*) | 1832 | 0 | 0 | — | 227–263 | — | — | — | — | NO DATA |
| Black elderberry (*Sambucus nigra*) | 90 | 0 | 0 | — (8 raw, all "no") | 227–263 | — | — | — | — | NO DATA |
| Northern spicebush (*Lindera benzoin*) | 915 | 163 | 9 | 235 / 271 / 305 | 244–288 | +5 | −9 | +17 | 70 / 44 | **DIRECTIONAL** |
| Common serviceberry (*Amelanchier arborea*) | 1431 | 0 | 0 | — (192 raw, all "no") | 166–191 | — | — | — | — | NO DATA |
| American persimmon (*Diospyros virginiana*) | 303 | 37 | 1 | 283 / 311 / 338 | 268–314 | +6 | +15 | +24 | 55 / 46 | NO DATA (1 site) |
| Black raspberry (*Rubus occidentalis*) | — | — | — | — | 176–206 | — | — | — | — | NO DATA (not in NPN) |
| Highbush blueberry (*Vaccinium corymbosum*) | 94 | 274 | 3 | 177 / 194 / 224 | 182–227 | −10 | −5 | −3 | 47 / 45 | NO DATA (3 sites) |
| Eastern redbud (*Cercis canadensis*) | 7 | 298 | 11 | 107 / 276 / 332 | n/a (legume) | — | — | — | 225 / — | (residual, see below) |
| Pawpaw (*Asimina triloba*) | 1201 | 7 | 1 | 157 / 157 / 203 | 258–288 | — | — | — | — | NO DATA |

## Per-species observations

**Black cherry — POOR.** 408 yes-obs across 9 sites looks healthy, but p10 = DOY 182 (Jul 1) is 35 days earlier than the forager start of Jul 28. Drilling in: 92 of the 408 records are at site 2120 (Long Island, lat 40.86), which produces ripe-fruit "yes" reports starting mid-May. These are *botanically* plausible (drupes do color early on warm coastal microclimates) but represent first-color, not the late-July harvest peak a forager wants. Trimming to lat > 41 yields p10/median/p90 = 202/225/254, n=316 from 6 sites — still ~15 d too early on the leading edge but the trailing edge (p90 = 254 vs truth 258) is a clean match. **Diagnosis: NPN observers flag ripe earlier than foragers do; the bias is on the leading edge.**

**Northern spicebush — DIRECTIONAL.** 163 yes-obs from 9 sites. NPN p10 = DOY 235 vs truth start 244 (9 d early); p90 = 305 vs truth end 288 (17 d late). NPN window is wider than truth on both ends but median tracks well (+5 d). Useful as a prior with "estimated" flag.

**Highbush blueberry — borderline.** Residuals are excellent (p10 −5, p90 −3, median −10) — would be TIGHT under the residual rule alone. But only 3 distinct sites in NY means it fails the site-diversity floor. Worth a re-pull at Northeast bbox (CT/MA/PA) before declaring it usable; the agreement is encouraging.

**American persimmon — borderline.** Residuals ≤24 d on both ends, but a single NY site (n=37 from one location) is a coverage gap. Same story: re-pull at multi-state Northeast scope before deciding.

**Pawpaw, Sambucus spp., Amelanchier arborea — NO DATA.** Either no NY records at all, or only "no" reports were submitted. For *A. arborea* the 192 negative checks suggest observers monitored the species but never witnessed ripe fruit during their observation cadence — serviceberry ripens fast and gets stripped by birds, so observers likely missed the window. **This is a meaningful negative finding: NPN under-samples short-window species.**

**Eastern redbud — residual / sanity check.** 298 yes-obs from 11 sites with an enormous p10–p90 width (225 days) and "ripe fruit" reports in every month including January. This is *not* observer error — redbud legume pods persist on the tree for many months and observers correctly score them as "ripe" year-round. The signal is meaningless for harvest timing but confirms NPN captures persistence-class fruits well. For forager calibration we should exclude legumes/persistent pods from importer entirely.

## Summary

| Verdict | Count | Species |
|---|---:|---|
| TIGHT | 0 | — |
| DIRECTIONAL | 1 | Northern spicebush |
| POOR | 1 | Black cherry |
| NO DATA | 6 | Sambucus×2, A. arborea, persimmon, blueberry, pawpaw, R. occidentalis |
| n/a (residual) | 1 | Redbud |

## Recommendation

**Refine methodology before building the importer.** The NY-only scope is the binding constraint: 6 of 9 species fail the data-volume bar not because NPN lacks coverage but because NY alone is too thin. The two species we *can* evaluate (black cherry, spicebush) reveal a consistent leading-edge bias — NPN volunteers flag "ripe" 1–5 weeks earlier than foragers consider "ready to harvest." This is a defensible finding (NPN's phenophase definition is botanical first-occurrence, not peak), not a bug.

**Concrete next steps:**
1. Re-run validation at Northeast bounding box (NY+NJ+CT+MA+PA+VT+NH+RI+ME) to lift n_obs and n_sites above the floor for blueberry, persimmon, pawpaw.
2. Apply a **leading-edge offset**: shift NPN p10 by +14 d before using it as a forager start-of-window prior (calibrated from black cherry's −16 to −35 d residual; spicebush's −9 d agrees in sign).
3. Drop any species with persistent-pod fruits (redbud, honeylocust, etc.) from the ripe-fruit pheno_class entirely; they're unusable for harvest timing.
4. For species with truly no NPN data (Rubus occidentalis, Sambucus nigra-canadensis), fall back to literature-derived windows and flag as "not NPN-calibrated."

Do not abandon NPN — but treat it as a *prior* that needs forager-side offset calibration, not as ground truth. The importer should ingest NPN with a per-species offset table and a UI flag distinguishing "NPN-derived" from "literature" windows.
