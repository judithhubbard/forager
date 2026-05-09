# College-towns deep-crawl shortlist

Research pass for issue #66. Goal: find layered tree-data sources at college
towns where 2–4 stackable datasets per location (campus + university BG/arb +
city street trees + cemetery/preserve) yield disproportionately high pin
density. Reference model: Ithaca (Cornell CTI ~38k + Cornell BG ~1k + Ithaca
TI). Skips findings already in `deep-crawl-shortlist.md` (#57). Paid app →
CC BY-NC excluded.

Caveat: most ArcGIS Hub pages are JS-rendered, so exact row counts and license
strings need a follow-up FeatureServer ping at intake time. Estimates below
come from press releases, ArbNet, news, and dataset blurbs that did render.

---

## Top 10 prioritized locations

Ranked by total layered yield × license clarity × intake ease. "Yield" =
estimated forageable pins (i.e. trees that survive the genus filter, not the
total inventory).

| # | Town | Layered sources | Est. total inventory | Est. forageable | Why |
|---|---|---|---|---|---|
| 1 | **Ann Arbor, MI** | UM campus (~17k) + Matthaei BG/Nichols Arb GIS hub + City TI (42k trees + 8k stumps) | ~67k | **~12–18k** | Big stack, all under permissive municipal/university terms; Davey-collected city data plus a UM grounds inventory of 17k+ trees. |
| 2 | **St. Louis, MO** (Wash U + MoBOT) | WashU Arboretum (~6.5k trees, 409 species, TreeKeeper) + Missouri Botanical Garden via Tropicos (CC BY 4.0 on GBIF, millions of specimens) | very large | **~10–20k** (specimens) + ~1.5k (campus) | MoBOT is the single best-licensed huge BG dataset in the US (CC BY 4.0). Tropicos covers the MO living + herbarium collections. |
| 3 | **Madison, WI** | UW Arboretum Explorer (large native + restored prairie/forest collection) + Olbrich BG + City of Madison street trees (refresh — currently in OpenTrees stale 2020) | ~30–50k | **~6–12k** | UW Arboretum is one of the most famous in the US and has its own Explorer search portal. City refresh worth doing. |
| 4 | **Cambridge / Boston, MA** | City of Cambridge Street Tree Map (covers City + DCR + MIT + Harvard parcels) + MIT TreeKeeper (~2,300) + Mt. Auburn Cemetery (5,000 trees, 640 species) + Arnold Arboretum Explorer (~16k) | ~30–40k | **~8–14k** | Cambridge's dataset uniquely already includes university trees on city map. Mt. Auburn is the densest hardwood collection in New England. |
| 5 | **Bloomington, IN** | IU Tree Inventory (12,734 mapped, ArcGIS Hub) + City of Bloomington TreeKeeper (Socrata open) | ~25–35k | **~5–8k** | Both feed the same TreeKeeper backend; clean Socrata + ArcGIS Hub access. Press release confirms 12,734 IU pins. |
| 6 | **Charlottesville, VA** | UVA Open Data hub (rebroadcasts city dataset) + City of Charlottesville Tree Inventory Point | tens of k | **~4–7k** | Cleanest ArcGIS Hub access of any college town. UVA library re-publishes the city data at `data-uvalibrary`. |
| 7 | **Davis, CA** | UC Davis Public Tree Database (web app, GIS hub) + UC Davis Arboretum (IrisBG-backed, ~22k accessions on 100 acres) + City of Davis (~32k trees) | ~50k | **~6–10k** | Three solid layers. UC Davis Arboretum publishes per-plant maps; license needs verification. |
| 8 | **Burlington, VT** | UVM Campus TI (FEMC, **2,502 rows, CC BY-SA 4.0**) + UVM Hort Farm (700+ ornamentals) + Burlington street trees (FEMC) | ~5–10k | **~1–2k** | Small but every dataset is openly licensed via UVM's FEMC archive. Multi-tree-college reference model. |
| 9 | **Princeton, NJ** | Princeton Municipality TreeKeeper (**~19k trees, stumps, vacant pits** — guest login access) + campus (no public dataset) | ~19k | **~3–5k** | TreeKeeper guest access works but isn't a clean download — needs scraping. Princeton U itself has no public per-tree dataset. |
| 10 | **Eugene, OR** | City of Eugene Urban Forest Public (ArcGIS Hub) + UO Atlas of Trees (~4k trees, 500+ species, PDF only) + Mount Pisgah Arboretum (339 species, no per-pin data) + Hendricks Park (rhodos, no point data) | ~20–30k city | **~4–8k** | Strong city data; UO trees only available as PDF tour, would require digitization. |

Honorable mentions (rank 11–14): **Athens-Clarke County, GA** (open ArcGIS hub + UGA campus arboretum spreadsheet), **Chapel Hill / Durham, NC** (Durham has a clean ArcGIS hub Trees & Planting Sites layer, UNC has a hub-published tree inventory layer), **Iowa City, IA** (UI Campus Arboretum 8,000 trees via ArcGIS app — license unclear), **Berkeley, CA** (city data Socrata, plus UC BG **NC-blocked**).

---

## Per-location detail

### 1. Ann Arbor, MI

| Source | Org | URL | Rows | License | Schema | Updated |
|---|---|---|---|---|---|---|
| UM campus trees | U-Michigan Grounds | mfield.umich.edu / ArcGIS hub via Facilities | ~17,000 inventoried trees | UM-internal, no formal redistribution license stated → **needs email** | likely sci + common (Davey-style) | rolling |
| Matthaei BG / Nichols Arb GIS hub | MBGNA | https://mbgna.umich.edu/natural-area-data-resources | ~1–3k woody plants | unstated; "natural area data resources" page | sci + common | rolling |
| City of Ann Arbor street trees | A2gov | https://data.a2gov.org/city-of-ann-arbor/street-trees-inventory | **42,000 trees + 8,000 stumps/sites** (2009 Davey baseline; refreshed 2025-09-29) | a2gov open terms (no NC clause observed) | typical Davey schema (sci + common) | 2025-09-29 |

**Notes**: City + UM together ~60k pins. UM campus dataset isn't on the city
portal; check Facilities/Grounds. Nichols Arb is partial in OpenTrees, likely
incomplete vs MBGNA's GIS hub.

### 2. St. Louis, MO (Wash U + MoBOT)

| Source | Org | URL | Rows | License | Schema | Updated |
|---|---|---|---|---|---|---|
| WashU Arboretum | Wash U | https://trees.wustl.edu/ + TreeKeeper at wustledudanforth.treekeepersoftware.com | **~6,500 trees, 409 species, 864 taxa** | unstated on Excel download; Excel public via "Other Resources" | sci + common + accession | 2024 inventory |
| Missouri Botanical Garden — Tropicos specimens | MoBOT | https://ipt.mobot.org:8080/ipt/resource.do?r=tropicosspecimens (also via GBIF dataset) | ~6M specimens (Tropicos-wide) | **CC BY 4.0** via GBIF | full Darwin Core | rolling |
| MoBOT living collection (LCMS) | MoBOT | https://www.missouribotanicalgarden.org/gardens-gardening/our-garden/plant-records | tens of k accessions | unstated for living collection (search portal at livingcollections.org); herbarium portion = CC BY | sci + common + accession | rolling |

**Notes**: MoBOT is the single biggest forageable BG opportunity in the US
via the GBIF/CC-BY herbarium pipeline. Living-collection isn't openly
licensed but is searchable. Combine with WashU's Excel.

### 3. Madison, WI

| Source | Org | URL | Rows | License | Schema | Updated |
|---|---|---|---|---|---|---|
| UW Arboretum Explorer | UW Madison Arboretum | https://uwarboretum.arboretumexplorer.org/ | thousands; restored prairie + forest mosaic + curated specimens | unstated; explorer is the Garden Explorer / IrisBG hosted product | sci + common + accession | rolling |
| Olbrich BG | City of Madison Parks (operated by Olbrich Botanical Society) | https://www.olbrich.org/ | thousands | **no public download** found; map UI only | n/a | n/a |
| City of Madison street trees | City of Madison | https://data-cityofmadison.opendata.arcgis.com/datasets/cityofmadison::street-trees | tens of k | City of Madison open terms (default; verify) | sci + common, DBH, inventory date, last inspection | last update **2025-03-26** (per earlier metadata) |
| UW Lakeshore Nature Preserve | UW Madison | https://lakeshorepreserve.wisc.edu/ | 300-acre preserve; vegetation polygons not point trees | unstated | n/a per-tree | n/a |

**Notes**: Existing OpenTrees `madison` source is stale (2020 in #57 audit);
the live portal is fresher (2025-03-26). Olbrich is the gap — searchable but
not downloadable. UW Arboretum Explorer needs a license email.

### 4. Cambridge / Boston, MA

| Source | Org | URL | Rows | License | Schema | Updated |
|---|---|---|---|---|---|---|
| Cambridge Street Tree Map | City of Cambridge | https://data.cambridgema.gov/Public-Works/Street-Tree-Map/ympr-x3we | tens of k (city + DCR + Harvard + MIT + private commitments) | Cambridge Open Data (default Socrata, public domain leaning) | sci + common typical | rolling |
| MIT campus trees | MIT Facilities (Davey TreeKeeper) | https://satcg.maps.arcgis.com/apps/OnePane/basicviewer/index.html?appid=7c0ecfabd8d7442f9ee31951addcce9e | **2,264** (Davey 2017 inventory) | MIT internal; **not a clean open license** | sci + common + condition | 2017 |
| Mount Auburn Cemetery Flora | Mt. Auburn | https://www.mountauburn.org/map/ ("Flora Mount Auburn", Blue Raster) | **~20,000 plantings (5,000 trees, 6,000 shrubs, 4,000 groundcover, 2,500 taxa)** | not formally licensed; CSV export available from search UI | full sci + common + family + habit + accession | rolling |
| Arnold Arboretum (Harvard, technically Boston) | Harvard | https://arboretum.harvard.edu/explorer/ | ~16,000 living accessions + Tree Spotters | "as is" with attribution; **needs explicit redistribution sign-off** for paid app | full Darwin Core-ish | rolling |

**Notes**: Cambridge merges city + Harvard + MIT into one map (rare). Mt.
Auburn's Flora portal exports tables — capture before any paywall. Arnold
Arboretum flagged in #57.

### 5. Bloomington, IN

| Source | Org | URL | Rows | License | Schema | Updated |
|---|---|---|---|---|---|---|
| Indiana University Tree Inventory | IU Capital Planning & Facilities | https://hub.arcgis.com/maps/f0686387c5154ae08047668fad1341bc/about | **12,734 trees** on Bloomington (23,000+ across all IU campuses) | IU; license not explicit on hub item | sci + common, DBH, condition | 2018-onwards rolling |
| City of Bloomington TreeKeeper inventory | City of Bloomington | https://data.bloomington.in.gov/dataset/TreeKeeper-Inventory/fmpy-m7cz | tens of k (full street + park) | Socrata default open data | TreeKeeper schema (sci + common + DBH + condition) | rolling |

**Notes**: Both backed by TreeKeeper, so dedup is essential. The IU dataset
is the largest non-Cornell university campus inventory uncovered in this
sweep that's actually published as a hub item.

### 6. Charlottesville, VA

| Source | Org | URL | Rows | License | Schema | Updated |
|---|---|---|---|---|---|---|
| Tree Inventory Point | City of Charlottesville Parks & Rec | https://opendata.charlottesville.org/datasets/tree-inventory-point | tens of k (all public-property trees in city) | Charlottesville open terms | typical sci + common | rolling (dashboard active) |
| Same dataset rebroadcast | UVA Library | https://data-uvalibrary.opendata.arcgis.com/datasets/charlottesville::tree-inventory-point/about | same | UVA Library Open Data terms | same | mirrored |

**Notes**: UVA itself does **not** publish a per-tree campus inventory under
that domain (its open data portal mirrors city data). State Arboretum of
Virginia (Blandy Farm) is in a different town (Boyce). Pair with the city
data — already a 2018-modern survey.

### 7. Davis, CA

| Source | Org | URL | Rows | License | Schema | Updated |
|---|---|---|---|---|---|---|
| UC Davis Public Tree Database | UC Davis | https://gis.ucdavis.edu/portal/apps/webappviewer/index.html?id=ea5e4b010fa44144b3d13825adb9cfba | tens of k | UC Davis open terms; **needs verification** | sci + common (IrisBG-style) | rolling |
| UC Davis Arboretum and Public Garden | UC Davis | https://arboretum.ucdavis.edu/plant-database — backed by IrisBG | ~22,000 accessions on 100 acres | unstated (IrisBG portal) | full Darwin Core-ish | rolling |
| City of Davis street trees | City of Davis | (Urban Forest Mgmt Plan StoryMap) + USFS 49-California-cities aggregate | ~12k street + ~15k park + ~5k ROW = ~32k | mixed: USFS aggregate is openly licensed | sci + common | various |

**Notes**: UC Davis is the cleanest UC for tree data; UC BG Berkeley was
**NC-blocked** in #57 ("not for redistribution or sale"). Confirm Davis isn't
under the same UC system terms before importing.

### 8. Burlington, VT

| Source | Org | URL | Rows | License | Schema | Updated |
|---|---|---|---|---|---|---|
| UVM Campus Tree Inventory | UVM Forest Ecosystem Monitoring Cooperative (FEMC) | https://www.uvm.edu/femc/data/archive/project/burlington_vermont_street_tree_inventory/dataset/burlington-vermont-uvm-campus-tree-inventory/data | **2,502 records** | **CC BY-SA 4.0** | FEMC schema (sci + common + DBH) | static archive |
| Burlington street trees | City of Burlington (FEMC mirror) | same FEMC archive, sibling dataset | tens of k | CC BY-SA 4.0 | same | static |
| UVM Hort Research & Education Center | UVM CALS | https://www.uvm.edu/cals/uvm-horticulture-research-and-education-center-hrec | 700+ ornamental cultivars on 97 acres | unstated; **likely needs email** | unknown | unknown |

**Notes**: FEMC is a goldmine — they archive multiple Vermont campus and
city tree inventories under uniform CC BY-SA 4.0. Middlebury College (#13
below) uses the same archive; same goes for the historical New Haven dataset.

### 9. Princeton, NJ

| Source | Org | URL | Rows | License | Schema | Updated |
|---|---|---|---|---|---|---|
| Princeton TreeKeeper | Municipality of Princeton | https://princetonnj.treekeepersoftware.com (guest login) | **19,000 trees + stumps + vacant pits** | TreeKeeper public access; municipal data → typically open but no formal license posted | TreeKeeper schema | rolling |
| Princeton University campus trees | Princeton U | n/a — only "Trees of Princeton" PDF book | ~thousands | not openly licensed | n/a | n/a |
| Marquand Park (private 17-acre arboretum) | Marquand Park Foundation | https://www.marquandpark.org/ | hundreds | not openly licensed | n/a | n/a |

**Notes**: Princeton U itself is a negative finding. Municipal TreeKeeper
needs a scraper (no formal CSV download surfaced).

### 10. Eugene, OR

| Source | Org | URL | Rows | License | Schema | Updated |
|---|---|---|---|---|---|---|
| City of Eugene Urban Forest (Public Trees View) | City of Eugene PWE | https://hub.arcgis.com/app/Eugene-PWE::city-of-eugene-urban-forest-public-1 | tens of k street + park | Eugene open data | sci + common | rolling |
| UO Atlas of Trees | UO Campus Planning & Facilities | https://cpfm.uoregon.edu/sites/default/files/treeatlas.pdf | ~4,000 trees, 500+ species (PDF only) | not openly licensed; PDF | n/a | static |
| Mount Pisgah Arboretum | MPA | https://mountpisgaharboretum.org/ | 339 plant species (text, not point data) | n/a | n/a | n/a |
| Hendricks Park rhododendron garden | City of Eugene Parks | n/a per-pin | n/a | n/a | n/a | n/a |

**Notes**: Eugene's city dataset is the bulk of the value. UO would need
manual digitization — skip for v1.

---

## Honorable mentions (11–20)

- **11. Athens, GA** — State BG of Georgia (323 ac, 11 collections) — no download. UGA Campus Arboretum (765-ac campus, 150 signs, "shapefile + attribute table" promised in Campus Sustainability Archive). Athens-Clarke open data hub.
- **12. Chapel Hill / Durham, NC** — Durham Trees & Planting Sites (clean modern ArcGIS Hub item, https://live-durhamnc.opendata.arcgis.com/datasets/DurhamNC::trees-planting-sites). Durham Urban Forest hub. UNC Chapel Hill Tree Inventory (hub-published). Chapel Hill Town Open Data. Sarah P. Duke Gardens + Coker Arboretum: no public per-plant download.
- **13. Middlebury, VT** — Middlebury College Tree Map (~**2,200 trees**, ArcGIS instant app). FEMC Middlebury Street Tree Inventory **CC BY-SA 4.0**. Vermont Community Forestry 2014 PDF.
- **14. New Haven, CT** — URI New Haven Street Tree Map (Yale URI, all city street trees, partial 2022 update). FEMC historical inventory **CC BY-SA 4.0**. Yale Marsh BG (8 ac, ~2k species, license unstated).
- **15. Iowa City, IA** — UI Campus Arboretum app (~**8,000 trees, 300+ species**), license unstated. City: PlanIT Geo TreePlotter (50k trees) but not publicly downloadable.
- **16. Pomona / Claremont, CA** — Rodman Arb (Pitzer, 10 ac). Pomona Trees index. Claremont Urban Arboretum (2014 city inventory). California Botanic Garden (86 ac native CA, license unverified). Stack of 4–5 layers but small per-source.
- **17. Smith / Northampton + Amherst, MA** — Smith Garden Explorer (https://scbg.gardenexplorer.org/, **5,459 accessions / 7,174 plants / 4,540 species**) license needs verification. UMass Waugh Arboretum + Amherst College: nothing public.
- **18. Bowdoin, Brunswick ME** — Bowdoin Tree Tour (**1,559 trees, 115+ species**), GIS StoryMap, license unstated.
- **19. Carleton / Northfield, MN** — Cowling Arb (800 ac, habitat polygons only). St. Olaf + city Northfield: nothing.
- **20. Grinnell, IA** — Grinnell College Tree Map (https://treemap.sites.grinnell.edu/), full campus, license unstated. City inventory not downloadable.

---

## Negative findings (no usable public data)

- **UC Berkeley BG** — NC-blocked ("not for redistribution or sale"); flagged in #57.
- **Princeton U campus** — only the "Trees of Princeton" PDF book.
- **Yale (campus core)** — only Yale Nature Walk (course project, partial); Marsh BG ArcGIS app has no license posted.
- **Dartmouth** — only "Elms of Dartmouth" clickable map and a Vital Communities walking tour.
- **Williams / Hopkins Memorial Forest** — research permanent-plot data (425 plots, 75-yr) by request only.
- **Whitman, Oberlin, Kenyon BFEC, Denison Bio Reserve, St. Olaf, Beloit, KU Lawrence** — Tree Campus USA designations but no public per-tree inventories.
- **Bryn Mawr / Haverford / Swarthmore** — Bryn Mawr Living Campus has GPS for select trees only; Scott Arboretum + Haverford no public DB. **All three need email.**
- **UGA Campus Sustainability Archive** — promises shapefile + attribute table but not surfaced in open hub; direct request required.

---

## Summary stats

- **Locations evaluated**: 24 (14 research-uni towns + 10 small-college towns)
- **Top 5 by yield**: Ann Arbor (~12–18k) · St. Louis [Wash U + MoBOT] (~10–20k) · Madison (~6–12k) · Cambridge/Boston (~8–14k) · Bloomington IN (~5–8k)
- **Surprises (positive)**:
  - **Cambridge MA's** city street tree map already merges municipal + Harvard + MIT + DCR — unusually federated.
  - **Mt. Auburn Cemetery's** Flora portal exposes a search-and-export UI for ~20,000 plantings with full taxonomy — best non-academic BG-style dataset found.
  - **WashU St. Louis** publishes a 2024 biodiversity Excel that combines TreeKeeper + iNaturalist + eBird with full sci/common.
  - **FEMC at UVM** is a regional open-data archive for Vermont campus + city tree inventories under **CC BY-SA 4.0** — picks up Middlebury and Burlington in one license sweep.
  - **Indiana University**'s 12,734-tree Bloomington dataset is the largest single-campus inventory found outside Cornell CTI.
  - **Charlottesville** rebroadcasts city tree data through UVA's library — clean dual access.
- **Surprises (negative)**:
  - The "Ivies + Seven Sisters" pattern is the *opposite* of land-grant unis: tiny published per-tree footprints (Yale, Princeton, Dartmouth, Williams, Bryn Mawr/Haverford/Swarthmore all negative or login-only).
  - **Whitman, Oberlin, Kenyon, Denison, Beloit, KU** all turn up nothing public despite Tree Campus USA designations — these institutions track internally but don't publish.
- **License-blocked count**: **2 confirmed NC/redistribution-blocked**:
  1. UC Botanical Garden Berkeley ("not for redistribution or sale", confirmed in #57)
  2. Arnold Arboretum / Harvard ("as is" + attribution, **needs sign-off** for paid app — provisional block)
- **License-unclear, email needed**: Smith College Garden Explorer, UC Davis Arboretum (IrisBG), MoBOT living LCMS, UM campus, Matthaei BG, UW Madison Arboretum, UO Atlas of Trees, MIT TreeKeeper export, Bryn Mawr/Haverford/Swarthmore Tri-Co.

---

## Implementation hints

- **Garden Explorer / IrisBG** (UW Arb, Smith) share a JSON shape — one importer.
- **TreeKeeper** instances (Princeton, WashU, Bloomington, Boston BPRD) share map widget; public CSV lives behind `/iframemap.cfm`. Generic scraper viable.
- **FEMC** archive: uniform CC BY-SA 4.0 CSVs cover Burlington + Middlebury + historical New Haven + MIT.
- **ArcGIS Hub** items uniformly accessible via FeatureServer `?f=geojson`; DCAT feed lists everything.
