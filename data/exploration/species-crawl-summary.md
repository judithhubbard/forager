# Species Web-Crawl Summary

**Run:** 2026-05-09T18:38:16.884Z
**Generator:** `scripts/species-web-crawl.cjs`
**Source list:** Wikipedia + USDA NRCS Plant Guide PDFs
**Cache dir:** `data/exploration/web-crawl-cache/`

## Headline numbers

- Species processed: 30/30
- Total (species, zone, stage='ripe') rows after run: 254
- Total evidence entries across those rows: 413
- New `expert_verified` rows inserted by this script: 210
- Existing rows (`regional_guide` / `empirical_npn` / `empirical_community`) with evidence appended: 44
- Wikipedia coverage: 30/30
- USDA NRCS Plant Guide coverage: 13/30 (the rest 404 silently — URL returns an HTML page instead of a PDF)

## Method

1. For each of the 30 Northeast-priority species, fetched and cached:
   - Wikipedia article (`https://en.wikipedia.org/wiki/{Genus_species}`)
   - USDA NRCS Plant Guide (`https://plants.usda.gov/DocumentLibrary/plantguide/pdf/pg_{code}.pdf`)
2. Extracted phenology candidate sentences (those mentioning months alongside ripen/harvest/fruit/bloom keywords) and inspected each.
3. Hand-curated `WINDOW_DATA` in `scripts/species-web-crawl.cjs` with one fact per source-quote — verbatim quote in `summary`, plus a parenthetical interpretation.
4. For each (species, zone) pair:
   - If a row already exists with `regional_guide` / `empirical_npn` / `empirical_community` confidence, **APPEND** evidence entries (do not overwrite the bracket).
   - If no row exists, **INSERT** a new row with `confidence='expert_verified'`, bracket synthesized as union(min start, max end) across facts, peak as mean of source-asserted peaks.
5. Zone-shifted `start_doy`/`end_doy`/`peak_doy` by ~14d per full zone away from the species's `baseZone` (warmer = earlier).
6. Idempotent: re-runs do not create duplicates (filter on `url+summary` for appends; replace bracket+evidence for our own previously-inserted expert_verified rows).

## Per-species summary table

| Species | Wiki | USDA PG | Rows | Ev | Expert | Other | Conflict |
|---|:-:|:-:|---:|---:|---:|---:|---|
| _Asimina triloba_ | Y | Y | 6 | 18 | 2 | 4 | 4 pre-existing rows (Layer 1/2) |
| _Morus rubra_ | Y | - | 8 | 16 | 2 | 6 | 6 pre-existing rows (Layer 1/2) |
| _Diospyros virginiana_ | Y | Y | 8 | 24 | 4 | 4 | 4 pre-existing rows (Layer 1/2) |
| _Sambucus canadensis_ | Y | - | 9 | 9 | 3 | 6 | 6 pre-existing rows (Layer 1/2) |
| _Lindera benzoin_ | Y | Y | 7 | 14 | 3 | 4 | 4 pre-existing rows (Layer 1/2) |
| _Sassafras albidum_ | Y | Y | 8 | 16 | 8 | 0 | — |
| _Vitis riparia_ | Y | - | 8 | 8 | 4 | 4 | 4 pre-existing rows (Layer 1/2) |
| _Prunus virginiana_ | Y | - | 11 | 11 | 11 | 0 | — |
| _Prunus serotina_ | Y | Y | 8 | 8 | 4 | 4 | 4 pre-existing rows (Layer 1/2) |
| _Prunus americana_ | Y | Y | 10 | 20 | 10 | 0 | — |
| _Prunus maritima_ | Y | - | 5 | 5 | 5 | 0 | — |
| _Carya ovata_ | Y | - | 8 | 8 | 8 | 0 | — |
| _Juglans cinerea_ | Y | Y | 9 | 18 | 9 | 0 | — |
| _Carya laciniosa_ | Y | Y | 7 | 7 | 7 | 0 | — |
| _Castanea dentata_ | Y | - | 7 | 14 | 7 | 0 | — |
| _Corylus americana_ | Y | Y | 10 | 20 | 10 | 0 | — |
| _Corylus cornuta_ | Y | Y | 9 | 18 | 9 | 0 | — |
| _Vaccinium corymbosum_ | Y | Y | 9 | 18 | 5 | 4 | 4 pre-existing rows (Layer 1/2) |
| _Vaccinium angustifolium_ | Y | - | 9 | 9 | 9 | 0 | — |
| _Vaccinium macrocarpon_ | Y | - | 8 | 8 | 8 | 0 | — |
| _Aronia melanocarpa_ | Y | Y | 9 | 18 | 9 | 0 | — |
| _Rubus idaeus_ | Y | Y | 11 | 22 | 9 | 2 | 2 pre-existing rows (Layer 1/2) |
| _Rubus occidentalis_ | Y | - | 9 | 9 | 9 | 0 | — |
| _Rubus allegheniensis_ | Y | - | 9 | 9 | 7 | 2 | 2 pre-existing rows (Layer 1/2) |
| _Rubus phoenicolasius_ | Y | - | 6 | 12 | 6 | 0 | — |
| _Ribes rubrum_ | Y | - | 9 | 9 | 7 | 2 | 2 pre-existing rows (Layer 1/2) |
| _Ribes nigrum_ | Y | - | 9 | 9 | 7 | 2 | 2 pre-existing rows (Layer 1/2) |
| _Allium tricoccum_ | Y | - | 9 | 18 | 9 | 0 | — |
| _Asparagus officinalis_ | Y | - | 10 | 20 | 10 | 0 | — |
| _Helianthus tuberosus_ | Y | - | 9 | 18 | 9 | 0 | — |

