# Tree-Inventory & Orchard Data Sources

Catalogue of public tree datasets the Forager import pipeline (`scripts/import/`)
could ingest. Filtered through `data/forageable_species.json`, these typically
yield 5–10% forageable pins (apples, mulberries, hickories, walnuts, plums,
serviceberries, etc.).

**Status legend**

- IMPORTED — already running through `scripts/import/<source>.ts`.
- PRIORITY — large permissive dataset, ready to script.
- BLOCKED — non-commercial / restrictive licence; **do not import** into the
  paid public tier.
- NEEDS-CHECK — terms unclear or only an interactive viewer is exposed; verify
  before scripting.

**Licence shorthand**

- PD = public domain / CC0
- ODbL = Open Database Licence
- OGL-* = various Open Government Licences (Canada / Toronto / Ottawa /
  Vancouver — all permissive with attribution; commercial use OK)
- CC BY = Creative Commons Attribution (commercial OK)
- CC BY-NC / NC-SA = non-commercial only — **incompatible with the $30/yr
  paid tier**
- City-OD = city-specific open-data terms; usually permissive with attribution

---

## 1. Major US cities

| City | Status | URL | Format | ~Rows | Licence | Notes |
|---|---|---|---|---|---|---|
| New York City | IMPORTED | https://data.cityofnewyork.us/Environment/2015-Street-Tree-Census-Tree-Data/uvpi-gqnh | Socrata CSV/GeoJSON | 683k | PD (CC0) | 2015 census; 2025 census being released. Both scientific + common name. |
| Chicago | IMPORTED | https://data.cityofchicago.org (Forestry) | Socrata | ~530k (combined) | City-OD permissive | Service-request tree dataset; full census is via Morton/CRTI. |
| San Francisco | IMPORTED | https://data.sfgov.org/Health-and-Social-Services/Street-Tree-Map/337t-q2b4 | Socrata (`tkzw-k3nq`) | ~200k | PD (DataSF) | `qspecies` field smushes Latin + common; framework parser splits it. |
| Los Angeles (city) | PRIORITY | https://geohub.lacity.org/datasets/266c6255b1fc4ae8b8f100d8696e1fa4_0 | ArcGIS REST | ~720k street + parks | City-OD permissive | Use the BSS layer; TreeKeeper-managed. ~920k including parks. |
| Los Angeles County | PRIORITY | https://egis-lacounty.hub.arcgis.com/datasets/los-angeles-county-public-works-road-maintenance-division-tree-inventory-public-view | ArcGIS REST | ~430k parkway | County OD permissive | Unincorporated county roads. Stiles aggregate covers 40+ municipalities. |
| Philadelphia | PRIORITY | https://opendataphilly.org/datasets/philadelphia-tree-inventory/ | CSV / SHP / GeoJSON / API | ~125k | City-OD permissive | Annual updates 2021–2025 in the same dataset. |
| Washington DC | PRIORITY | https://opendata.dc.gov/datasets/urban-forestry-street-trees | ArcGIS REST | ~175k | City-OD permissive | DDOT UFD; live feed updated weekly. |
| Boston | IMPORTED | https://data.boston.gov/dataset/bprd-trees | ArcGIS FeatureServer | ~38k | ODC PDDL (PD) | BPRD parks + street trees. Best PD licence of any large city. |
| Seattle | IMPORTED | https://data-seattlecitygis.opendata.arcgis.com/datasets/SeattleCityGIS::combined-tree-point | ArcGIS REST | ~200k | City-OD permissive | Combined SDOT + Parks + utility feeds. |
| Portland OR | IMPORTED | https://gis-pdx.opendata.arcgis.com/datasets/PDX::street-tree-inventory-active-records | ArcGIS REST | ~252k | City-OD permissive | Single `SPECIES` field "Sci - Common" concatenated. |
| Pittsburgh | IMPORTED | https://data.wprdc.org/dataset/city-trees | CKAN | ~46k | CC BY 4.0 | Stale since 2020; WPRDC re-publishes. |
| Detroit | NEEDS-CHECK | https://data.detroitmi.gov/ | ArcGIS Hub | ~170k (Davey study) | City-OD (verify) | Davey 2016 inventory exists; not obviously published as open data layer. Worth a direct GIS request. |
| Minneapolis | PRIORITY | https://opendata.minneapolismn.gov/datasets/tree-inventory | ArcGIS REST | ~210k | City-OD permissive | MPRB boulevard + park trees, 2010–2024. |
| Saint Paul | NEEDS-CHECK | https://information.stpaul.gov/ | (no tree layer published) | n/a | n/a | 500k+ trees claimed but no open dataset; submit a "Suggest a Dataset" request. |
| Cleveland | NEEDS-CHECK | https://www.clevelandohio.gov/ | (no public layer yet) | n/a | n/a | RFP issued 2023 for a city-wide ROW inventory; no published layer as of 2026. |
| Baltimore (city) | BLOCKED | https://data.baltimorecity.gov/datasets/baltimore-tree-inventory | ArcGIS REST | ~122k | **CC BY-NC-SA** (per Falling Fruit's audit) | Verify on portal — if NC-SA, exclude from paid tier. |
| Baltimore County | NEEDS-CHECK | https://opendata.baltimorecountymd.gov/datasets/BC-GIS::tree-inventory | ArcGIS REST | unknown | County OD (verify) | Separate from the city dataset. |
| Atlanta | NEEDS-CHECK | https://www.arcgis.com/apps/dashboards/af37a394b70d49cbbc346ccb08ee4a38 | ArcGIS dashboard | ~9k downtown + Trees Atlanta records | Mixed | Trees Atlanta is a nonprofit; downtown is a one-off academic survey. Reach out to Trees Atlanta for licensing. |
| Houston | NEEDS-CHECK | https://www.arcgis.com/apps/mapviewer/index.html?webmap=ef3851fa482d41d49cf2d82a399919f5 | ArcGIS web map | unknown | (viewer only) | Public web map exists; export terms unclear. Urban-FIA via TAMU is the published alternative. |
| Austin | NEEDS-CHECK | https://data.austintexas.gov/Locations-and-Maps/Tree-Inventory/wrik-xasw | Socrata | ~24k | City-OD permissive (Falling Fruit tags it CC BY-NC-SA — verify) | Conflict in licence reporting; check the portal directly before importing. |
| Denver | PRIORITY | https://data.colorado.gov/Natural-Resources/Tree-Inventory-Denver/wz8h-dap6 | Socrata | ~200k | CC BY 3.0 | Confirmed permissive in Falling Fruit audit. |
| Phoenix | NEEDS-CHECK | https://resilience.asu.edu/treelytics | viewer (ASU) | parks-only | (viewer) | Park-tree inventory only; whole-city forest is interactive but not downloadable. AZ DFFM AZUTM is the state-level alt. |
| Sacramento | PRIORITY | https://data.cityofsacramento.org/datasets/b9b716e09b5048179ab648bb4518452b_0/about | ArcGIS REST | ~100k | City-OD permissive | "City Maintained Trees." |
| San Diego | NEEDS-CHECK | https://www.sandiego.gov/transportation/urban-forestry | (no published layer) | n/a | n/a | 250k+ street trees claimed; no open data layer surfaced. TreeWatch SD is OpenTreeMap-style crowdsourced. |
| Colorado Springs | BLOCKED | https://data.coloradosprings.gov/dataset/City-of-Colorado-Springs-Trees/e6wv-b629 | Socrata | ~95k | **CC BY-NC-SA** | Exclude from paid tier. |
| Tempe AZ | PRIORITY | services3.arcgis.com (Tempe Tree Inventory 2020) | ArcGIS REST | ~26k | "No restrictions" | Small but cleanly licensed. |

