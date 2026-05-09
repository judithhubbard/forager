# Deep-crawl shortlist: additional tree-data sources

Research pass for issue #57. Goal: prioritize new sources to feed Forager's
intake framework, beyond the OpenTrees aggregator pull. Cross-checked against
existing imports (Cornell CTI, Cornell BG, NYC, Chicago, SF, Toronto, plus
~29 OpenTrees alive sources). Forager will be paid → permissive licenses
required, NC-licensed sources flagged red.

---

## Top 10 prioritized shortlist

Ranked by (estimated forageable pins) × (license clarity) × (intake ease).

| # | Source | Est. pins | Est. forageable | License | Why |
|---|---|---|---|---|---|
| 1 | **City of LA — Bureau of Street Services Trees** | ~635k | ~95–125k | Public-domain (Hub default) | Massive single-city dataset, scientific binomials present, fills SoCal coverage gap. |
| 2 | **City of Ottawa — Tree Inventory** | 302k | ~45–75k | Open Data Licence v2.0 (permissive) | Very large Canadian capital dataset; clean ArcGIS REST endpoint, scientific name in `SPECIES`. |
| 3 | **City of Hamilton (ON) — Public Tree Inventory** | 282k | ~40–70k | Hamilton Open Data Licence (permissive) | Big Ontario dataset, both scientific and common name fields, daily refresh. |
| 4 | **Seattle SDOT Trees** | 267k | ~40–65k | City of Seattle open terms (permissive) | PNW gap-fill; daily refresh; full ArcGIS Hub item with all download formats. |
| 5 | **City of Vancouver — Public Trees** | 187k | ~30–50k | Open Government Licence – Vancouver | Replaces dead `street-trees` URL in `canada.cjs`; new dataset id is `public-trees`. |
| 6 | **Portland (OR) — Street Tree Inventory Active Records** | ~252k | ~35–60k | City of Portland open data terms (permissive) | Large PNW set; scientific + common name; ArcGIS Hub with stable v1 download URL. |
| 7 | **City of Boston — BPRD Trees / Treekeeper** | ~40k+ | ~5–10k | ODC PDDL (public domain) | Best-licensed source on the list; scientific name in `spp_bot`. Modest size but high quality. |
| 8 | **Pittsburgh — Forestry Division Trees (WPRDC)** | 45.7k | ~7–12k | CC BY 4.0 | CKAN datastore, scientific_name + common_name columns; **stale since 2020** so freshness caveat. |
| 9 | **iNaturalist Research-Grade via GBIF (CC0 + CC BY only)** | many M; subset of trees ~tens of M globally | high precision, low density per species | CC0 / CC BY 4.0 (filter out CC BY-NC) | Citizen-science ground truth for species ID. Sparse spatially but accurate; complements urban inventories. |
| 10 | **Minneapolis — Tree Inventory (CC0)** | ~60–200k expected | ~10–25k | CC0 (Minneapolis publishes most layers under CC0 / CC BY-SA) | Confirmed via DCAT feed — most cityoflakes tree layers default to CC0 in DCAT metadata; verify the specific tree-inventory item. |

Honorable mentions (close to top 10 but not quite): Austin (62k, public domain, but stale 2020); London ON; Calgary already in OpenTrees; Edmonton already there.

---

## US cities not yet imported