## Per-species detail

### Asimina triloba

Sources: Wikipedia=OK, USDA NRCS PG=OK

Cells: 6, evidence entries: 18, new expert_verified: 2, pre-existing (Layer 1/2): 4

Per-zone state (zone/confidence/start-end/peak/ev_count):

- 5b/expert_verified/220-311~265/ev=3
- 6a/regional_guide/253-283/ev=3
- 6b/regional_guide/253-283/ev=3
- 7a/regional_guide/244-273/ev=3
- 7b/regional_guide/244-273/ev=3
- 8a/expert_verified/185-276~230/ev=3

### Morus rubra

Sources: Wikipedia=OK, USDA NRCS PG=404 (no plant guide for this species)

Cells: 8, evidence entries: 16, new expert_verified: 2, pre-existing (Layer 1/2): 6

Per-zone state (zone/confidence/start-end/peak/ev_count):

- 5a/regional_guide/171-222/ev=2
- 5b/regional_guide/171-222/ev=2
- 6a/regional_guide/171-222/ev=2
- 6b/regional_guide/171-222/ev=2
- 7a/regional_guide/182-212/ev=2
- 7b/regional_guide/182-212/ev=2
- 8a/expert_verified/93-184~154/ev=2
- 8b/expert_verified/86-177~147/ev=2

### Diospyros virginiana

Sources: Wikipedia=OK, USDA NRCS PG=OK

Cells: 8, evidence entries: 24, new expert_verified: 4, pre-existing (Layer 1/2): 4

Per-zone state (zone/confidence/start-end/peak/ev_count):

- 5b/expert_verified/265-355~310/ev=3
- 6a/expert_verified/258-348~303/ev=3
- 6b/expert_verified/251-341~296/ev=3
- 7a/regional_guide/274-334/ev=3
- 7b/regional_guide/274-334/ev=3
- 8a/regional_guide/274-365/ev=3
- 8b/regional_guide/274-365/ev=3
- 9a/expert_verified/216-306~261/ev=3

### Sambucus canadensis

Sources: Wikipedia=OK, USDA NRCS PG=404 (no plant guide for this species)

Cells: 9, evidence entries: 9, new expert_verified: 3, pre-existing (Layer 1/2): 6

Per-zone state (zone/confidence/start-end/peak/ev_count):

- 4a/expert_verified/241-332/ev=1
- 4b/expert_verified/234-325/ev=1
- 5a/regional_guide/222-253/ev=1
- 5b/regional_guide/222-253/ev=1
- 6a/regional_guide/222-253/ev=1
- 6b/regional_guide/222-253/ev=1
- 7a/regional_guide/213-243/ev=1
- 7b/regional_guide/213-243/ev=1
- 8a/expert_verified/185-276/ev=1

### Lindera benzoin

Sources: Wikipedia=OK, USDA NRCS PG=OK

Cells: 7, evidence entries: 14, new expert_verified: 3, pre-existing (Layer 1/2): 4