---

## 2. US college towns / smaller cities (the "Ithaca model")

These are the deep-crawl targets — high data quality per capita, often
overlooked. Many use Davey + TreeKeeper as the back end.

| City | Status | URL | Format | ~Rows | Licence | Notes |
|---|---|---|---|---|---|---|
| Ithaca NY | IMPORTED | https://www.cityofithacany.gov/253/Tree-Inventory-GIS | ArcGIS REST | ~10k | City-OD permissive | Plus Cornell CTI (campus) — 12–14k. |
| Charlottesville VA | IMPORTED | https://opendata.charlottesville.org/datasets/charlottesville::tree-inventory-point | ArcGIS REST | ~8k | City-OD permissive | Genus + Species split (no full sci col). |
| Cambridge MA | IMPORTED | https://data.cambridgema.gov/Public-Works/Street-Trees/82zb-7qc9 | Socrata | ~40k | City-OD permissive | Federated: city + DCR + Harvard + MIT in one feed. |
| Madison WI | IMPORTED | https://data-cityofmadison.opendata.arcgis.com/datasets/cityofmadison::street-trees | ArcGIS REST | ~110k | City-OD permissive | Refreshed through 2025. |
| Hamilton ON | IMPORTED | https://open.hamilton.ca/datasets/SpatialSolutions::public-tree-inventory | ArcGIS FeatureServer | ~282k | City-OD attribution | Daily refresh. |
| Ann Arbor MI | PRIORITY | https://data.a2gov.org/ + https://www.arcgis.com/home/item.html?id=4fa7d2ff8c764aca9bd4d613f0f99dcb | ArcGIS REST | ~50k | City-OD permissive | Recent Davey UFMP-update layer is downloadable as GeoJSON. |
| Berkeley CA | PRIORITY | https://data.cityofberkeley.info/Natural-Resources/City-Trees/9t35-jmin | Socrata | ~37k | City-OD permissive (no restrictions stated) | 2013 inventory; trees + planting sites + stumps. |
| Boulder CO | PRIORITY | https://open-data.bouldercolorado.gov/datasets/Boulder::tree-inventory-open-data | ArcGIS REST | ~50k | City-OD permissive | Also has parks-trees dashboard. |
| Princeton NJ | NEEDS-CHECK | https://www.princetonnj.gov/1402/Tree-Inventory | (Davey TreeKeeper viewer) | ~19k | City-OD (verify) | Inventory complete; no obvious bulk-export endpoint. Email municipality. |
| Bloomington IN | PRIORITY | https://data.bloomington.in.gov/dataset/TreeKeeper-Inventory/fmpy-m7cz | Socrata | ~24k | City-OD permissive | TreeKeeper-backed, GIS-republished. |
| State College PA | NEEDS-CHECK | https://statecollegepa.us/788/Borough-Trees | (no public dataset) | ~7k | n/a | 2022 borough inventory by Penn State students; not yet open-data published. |
| Iowa City IA | NEEDS-CHECK | https://geodata.iowa.gov/ | (no city tree layer found) | unknown | n/a | State clearinghouse exists; no city layer surfaced. Worth a direct ask. |
| Salt Lake City UT | NEEDS-CHECK | https://www.arcgis.com/apps/PublicInformation/index.html?appid=504e416bad09442ea9031ba80f62fdf2 | ArcGIS viewer | ~91k | (viewer) | Inventory exists; bulk export not advertised. State of Utah FFSL hosts a parallel community-level inventory. |
| New Westminster BC | PRIORITY | https://opendata.newwestcity.ca/datasets/newwestcity::tree-inventory | ArcGIS REST | ~10k | Custom permissive (per FF audit) | Small but clean; gives BC zone-7 coverage. |