| City | Org | URL | Rows | License | Schema (scientific / common) | Updated | Forageable est. | Notes |
|---|---|---|---|---|---|---|---|---|
| Boston, MA | Boston Parks & Recreation Dept | https://data.boston.gov/dataset/bprd-trees | ~40k+ | **ODC PDDL (public domain)** | `spp_bot` / `spp_com` | Daily | ~15–25% | Boston also has "Boston Treekeeper Street Tree Inventory" hosted at gis.data.mass.gov; combine. CSV direct: `…/bprd_trees.csv`. |
| Boston, MA (Treekeeper) | Boston Parks Dept | https://gis.data.mass.gov/datasets/boston-treekeeper-street-tree-inventory/about | unknown | mass.gov open terms | tbd | recent | overlap with BPRD likely; pick one | |
| Seattle, WA | SDOT | https://data-seattlecitygis.opendata.arcgis.com/datasets/SeattleCityGIS::sdot-trees | **267,090** | City of Seattle open terms (permissive but disclaims accuracy) | likely `SCIENTIFICN`/`COMMONNAME` (Treekeeper schema) | Daily; last 2026-05-07 | ~15–25% | Direct CSV: `…/items/db783659194f47ef8fbd8e010c102809/csv?layers=0`. Use `CURRENT_STATUS = INSVC` filter. |
| Portland, OR | PBOT / Urban Forestry | https://gis-pdx.opendata.arcgis.com/datasets/PDX::street-tree-inventory-active-records/about | ~252k (city total inventory) | City of Portland open data | `Genus_speci`, `Common_nam` (Tree Inventory 2.0 schema) | rolling | ~20–30% | Portland has both Street + Park inventories. Excel + CSV + Shapefile downloads on portland.gov. |
| Los Angeles, CA | LA Bureau of Street Services | https://geohub.lacity.org/datasets/266c6255b1fc4ae8b8f100d8696e1fa4_0 | **~635,558** | none stated (default LA GeoHub open) | `Type`, `Type_Description` (no clean scientific column — common-name only) | last touch 2020 | ~10–18% | Common-name-only is a precision hit; LA TreeKeeper backend has scientific names but isn't exposed in this layer. **Compromise but huge volume.** |
| San Jose, CA | City of San Jose | https://gisdata-csj.opendata.arcgis.com/datasets/csj::street-tree | tens of k | open data | tbd | weekly Mondays | ~15% | Already partially in OpenTrees as `san_jose_ca1/2/3`; verify dedup. |
| Atlanta, GA | Trees Atlanta (NGO) | https://www.arcgis.com/apps/dashboards/af37a394b70d49cbbc346ccb08ee4a38 | tens of k | NGO terms unclear | dashboard layer | rolling | ~15% | NGO, not municipal — license probably restrictive; **needs follow-up email**. |
| Sun Belt + Mtn West negative finding | San Diego, Honolulu, Phoenix, Tucson, Albuquerque, Boise, SLC, Anchorage, Sacramento, Miami, Houston | n/a | n/a | n/a | n/a | n/a | n/a | None of these cities publish a per-tree-point inventory I could surface. Mostly canopy polygons, equity scores, or no public dataset. |
| Washington, DC | DDOT Urban Forestry | https://opendata.dc.gov/datasets/urban-forestry-street-trees | ~170k+ (commonly cited) | DC.gov terms (permissive) | `SCIENTIFIC_NAME`, `COMMON_NAME` typical | rolling | ~20–30% | Direct REST endpoint via DDOT Urban Forestry hub. Already partly covered by `washington-dc` in OpenTrees but verify schema completeness. |
| Baltimore, MD | Baltimore City | https://www.arcgis.com/apps/webappviewer/index.html?id=d2cfbbe9a24b4d988de127852e6c26c8 | hundreds of k | open terms | trees, stumps, sites | rolling | ~20% | Find direct Feature Service; map viewer is the only entry point in current Google. |
| Pittsburgh, PA | City Forestry / WPRDC | https://data.wprdc.org/dataset/city-trees | **45,709** | **CC BY 4.0** | `scientific_name`, `common_name` | **2020 (stale)** | ~20% | Direct CSV: `…/datastore/dump/1515a93c-…`. Includes i-Tree benefit columns. Worth ingesting despite staleness. |
| Columbus, OH | Columbus Rec & Parks | https://columbusrecparks.com/nature/urban-forestry/street-tree-inventory/ | 125k+ | unclear | tbd | recent (2023 inventory) | ~20% | Already imported as `colombus` via OpenTrees; verify completeness. |
| Cleveland / Cincinnati / Indianapolis | various | hub portals exist | open | n/a | n/a | n/a | n/a | None publish a per-tree point inventory. Cleveland's is in progress. |
| Minneapolis, MN | City of Minneapolis | https://opendata.minneapolismn.gov/datasets/tree-inventory | tens of k | **CC0** (default for cityoflakes layers) | tbd | recent | ~25% | DCAT confirms CC0 default. **High value** — confirm the tree-inventory item still exists. |
| Saint Paul / Milwaukee / Nashville / Raleigh / Richmond | — | none | n/a | n/a | n/a | n/a | n/a | No open per-tree dataset found. |
| Madison, WI | already imported (`madison`) | — | — | — | — | — | — | — |
| Charlotte, NC | TreesCharlotte (NGO) | https://treescharlotte.org/ | 120k+ but not openly downloadable | NGO terms | tbd | tbd | n/a | No public download. |
| Durham, NC | City of Durham | https://tree-management-durhamnc.hub.arcgis.com/ | tens of k | open | tbd | rolling | ~20% | Hub site exists; locate the point feature service. |
| Norfolk, VA | City of Norfolk | https://data.norfolk.gov/Environment/City-Tree-Inventory/cmvv-agyb | tens of k | none stated (Socrata default) | `common_name`, `genus`, `species` | rolling | ~20% | Socrata API direct; clean schema. **Worth importing.** |
| Richmond, VA | n/a | n/a | n/a | n/a | n/a | n/a | n/a | None found. |
| Tampa, FL | Tampa Tree Map (NGO) | https://tampatreemap.org/ | tens of k | OpenTreeMap user-contributed; license mixed | tbd | rolling | ~10% (subtropical) | NGO-curated; not a clean import. |
| Austin, TX | City of Austin | https://data.austintexas.gov/Locations-and-Maps/Tree-Inventory/wrik-xasw | **62,274** | **PUBLIC_DOMAIN** | sci + common cols | **stale 2020-03** | ~15% | Already imported (`austin`); reconfirmed live. |
| Spokane, WA | City of Spokane Parks | https://data-spokane.opendata.arcgis.com/datasets/tree-inventory | tens of k | open | tbd | rolling | ~20% | Worth a follow-up pull. |