Per-zone state (zone/confidence/start-end/peak/ev_count):

- 5a/expert_verified/227-318~288/ev=2
- 5b/expert_verified/220-311~281/ev=2
- 6a/empirical_npn/205-290~252/ev=2
- 6b/empirical_npn/252-306~263/ev=2
- 7a/empirical_npn/232-307~260/ev=2
- 7b/empirical_npn/249-305~269/ev=2
- 8a/expert_verified/185-276~246/ev=2

### Sassafras albidum

Sources: Wikipedia=OK, USDA NRCS PG=OK

Cells: 8, evidence entries: 16, new expert_verified: 8, pre-existing (Layer 1/2): 0

Per-zone state (zone/confidence/start-end/peak/ev_count):

- 5a/expert_verified/221-318~258/ev=2
- 5b/expert_verified/214-311~251/ev=2
- 6a/expert_verified/207-304~244/ev=2
- 6b/expert_verified/200-297~237/ev=2
- 7a/expert_verified/193-290~230/ev=2
- 7b/expert_verified/186-283~223/ev=2
- 8a/expert_verified/179-276~216/ev=2
- 8b/expert_verified/172-269~209/ev=2

### Vitis riparia

Sources: Wikipedia=OK, USDA NRCS PG=404 (no plant guide for this species)

Cells: 8, evidence entries: 8, new expert_verified: 4, pre-existing (Layer 1/2): 4

Per-zone state (zone/confidence/start-end/peak/ev_count):

- 3b/expert_verified/241-301~272/ev=1
- 4a/expert_verified/234-294~265/ev=1
- 4b/expert_verified/227-287~258/ev=1
- 5a/regional_guide/222-253/ev=1
- 5b/regional_guide/222-253/ev=1
- 6a/regional_guide/222-253/ev=1
- 6b/regional_guide/222-253/ev=1
- 7a/expert_verified/192-252~223/ev=1

### Prunus virginiana

Sources: Wikipedia=OK, USDA NRCS PG=404 (no plant guide for this species)

Cells: 11, evidence entries: 11, new expert_verified: 11, pre-existing (Layer 1/2): 0

Per-zone state (zone/confidence/start-end/peak/ev_count):

- 2b/expert_verified/210-301/ev=1
- 3a/expert_verified/203-294/ev=1
- 3b/expert_verified/196-287/ev=1
- 4a/expert_verified/189-280/ev=1
- 4b/expert_verified/182-273/ev=1
- 5a/expert_verified/175-266/ev=1
- 5b/expert_verified/168-259/ev=1
- 6a/expert_verified/161-252/ev=1
- 6b/expert_verified/154-245/ev=1
- 7a/expert_verified/147-238/ev=1
- 7b/expert_verified/140-231/ev=1

### Prunus serotina

Sources: Wikipedia=OK, USDA NRCS PG=OK

Cells: 8, evidence entries: 8, new expert_verified: 4, pre-existing (Layer 1/2): 4

Per-zone state (zone/confidence/start-end/peak/ev_count):

- 4b/expert_verified/173-325~249/ev=1
- 5a/expert_verified/166-318~242/ev=1
- 5b/expert_verified/159-311~235/ev=1
- 6a/empirical_npn/204-257~228/ev=1
- 6b/empirical_npn/210-236~220/ev=1
- 7a/empirical_npn/219-256~232/ev=1
- 7b/empirical_npn/215-252~231/ev=1
- 8a/expert_verified/124-276~200/ev=1

### Prunus americana

Sources: Wikipedia=OK, USDA NRCS PG=OK

Cells: 10, evidence entries: 20, new expert_verified: 10, pre-existing (Layer 1/2): 0

Per-zone state (zone/confidence/start-end/peak/ev_count):

- 3b/expert_verified/241-301~264/ev=2
- 4a/expert_verified/234-294~257/ev=2
- 4b/expert_verified/227-287~250/ev=2
- 5a/expert_verified/220-280~243/ev=2
- 5b/expert_verified/213-273~236/ev=2
- 6a/expert_verified/206-266~229/ev=2
- 6b/expert_verified/199-259~222/ev=2
- 7a/expert_verified/192-252~215/ev=2
- 7b/expert_verified/185-245~208/ev=2
- 8a/expert_verified/178-238~201/ev=2

### Prunus maritima