---

## 3. Canadian cities

| City | Status | URL | Format | ~Rows | Licence | Notes |
|---|---|---|---|---|---|---|
| Toronto | IMPORTED | https://open.toronto.ca/dataset/street-tree-data/ | Shapefile / GeoJSON | ~620k | OGL-Toronto (permissive) | Largest CA municipal dataset. |
| Montréal | PRIORITY | https://donnees.montreal.ca/en/dataset/arbres | CSV / GeoJSON | ~310k | CC BY 4.0 | Public trees: streets + parks. Spatial accuracy varies by borough. |
| Vancouver BC | PRIORITY | https://opendata.vancouver.ca/explore/dataset/street-trees/ | Opendatasoft API | ~151k street | City-OD permissive | Daily refresh on weekdays. Separate "Public Trees" layer adds park trees. |
| Ottawa | PRIORITY | https://open.ottawa.ca/datasets/ottawa::tree-inventory | ArcGIS REST | ~300k | OGL-Ottawa v2.0 (permissive) | ROW + parks + some private (advisory). |
| Calgary | PRIORITY | https://data.calgary.ca/Environment/Public-Trees/tfs4-3wwa | Socrata | ~530k | OGL-Calgary (permissive) | Includes natural area inventory. |
| Edmonton | PRIORITY | https://data.edmonton.ca/Environmental-Services/Trees/eecg-fc54/data | Socrata | ~380k | OGL-Edmonton (permissive) | Boulevard + open space; "Root for Trees" is a separate planting-site layer. |
| Winnipeg | PRIORITY | https://data.winnipeg.ca/Parks/Tree-Inventory/hfwk-jp4h | Socrata | ~300k | City-OD permissive | Botanical + common name + precise location. |
| Québec City | PRIORITY | https://www.donneesquebec.ca/recherche/dataset/vque_26 | CSV / GeoJSON / KML | ~125k | CC BY 4.0 | Plus separate "potentially remarkable trees" and "listed/unlisted" layers. |
| Halifax | NEEDS-CHECK | https://data-hrm.hub.arcgis.com/ | ArcGIS Hub | unknown | OGL (verify) | HRM hub exists; specific tree layer needs catalogue search. |
| Hydro-Québec tree directory | OFF-TOPIC | https://donnees.hydroquebec.com/explore/dataset/repertoire-arbres/ | Opendatasoft | (species list) | CC BY 4.0 | Reference catalogue, not pin data — useful for species crosswalks. |