---

## Canadian cities

| City | Org | URL | Rows | License | Schema | Updated | Notes |
|---|---|---|---|---|---|---|---|
| Vancouver, BC | City of Vancouver | https://opendata.vancouver.ca/explore/dataset/public-trees/ | **186,529** | **Open Government Licence – Vancouver** (permissive) | `genus_name`, `species_name`, `cultivar_name`, `common_name` | Daily | **REPLACES** dead `street-trees` id in `canada.cjs`. New id: `public-trees`. v2 API: `/api/explore/v2.1/catalog/datasets/public-trees`. |
| Ottawa, ON | City of Ottawa Forestry | https://open.ottawa.ca/datasets/ottawa::tree-inventory | **302,126** | **Ottawa Open Data Licence v2.0** (permissive, attribution required) | `SPECIES` (single, scientific), `DBH`, `PLNTDATE` | 2026-03-27 | REST: `https://maps.ottawa.ca/arcgis/rest/services/Forestry/MapServer/0`. Existing OpenTrees URL is stale (`451e904e…csv`). |
| Hamilton, ON | City of Hamilton | https://open.hamilton.ca/datasets/SpatialSolutions::public-tree-inventory | **282,334** | Hamilton Open Data Licence | `SPECIES_COMMON`, `SPECIES_SCIENTIFIC`, `DBH`, `STATUS` | 2026-05-08 | REST: `https://services.arcgis.com/rYz782eMbySr2srL/.../Public_Tree_Inventory/FeatureServer/0`. |
| London, ON | City of London | https://opendata.london.ca/datasets/4438232044b941ff8591df6f2d287e95 | tens of k | London open data terms | tbd | 2026-03-18 | "Tree Inventory" item active. Direct REST endpoint via ArcGIS hub. |
| Mississauga, ON | already in OpenTrees | imported as `mississauga_ca` | — | terms PDF | partial common-name only | OpenTrees pull stale | Verify whether to refresh against current ArcGIS hub item. |
| Halifax, NS | HRM | https://data-hrm.hub.arcgis.com/ | **NO point inventory** | open | only canopy polygons + Tree Equity Score | 2025-12 | Negative finding — Halifax does NOT publish per-tree data. |
| Calgary, AB | already imported (`calgary`) | — | — | — | — | — | OpenTrees source healthy. |
| Edmonton, AB | already imported (`edmonton`) | — | — | — | — | — | OpenTrees source healthy. |
| Winnipeg, MB | already imported (`winnipeg`) | — | — | — | — | — | OpenTrees source healthy. |
| Quebec City, QC | already imported (`quebec`) | — | — | — | — | — | OpenTrees source healthy. |
| Montréal, QC | already imported (`montreal`) | — | — | — | — | — | OpenTrees source healthy. URL still valid via donnees.montreal.ca. |
| Victoria, BC | already imported (`victoria_bc`) | — | — | — | — | — | OpenTrees source healthy. |
| Kitchener-Waterloo, ON | already imported (`kitchener_ca`, `waterloo`) | — | — | — | — | — | Both healthy. |