Sources: Wikipedia=OK, USDA NRCS PG=404 (no plant guide for this species)

Cells: 5, evidence entries: 5, new expert_verified: 5, pre-existing (Layer 1/2): 0

Per-zone state (zone/confidence/start-end/peak/ev_count):

- 5b/expert_verified/227-264~246/ev=1
- 6a/expert_verified/220-257~239/ev=1
- 6b/expert_verified/213-250~232/ev=1
- 7a/expert_verified/206-243~225/ev=1
- 7b/expert_verified/199-236~218/ev=1

### Carya ovata

Sources: Wikipedia=OK, USDA NRCS PG=404 (no plant guide for this species)

Cells: 8, evidence entries: 8, new expert_verified: 8, pre-existing (Layer 1/2): 0

Per-zone state (zone/confidence/start-end/peak/ev_count):

- 4b/expert_verified/265-325~295/ev=1
- 5a/expert_verified/258-318~288/ev=1
- 5b/expert_verified/251-311~281/ev=1
- 6a/expert_verified/244-304~274/ev=1
- 6b/expert_verified/237-297~267/ev=1
- 7a/expert_verified/230-290~260/ev=1
- 7b/expert_verified/223-283~253/ev=1
- 8a/expert_verified/216-276~246/ev=1

### Juglans cinerea

Sources: Wikipedia=OK, USDA NRCS PG=OK

Cells: 9, evidence entries: 18, new expert_verified: 9, pre-existing (Layer 1/2): 0

Per-zone state (zone/confidence/start-end/peak/ev_count):

- 3a/expert_verified/272-332~302/ev=2
- 3b/expert_verified/265-325~295/ev=2
- 4a/expert_verified/258-318~288/ev=2
- 4b/expert_verified/251-311~281/ev=2
- 5a/expert_verified/244-304~274/ev=2
- 5b/expert_verified/237-297~267/ev=2
- 6a/expert_verified/230-290~260/ev=2
- 6b/expert_verified/223-283~253/ev=2
- 7a/expert_verified/216-276~246/ev=2

### Carya laciniosa

Sources: Wikipedia=OK, USDA NRCS PG=OK

Cells: 7, evidence entries: 7, new expert_verified: 7, pre-existing (Layer 1/2): 0

Per-zone state (zone/confidence/start-end/peak/ev_count):

- 5a/expert_verified/258-318~288/ev=1
- 5b/expert_verified/251-311~281/ev=1
- 6a/expert_verified/244-304~274/ev=1
- 6b/expert_verified/237-297~267/ev=1
- 7a/expert_verified/230-290~260/ev=1
- 7b/expert_verified/223-283~253/ev=1
- 8a/expert_verified/216-276~246/ev=1

### Castanea dentata

Sources: Wikipedia=OK, USDA NRCS PG=404 (no plant guide for this species)

Cells: 7, evidence entries: 14, new expert_verified: 7, pre-existing (Layer 1/2): 0

Per-zone state (zone/confidence/start-end/peak/ev_count):

- 5a/expert_verified/258-318~299/ev=2
- 5b/expert_verified/251-311~292/ev=2
- 6a/expert_verified/244-304~285/ev=2
- 6b/expert_verified/237-297~278/ev=2
- 7a/expert_verified/230-290~271/ev=2
- 7b/expert_verified/223-283~264/ev=2
- 8a/expert_verified/216-276~257/ev=2

### Corylus americana

Sources: Wikipedia=OK, USDA NRCS PG=OK

Cells: 10, evidence entries: 20, new expert_verified: 10, pre-existing (Layer 1/2): 0

Per-zone state (zone/confidence/start-end/peak/ev_count):

- 3b/expert_verified/210-332~256/ev=2
- 4a/expert_verified/203-325~249/ev=2
- 4b/expert_verified/196-318~242/ev=2
- 5a/expert_verified/189-311~235/ev=2
- 5b/expert_verified/182-304~228/ev=2
- 6a/expert_verified/175-297~221/ev=2
- 6b/expert_verified/168-290~214/ev=2
- 7a/expert_verified/161-283~207/ev=2
- 7b/expert_verified/154-276~200/ev=2
- 8a/expert_verified/147-269~193/ev=2

### Corylus cornuta

Sources: Wikipedia=OK, USDA NRCS PG=OK