---

## 4. Universities, arboreta & botanic gardens

These have curated, cultivar-level records — much higher data quality than
municipal feeds, but typically smaller (thousands, not hundreds of thousands).

| Institution | Status | URL | Format | ~Rows | Licence | Notes |
|---|---|---|---|---|---|---|
| Cornell Botanic Garden | IMPORTED | https://cornellbotanicgardens.org/ (BG-BASE) | custom | ~3k | Cornell terms | Already wired up. |
| Cornell Campus Tree Inventory (CTI) | IMPORTED | https://cugir.library.cornell.edu/catalog/cugir-009100 | Shapefile / GeoJSON | ~12–14k | CUGIR open | Prototype shape for `_framework.ts`. |
| Morton Arboretum (Lisle IL) | PRIORITY | https://chicago-region-trees-initiative-mortonarb.hub.arcgis.com/ | ArcGIS Hub | regional, varies | Mixed; CRTI hub layers permissive | Plus internal plant-records DB (4,300+ taxa, 290k specimens) — public search but no documented bulk export. |
| UW Botanic Gardens / Washington Park Arboretum | PRIORITY | https://depts.washington.edu/uwbg/gardens/bgbase.php + https://uwbgmaps.sefs.washington.edu/arcgis/rest/services/PublicFeatures/MapServer | CSV + ArcGIS REST | ~40k accessions | UW terms (research/edu use) | CSV export of full taxa list; ArcGIS REST for spatial. |
| UC Botanical Garden, Berkeley | BLOCKED | https://webapps.cspace.berkeley.edu/botgarden/search | CollectionSpace | ~52k accessions | **Restricted: education/research only, no redistribution** | Cannot ingest — explicit no-redistribution clause. |
| University of Montana Arboretum | NEEDS-CHECK | (task #49 noted in plan) | TBD | unknown | unknown | Per plan; not researched in depth here. |
| Arnold Arboretum (Harvard) | PRIORITY | https://arboretum.harvard.edu/research/data-resources/ + https://arboretum.harvard.edu/explorer/ | data downloads page | ~15k plants | Open per "Data Downloads" page | Plus 330k phenology obs through USA-NPN partnership. |
| Smithsonian Gardens | NEEDS-CHECK | https://gardens.si.edu/collections/plants/living-collections-management/collections-information-and-system-mapping/ | Plant Explorer / IrisBG | ~1.8k accessioned | Smithsonian terms | National-Mall scale. Not a bulk-export portal. |
| US National Arboretum | PRIORITY | https://usna.usda.gov/discover/plant-finder/ | Plant Finder + CSV export | unknown | PD (federal) | DC. Plant Finder explicitly supports CSV export. |
| JC Raulston Arboretum (NCSU) | NEEDS-CHECK | https://jcra.ncsu.edu/horticulture/our-plants/ | searchable web only | ~6,679 taxa | NCSU terms | No documented bulk export. |
| Penn State Arboretum | NEEDS-CHECK | https://psu.arboretumexplorer.org/ | ArborScope viewer | unknown | n/a | Bartlett-managed ArborScope; no public bulk download. |
| Hoyt Arboretum (Portland OR) | NEEDS-CHECK | https://hoytarboretum.gardenexplorer.org/ | Garden Explorer viewer | ~6k specimens | n/a | Web search only. |
| Holden Arboretum / Forests & Gardens | NEEDS-CHECK | https://holdenfg.org/flora-finder/ | "Flora Finder" web app | ~20k plants | n/a | Web-only viewer. |
| Longwood Gardens | NEEDS-CHECK | https://longwoodgardens.org/gardens/about-our-plants/plant-database | searchable PDF/web | ~10k taxa | n/a | Plant Explorer was retired. |
| Matthaei BG / Nichols Arboretum (UMich) | PRIORITY | https://mbgna-umich.opendata.arcgis.com/ | ArcGIS Hub | thousands | UMich terms (verify) | Has a published GIS hub with downloadable layers — uncommon for a botanic garden. |

---

## 5. Federal / state-level reference data

These are reference layers, not pin sources, but worth listing because Forager
also needs species crosswalks, phenology, and forageability metadata.

| Source | Status | URL | Format | ~Rows | Licence | Notes |
|---|---|---|---|---|---|---|
| USDA PLANTS Database | REFERENCE | https://plants.usda.gov/ | Web API + bulk | ~50k vascular taxa | PD (federal) | Authoritative US species symbols + native/introduced. Use for the species-crosswalk table, not pins. |
| USDA Forest Service FIA (forest plots) | REFERENCE | https://www.fia.fs.usda.gov/library/database-documentation/ | DataMart / API | millions of plots | PD (federal) | Wildland forest plots — coordinates fuzzed. Not useful for street pins; useful for native-range checks. |
| USDA Urban FIA + My City's Trees | REFERENCE | https://research.fs.usda.gov/programs/urbanfia + https://mct.tfs.tamu.edu/ | DataMart / API | ~30 cities published, more in progress | PD (federal) | Plot-based, not a tree census. Houston, Austin, Indianapolis et al. covered. |
| USA-NPN (Phenology) | PRIORITY | https://data.usanpn.org/observations/ + https://www.usanpn.org/data/observational | Portal + API + R client | millions of phenophase obs | PD-equivalent (federal) | Best per-zone phenology source for §5.10 of PLAN. |
| GBIF (USDA PLANTS mirror) | REFERENCE | https://www.gbif.org/dataset/705922f7-5ba5-49ab-a75d-722e3090e690 | Darwin Core | ~50k taxa | CC0 | Convenient programmatic access to USDA PLANTS. |
| Arizona Urban Tree Map (state-level) | NEEDS-CHECK | https://dffm.az.gov/azutm | ArcGIS hub | varies | OGL-AZ | State-level aggregation; Phoenix may be reachable here. |
| Utah FFSL Communities Inventory | NEEDS-CHECK | https://forestry.utah.gov/forestry/urban-and-community-forestry/utah-communities-urban-tree-inventory/ | ArcGIS app | varies | OGL-UT | Multi-city aggregator. |
| Wisconsin DNR Tree Inventories | REFERENCE | https://dnr.wisconsin.gov/topic/urbanforests/treeinventories | listing page | n/a | n/a | Pointer page to municipal inventories. |
| Pennsylvania DCNR Urban Forestry | REFERENCE | https://www.pa.gov/agencies/dcnr/programs-and-services/community-outreach-and-development/urban-and-community-forestry | listing | n/a | n/a | Pointer to municipal grant-funded inventories. |
| Nova Scotia DNRR Forest Inventory | REFERENCE | https://novascotia.ca/natr/forestry/gis/downloads.asp | various | provincial | OGL-NS | Wildland, not urban; useful for native-range. |

---

## 6. Aggregators (multi-city in one fetch)

Important shortcuts — these collapse dozens of small cities into single
ingestion runs.

| Source | Status | URL | Format | Rows / Cities | Licence | Notes |
|---|---|---|---|---|---|---|
| Dryad "5 million city trees / 63 US cities" | IMPORTED | https://datadryad.org/dataset/doi:10.5061/dryad.2jm63xsrf | per-city CSVs | ~5M / 63 cities | CC0 | Already wired (`dryad-city-trees.ts`). Picks up Albuquerque, Buffalo, Cincinnati, Indianapolis, Kansas City, Memphis, Milwaukee, Nashville, Oklahoma City, Omaha, Tampa, Tucson — many cities with no other open feed. |
| OpenTrees.org | REFERENCE | https://opentrees.org/ | aggregated viewer + per-source links | ~15M / 226 sources / 20 countries | mixed (per source) | Steve Bennett's harvester. **Use the source list as a discovery index**; pull from each source directly for clean licence chains. Stale-data risk (their `madison` was 2020-vintage; we re-pulled live ArcGIS and got 2025 data). |
| Stiles `la-trees` | REFERENCE | https://github.com/stiles/la-trees | per-municipality SHP/GeoJSON/GDB on S3 | ~1.6M / 40+ LA County municipalities | mixed (per source) | Excellent precedent for sub-LA-County coverage. |
| `lneftaliem/urban_tree_dataset` | NEEDS-CHECK | https://github.com/lneftaliem/urban_tree_dataset | varies | ~3.9M / N. America | per-source | Similar idea to OpenTrees. |
| FEMC archive (UVM) | REFERENCE | https://www.uvm.edu/femc/data/archive | per-project | varies | per-project | Holds historical Cambridge MA + MIT campus inventories and others. |

---

## 7. Falling Fruit

Per PLAN.md §6.8 / §1: **do not ingest Falling Fruit's data directly** — it is
CC BY-NC-SA, incompatible with the paid tier. But Falling Fruit's published
audit at https://fallingfruit.org/datasets is an excellent index of which
underlying municipal datasets exist and what their licences are. From that
index, the directly-pullable upstream sources we should consider include:

- City and County of Denver Tree Inventory — CC BY 3.0 (covered in §1).
- City of Quebec Trees — CC BY 4.0 (covered in §3).
- Tempe AZ 2020 Tree Inventory — no restrictions (covered in §1).
- New Westminster BC Tree Inventory — custom permissive (covered in §2).

And the ones Falling Fruit lists that are **NC-SA-tainted at the source** —
flagged here so we know to skip them:

- Cal Poly San Luis Obispo Tree Inventory — CC BY-NC-SA.
- Colorado Springs City Trees — CC BY-NC-SA.
- Baltimore City Tree Inventory — CC BY-NC-SA (per FF audit; verify on portal).
- Austin Tree Inventory — CC BY-NC-SA per FF audit, but the city's own portal
  page does not appear to assert NC. Verify before importing — could be a
  Falling Fruit pessimism.

---

## 8. Priority queue (recommended next imports)

Ranked by (rows × permissiveness × geographic-zone-coverage):

1. **NYC 2025 census** — refresh once published; PD; massive.
2. **Toronto** — already imported; verify scrape is up to date.
3. **Los Angeles (city, BSS)** — ~720k rows, big zone-9/10 hole in current coverage.
4. **Philadelphia** — ~125k, zone 7a, currently uncovered.
5. **Washington DC** — ~175k, zone 7b, currently uncovered.
6. **Montréal** — ~310k, CC BY 4.0, zone 5b sister to Ithaca.
7. **Ottawa** — ~300k, OGL, zone 5a.
8. **Vancouver BC** — ~151k, zone 8b/9a maritime PNW pair to Seattle.
9. **Calgary + Edmonton** — ~530k + ~380k, zones 3b–4a (currently no cold-zone coverage).
10. **Winnipeg** — ~300k, zone 3b.
11. **Denver** — ~200k, CC BY 3.0, zone 5b/6a continental.
12. **Sacramento** — ~100k, Mediterranean climate.
13. **Minneapolis MPRB** — ~210k, zone 4b.
14. **Ann Arbor** — ~50k, college-town anchor, zone 6a.
15. **Boulder** — ~50k, zone 5b/6a.

---

## 9. Open questions / follow-ups

- **Saint Paul, San Diego, Salt Lake City, Atlanta**: inventories exist
  internally but are not exposed as bulk open data. Worth a direct email to
  each city's GIS / forestry contact.
- **NYC 2025 census release timing**: the PLAN currently uses 2015 data;
  schedule a refresh task once 2025 lands on NYC Open Data.
- **Davey TreeKeeper portals** (Princeton, Bloomington, several college
  towns): some publish a public viewer but not a bulk-export endpoint. Check
  whether a `query?where=1=1&outFields=*&f=geojson` ArcGIS REST call works
  even when it isn't advertised.
- **Licence audit for Austin and Baltimore**: Falling Fruit tags both as
  CC BY-NC-SA, but the city portals do not assert that explicitly. Before
  importing, get the question to the relevant city open-data team in writing.
- **Botanic garden bulk exports**: most arboreta only expose a search UI.
  For Cornell BG we negotiated direct access; the same approach may work
  for Arnold, US National, Morton, etc. — but each is a separate ask, not
  a scriptable pipeline.