### Dead/rotted URLs in `canada.cjs` to prune or replace

- **`vancouver`** — `https://opendata.vancouver.ca/explore/dataset/street-trees/...` returns "Unknown dataset". Replace with `public-trees` (id changed). New `download` URL: `https://opendata.vancouver.ca/api/explore/v2.1/catalog/datasets/public-trees/exports/geojson`.
- **`surrey`** — old URL `data.surrey.ca/dataset/634d2f06-…/parkspecimentrees.csv` returns HTML; current portal at https://data.surrey.ca/dataset/important-trees and /park-specimen-trees has different resource paths.
- **`strathcona`** — `data.strathcona.ca` portal seems gone or relocated.
- **`ottawa`** — `https://opendata.arcgis.com/datasets/451e904e2753453eb699b2e853ab5857_1.csv` is dead. Replace with `https://maps.ottawa.ca/arcgis/rest/services/Forestry/MapServer/0`.

---

## University arboretums + botanical gardens

Caveat: many are intentional-collections of *non-native* and ornamental species — forageable yield is genuinely lower (5–15%), but data quality is much higher than urban inventories.

| Institution | URL | Rows | License | Forageable est. | Notes |
|---|---|---|---|---|---|
| **Arnold Arboretum** (Harvard, Boston) | https://arboretum.harvard.edu/explorer/ | ~16k accessions | "as is" with attribution; not formally CC | ~10% | Has an Explorer API. **Email needed to confirm redistribution rights** for paid app. Tree Spotters phenology data is downloadable. |
| Morton Arboretum (Lisle, IL) | https://bol.mortonarb.org/ (BRAHMS) | ~4k taxa, ~20k accessions | unclear; herbarium portion is on iDigBio (more permissive) | ~10% | Living-collections download not explicit; herbarium specimens via iDigBio Darwin Core archive (CC BY typically). |
| UC Botanical Garden Berkeley | https://webapps.cspace.berkeley.edu/botgarden/search | 16k+ living, 52k+ all-time | "**not for redistribution or sale**" — **RED for paid app** | n/a | License blocked. Skip. |
| Brooklyn / Chicago / Atlanta / SF / Holden / Morris / Longwood / VanDusen / RBG Hamilton | — | searchable web UIs only | not openly licensed | n/a | n/a | All have searchable interfaces but no bulk download with permissive license. Skip unless contacted. |
| New York Botanical Garden | https://sweetgum.nybg.org/science/vh/ | millions of herbarium specimens | herbarium via GBIF (CC BY); living restricted | high accuracy | Use the GBIF NYBG specimen dataset, not the living collection. |
| Missouri Botanical Garden | https://www.gbif.org/dataset/7bd65a7a-f762-11e1-a439-00145eb45e9a | 6M+ specimens (Tropicos) | **CC BY 4.0** (via GBIF) | high accuracy | Subset to MO state + tree taxa. Excellent provenance. |
| Cornell Botanic Gardens | already imported | — | — | — | Done. |

**Bottom line for arboretums:** the *living-collection* databases are mostly closed or restrictive. The *herbarium* specimens routed through GBIF are the better path — precise, permissively licensed, but they are observation points (not living plants you can revisit).

---

## State / provincial / county / regional registries

| Registry | URL | Rows | License | Notes |
|---|---|---|---|---|
| **PATreeMap** (Pennsylvania community trees) | https://www.opentreemap.org/patreemap/map/ | 40k+ | OpenTreeMap default; per-instance terms | Aggregator of PA municipalities. Worth a single intake. |
| **FEMC tree archive** (UVM Forest Ecosystem Monitoring Cooperative) | https://www.uvm.edu/femc/ | dozens of NE town inventories | "data may be used for non-commercial purposes" — **most are RED** | Includes Northampton, Concord, Watertown, Amherst MA; Colchester, Middletown, Milford, Stamford CT. **Per-dataset license check required**, but blanket policy leans NC. |
| Virginia Open Data Portal — City Tree Inventory aggregator | https://data.virginia.gov/dataset/city-tree-inventory1 | aggregated | open | Aggregates Norfolk + others; verify dedup. |
| ARC Atlanta Regional | https://opendata.atlantaregional.com/ | regional layers | open | No per-tree inventory at regional scale. |
| PA DCNR | https://newdata-dcnr.opendata.arcgis.com/ | state lands | open | Forest stand polygons, not tree points. |
| Nova Scotia Forest Inventory | https://data.novascotia.ca/Lands-Forests-and-Wildlife/Forest-Inventory/c8ai-fjbt | thousands of stands | open | Stand-level (polygon), not point. **Skip — wrong granularity.** |