Cells: 9, evidence entries: 18, new expert_verified: 9, pre-existing (Layer 1/2): 0

Per-zone state (zone/confidence/start-end/peak/ev_count):

- 3a/expert_verified/254-325~273/ev=2
- 3b/expert_verified/247-318~266/ev=2
- 4a/expert_verified/240-311~259/ev=2
- 4b/expert_verified/233-304~252/ev=2
- 5a/expert_verified/226-297~245/ev=2
- 5b/expert_verified/219-290~238/ev=2
- 6a/expert_verified/212-283~231/ev=2
- 6b/expert_verified/205-276~224/ev=2
- 7a/expert_verified/198-269~217/ev=2

### Vaccinium corymbosum

Sources: Wikipedia=OK, USDA NRCS PG=OK

Cells: 9, evidence entries: 18, new expert_verified: 5, pre-existing (Layer 1/2): 4

Per-zone state (zone/confidence/start-end/peak/ev_count):

- 4a/expert_verified/180-301~241/ev=2
- 4b/expert_verified/173-294~234/ev=2
- 5a/expert_verified/166-287~227/ev=2
- 5b/expert_verified/159-280~220/ev=2
- 6a/empirical_npn/204-247~214/ev=2
- 6b/empirical_npn/192-240~203/ev=2
- 7a/regional_guide/152-212/ev=2
- 7b/regional_guide/152-212/ev=2
- 8a/expert_verified/124-245~185/ev=2

### Vaccinium angustifolium

Sources: Wikipedia=OK, USDA NRCS PG=404 (no plant guide for this species)

Cells: 9, evidence entries: 9, new expert_verified: 9, pre-existing (Layer 1/2): 0

Per-zone state (zone/confidence/start-end/peak/ev_count):

- 2b/expert_verified/210-271~241/ev=1
- 3a/expert_verified/203-264~234/ev=1
- 3b/expert_verified/196-257~227/ev=1
- 4a/expert_verified/189-250~220/ev=1
- 4b/expert_verified/182-243~213/ev=1
- 5a/expert_verified/175-236~206/ev=1
- 5b/expert_verified/168-229~199/ev=1
- 6a/expert_verified/161-222~192/ev=1
- 6b/expert_verified/154-215~185/ev=1

### Vaccinium macrocarpon

Sources: Wikipedia=OK, USDA NRCS PG=404 (no plant guide for this species)

Cells: 8, evidence entries: 8, new expert_verified: 8, pre-existing (Layer 1/2): 0

Per-zone state (zone/confidence/start-end/peak/ev_count):

- 3b/expert_verified/272-362~308/ev=1
- 4a/expert_verified/265-355~301/ev=1
- 4b/expert_verified/258-348~294/ev=1
- 5a/expert_verified/251-341~287/ev=1
- 5b/expert_verified/244-334~280/ev=1
- 6a/expert_verified/237-327~273/ev=1
- 6b/expert_verified/230-320~266/ev=1
- 7a/expert_verified/223-313~259/ev=1

### Aronia melanocarpa

Sources: Wikipedia=OK, USDA NRCS PG=OK

Cells: 9, evidence entries: 18, new expert_verified: 9, pre-existing (Layer 1/2): 0

Per-zone state (zone/confidence/start-end/peak/ev_count):

- 3b/expert_verified/234-325~279/ev=2
- 4a/expert_verified/227-318~272/ev=2
- 4b/expert_verified/220-311~265/ev=2
- 5a/expert_verified/213-304~258/ev=2
- 5b/expert_verified/206-297~251/ev=2
- 6a/expert_verified/199-290~244/ev=2
- 6b/expert_verified/192-283~237/ev=2
- 7a/expert_verified/185-276~230/ev=2
- 7b/expert_verified/178-269~223/ev=2

### Rubus idaeus

Sources: Wikipedia=OK, USDA NRCS PG=OK

Cells: 11, evidence entries: 22, new expert_verified: 9, pre-existing (Layer 1/2): 2

Per-zone state (zone/confidence/start-end/peak/ev_count):

- 3a/expert_verified/187-308~248/ev=2
- 3b/expert_verified/180-301~241/ev=2
- 4a/expert_verified/173-294~234/ev=2
- 4b/expert_verified/166-287~227/ev=2
- 5a/expert_verified/159-280~220/ev=2
- 5b/expert_verified/152-273~213/ev=2
- 6a/expert_verified/145-266~206/ev=2
- 6b/expert_verified/138-259~199/ev=2
- 7a/regional_guide/152-273/ev=2
- 7b/regional_guide/152-273/ev=2
- 8a/expert_verified/117-238~178/ev=2

### Rubus occidentalis

Sources: Wikipedia=OK, USDA NRCS PG=404 (no plant guide for this species)

Cells: 9, evidence entries: 9, new expert_verified: 9, pre-existing (Layer 1/2): 0

Per-zone state (zone/confidence/start-end/peak/ev_count):

- 4a/expert_verified/200-240~220/ev=1
- 4b/expert_verified/193-233~213/ev=1
- 5a/expert_verified/186-226~206/ev=1
- 5b/expert_verified/179-219~199/ev=1
- 6a/expert_verified/172-212~192/ev=1
- 6b/expert_verified/165-205~185/ev=1
- 7a/expert_verified/158-198~178/ev=1
- 7b/expert_verified/151-191~171/ev=1
- 8a/expert_verified/144-184~164/ev=1

### Rubus allegheniensis

Sources: Wikipedia=OK, USDA NRCS PG=404 (no plant guide for this species)

Cells: 9, evidence entries: 9, new expert_verified: 7, pre-existing (Layer 1/2): 2

Per-zone state (zone/confidence/start-end/peak/ev_count):

- 4a/expert_verified/235-286~258/ev=1
- 4b/expert_verified/228-279~251/ev=1
- 5a/expert_verified/221-272~244/ev=1
- 5b/expert_verified/214-265~237/ev=1
- 6a/expert_verified/207-258~230/ev=1
- 6b/expert_verified/200-251~223/ev=1
- 7a/regional_guide/182-243/ev=1
- 7b/regional_guide/182-243/ev=1
- 8a/expert_verified/179-230~202/ev=1

### Rubus phoenicolasius

Sources: Wikipedia=OK, USDA NRCS PG=404 (no plant guide for this species)

Cells: 6, evidence entries: 12, new expert_verified: 6, pre-existing (Layer 1/2): 0

Per-zone state (zone/confidence/start-end/peak/ev_count):

- 5b/expert_verified/166-287~221/ev=2
- 6a/expert_verified/159-280~214/ev=2
- 6b/expert_verified/152-273~207/ev=2
- 7a/expert_verified/145-266~200/ev=2
- 7b/expert_verified/138-259~193/ev=2
- 8a/expert_verified/131-252~186/ev=2

### Ribes rubrum

Sources: Wikipedia=OK, USDA NRCS PG=404 (no plant guide for this species)

Cells: 9, evidence entries: 9, new expert_verified: 7, pre-existing (Layer 1/2): 2

Per-zone state (zone/confidence/start-end/peak/ev_count):

- 3b/expert_verified/210-248~228/ev=1
- 4a/expert_verified/203-241~221/ev=1
- 4b/expert_verified/196-234~214/ev=1
- 5a/expert_verified/189-227~207/ev=1
- 5b/expert_verified/182-220~200/ev=1
- 6a/expert_verified/175-213~193/ev=1
- 6b/expert_verified/168-206~186/ev=1
- 7a/regional_guide/152-212/ev=1
- 7b/regional_guide/152-212/ev=1

### Ribes nigrum

Sources: Wikipedia=OK, USDA NRCS PG=404 (no plant guide for this species)

Cells: 9, evidence entries: 9, new expert_verified: 7, pre-existing (Layer 1/2): 2

Per-zone state (zone/confidence/start-end/peak/ev_count):

- 3b/expert_verified/210-271~241/ev=1
- 4a/expert_verified/203-264~234/ev=1
- 4b/expert_verified/196-257~227/ev=1
- 5a/expert_verified/189-250~220/ev=1
- 5b/expert_verified/182-243~213/ev=1
- 6a/expert_verified/175-236~206/ev=1
- 6b/expert_verified/168-229~199/ev=1
- 7a/regional_guide/152-212/ev=1
- 7b/regional_guide/152-212/ev=1

### Allium tricoccum

Sources: Wikipedia=OK, USDA NRCS PG=404 (no plant guide for this species)

Cells: 9, evidence entries: 18, new expert_verified: 9, pre-existing (Layer 1/2): 0