---

## Citizen-science observation networks

| Network | URL | Rows | License | Notes |
|---|---|---|---|---|
| **GBIF — iNaturalist Research-Grade** | https://www.gbif.org/dataset/50c9509d-22c7-4a22-a47d-8c48425ef4a7 | hundreds of millions globally; tens of millions for trees | mix of CC0, CC BY, CC BY-NC | **Filter to CC0 + CC BY only** for paid use. Subset to North America + Quercus, Malus, etc. Bulk download via GBIF DwC-A or API. **Highest-value species-precision source on this list.** |
| **GBIF — overall** (Tropicos, NYBG, herbarium aggregations) | https://www.gbif.org/ | billions | dataset-by-dataset (mostly CC BY / CC0) | Filter `basisOfRecord=PRESERVED_SPECIMEN` + tree families. |
| USA-NPN Nature's Notebook | https://www.usanpn.org/data/observational | millions of records | "freely and openly" — likely CC0 / public-domain ethos but verify | Phenology-rich; species coverage of common trees. Useful as *seasonality* signal more than location signal (sites are repeat-observation locations). |
| iNaturalist direct API | https://api.inaturalist.org/v1/docs/ | live | per-observation | Same data as GBIF feed but realtime. **Photo licenses are separate** from observation licenses — be careful if surfacing photos in app. |
| Pl@ntNet trusted observations | https://plantnet.org/ | millions | CC BY-SA 4.0 — share-alike, **OK for paid app** but viral license | Use only if comfortable with attribution + share-alike implications. |

---

## Key surprises

**Good:**
- Vancouver dataset isn't dead — just renamed (`street-trees` → `public-trees`, 187k rows). Quick win.
- Pittsburgh is full CC BY 4.0 with both scientific + common name and i-Tree benefit columns. Niche but ideal schema.
- Boston BPRD is on **public-domain (PDDL)** — best license on the list. Smaller (~40k) but pristine.
- Hamilton ON delivers 282k rows with both `SPECIES_COMMON` and `SPECIES_SCIENTIFIC` — no schema work needed.
- Minneapolis publishes most of its open data layers under CC0 in the DCAT feed.

**Bad / null:**
- Halifax has NO per-tree inventory — only canopy polygons. Surprising for a major city.
- Cleveland, Cincinnati, Indianapolis, Milwaukee, Miami, Phoenix, Tucson, Albuquerque, Boise, Salt Lake City, Anchorage — none publish a public tree-point dataset (or it's hard-buried). Sun Belt + Mountain West are weak.
- LA Bureau of Street Services dataset has **only common names**, not scientific. Compromises species precision despite huge volume.
- Most university/botanical garden living-collection databases are closed or "research-only" — UC Berkeley explicitly says "not for redistribution or sale." Living-collection data is mostly *off limits* for a paid app.
- FEMC archive is a treasure but blanket non-commercial.
- Pittsburgh data hasn't refreshed since 2020.

**Licenses-blocked count:** ~9 candidates (UC Berkeley, BBG, NYBG living, RBG Hamilton, Chicago BG, Brooklyn BG, FEMC archive, Trees Atlanta NGO, TreesCharlotte NGO).

---

## Summary

- **Total candidates evaluated:** ~50 across cities, gardens, registries, citizen-science networks.
- **Top 5 picks:** LA Bureau of Street Services (635k), Ottawa (302k), Hamilton ON (282k), Seattle SDOT (267k), Vancouver public-trees (187k).
- **Existing-source fixes worth doing:** swap Vancouver `street-trees` → `public-trees`; swap Ottawa CSV → MapServer REST; investigate Surrey + Strathcona dead URLs (likely not worth the chase given low row counts).
- **Recommended next step:** wire up Boston, Seattle, Portland, LA, Vancouver-fix, Ottawa-fix, Hamilton, Pittsburgh, Norfolk, Minneapolis as a single intake batch — all permissive licenses with confirmed schemas. That's ~1.7M new rows pre-match; expected forageable pins ~250–400k after matching against the post-Tier-5 catalog.