Per-zone state (zone/confidence/start-end/peak/ev_count):

- 3b/expert_verified/119-178~149/ev=2
- 4a/expert_verified/112-171~142/ev=2
- 4b/expert_verified/105-164~135/ev=2
- 5a/expert_verified/98-157~128/ev=2
- 5b/expert_verified/91-150~121/ev=2
- 6a/expert_verified/84-143~114/ev=2
- 6b/expert_verified/77-136~107/ev=2
- 7a/expert_verified/70-129~100/ev=2
- 7b/expert_verified/63-122~93/ev=2

### Asparagus officinalis

Sources: Wikipedia=OK, USDA NRCS PG=404 (no plant guide for this species)

Cells: 10, evidence entries: 20, new expert_verified: 10, pre-existing (Layer 1/2): 0

Per-zone state (zone/confidence/start-end/peak/ev_count):

- 4a/expert_verified/119-188~158/ev=2
- 4b/expert_verified/112-181~151/ev=2
- 5a/expert_verified/105-174~144/ev=2
- 5b/expert_verified/98-167~137/ev=2
- 6a/expert_verified/91-160~130/ev=2
- 6b/expert_verified/84-153~123/ev=2
- 7a/expert_verified/77-146~116/ev=2
- 7b/expert_verified/70-139~109/ev=2
- 8a/expert_verified/63-132~102/ev=2
- 8b/expert_verified/56-125~95/ev=2

### Helianthus tuberosus

Sources: Wikipedia=OK, USDA NRCS PG=404 (no plant guide for this species)

Cells: 9, evidence entries: 18, new expert_verified: 9, pre-existing (Layer 1/2): 0

Per-zone state (zone/confidence/start-end/peak/ev_count):

- 4a/expert_verified/302-362~332/ev=2
- 4b/expert_verified/295-355~325/ev=2
- 5a/expert_verified/288-348~318/ev=2
- 5b/expert_verified/281-341~311/ev=2
- 6a/expert_verified/274-334~304/ev=2
- 6b/expert_verified/267-327~297/ev=2
- 7a/expert_verified/260-320~290/ev=2
- 7b/expert_verified/253-313~283/ev=2
- 8a/expert_verified/246-306~276/ev=2

## Coverage gaps and known imprecisions

USDA NRCS Plant Guides (real PDFs at `pg_{code}.pdf`) exist for: Asimina triloba, Diospyros virginiana, Lindera benzoin, Sassafras albidum, Prunus serotina, Prunus americana, Juglans cinerea, Carya laciniosa, Corylus americana, Corylus cornuta, Vaccinium corymbosum, Aronia melanocarpa, Rubus idaeus.

USDA NRCS Plant Guides DO NOT exist (URL returns HTML) for: Morus rubra, Sambucus canadensis, Vitis riparia, Prunus virginiana, Prunus maritima, Carya ovata, Castanea dentata, Vaccinium angustifolium, Vaccinium macrocarpon, Rubus occidentalis, Rubus allegheniensis, Rubus phoenicolasius, Ribes rubrum, Ribes nigrum, Allium tricoccum, Asparagus officinalis, Helianthus tuberosus. For these we relied on Wikipedia alone. (The cached `.pdf` files for these are HTML 404 pages and are intentionally retained as a record of the consultation attempt.)

Notable imprecisions:
- **Vaccinium macrocarpon (cranberry)**: Wikipedia article was consulted but did not yield a precise ripening month range. A single evidence entry documents this; the bracket Sep-Nov is from general industry knowledge.
- **Sambucus canadensis (elderberry)**: Wikipedia says "in the fall" without precise months. Bracket widened to Aug-Oct (DOY 213-304).
- **Morus rubra (red mulberry)**: USDA Plant Guide URL returns an HTML 404. Wikipedia evidence is indirect (bird visitation, pruning advice). Bracket is informed but not from a direct phenology statement.
- **Allium tricoccum (ramps)**: stored as `stage='ripe'` to match the table convention. Actual harvest is leaves/bulbs in early spring (Apr-May), not fruit.
- **Asparagus officinalis (asparagus)**: stored as `stage='ripe'` for the spring shoot harvest window.
- **Helianthus tuberosus (Jerusalem artichoke)**: stored as `stage='ripe'` for the post-frost tuber-harvest window.

## Skipped species

None — all 30 species were successfully processed.
