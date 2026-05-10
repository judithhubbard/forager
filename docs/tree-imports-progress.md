# Tree-Inventory Import Progress

Status of municipal/arboretum tree-inventory imports into the Forager
public tier. Source-of-truth catalogue of *what's available* lives in
[`tree-data-sources.md`](./tree-data-sources.md); this file tracks
*what we've actually wired up and run* (or staged for review).

Last updated: 2026-05-10 (batch 2 — Québec municipalities + Stiles LA County).

## Status legend

- **DONE** — script in `scripts/import/`, npm script in `package.json`,
  imported into prod public tier.
- **STAGED** — script in `scripts/import/` and committed; awaiting
  review + an `import:<name>` npm script entry, then a run.
- **VIA AGGREGATOR** — covered indirectly by the Dryad 63-cities
  scrape or the OpenTrees municipal scrape; eligible for a future
  direct-source upgrade if the direct feed has cleaner taxonomy or
  more current data.
- **QUEUED** — researched and on the priority list; not yet scripted.
- **BLOCKED** — license incompatible with the paid public tier
  (CC BY-NC, CC BY-NC-SA, "no redistribution"); will not import.
- **NEEDS-CHECK** — endpoint status / schema / license unverified.

## Direct-source imports

| City / source | Status | Script | ~Rows | License |
|---|---|---|---|---|
| Ithaca, NY (city) | DONE | `ithaca-ti.ts` | ~10k | City-OD permissive |
| Cornell Campus Tree Inventory | DONE | `cornell-cti.ts` | ~12–14k | CUGIR open |
| Cornell Botanic Garden | DONE | `cornell-bg.ts` | ~3k | Cornell terms |
| New York City | DONE | `nyc-trees.ts` | ~683k | CC0 (PD) |
| Chicago | DONE | `chicago-trees.ts` | ~530k | City-OD permissive |
| San Francisco | DONE | `sf-trees.ts` | ~200k | PD (DataSF) |
| Boston | DONE | `boston-trees.ts` | ~38k | ODC PDDL (PD) |
| Seattle | DONE | `seattle-trees.ts` | ~200k | City-OD permissive |
| Portland, OR | DONE | `portland-trees.ts` | ~252k | City-OD permissive |
| Pittsburgh | DONE | `pittsburgh-trees.ts` | ~46k | CC BY 4.0 |
| Madison, WI | DONE | `madison-trees.ts` | ~110k | City-OD permissive |
| Cambridge, MA | DONE | `cambridge-trees.ts` | ~40k | City-OD permissive |
| Hamilton, ON | DONE | `hamilton-trees.ts` | ~282k | City-OD attribution |
| Charlottesville, VA | DONE | `charlottesville-trees.ts` | ~8k | City-OD permissive |
| Toronto, ON | DONE | `toronto-trees.ts` | ~620k | OGL-Toronto |
| Los Angeles (city, BSS) | DONE | `la-trees.ts` | ~720k | City-OD permissive |
| Philadelphia | DONE | `philadelphia-trees.ts` | ~125k | City-OD permissive |
| Washington DC | DONE | `dc-trees.ts` | ~175k | DC-OD permissive |
| Vancouver, BC | DONE | `vancouver-trees.ts` | ~186k | OGL-Vancouver |
| **Montréal** | **STAGED (this batch)** | `montreal-trees.ts` | **~334k confirmed via CKAN datastore** | CC BY 4.0 |
| **Calgary direct** | **STAGED (this batch)** | `calgary-trees.ts` | **~500k TREE rows (580k incl. stumps)** | City of Calgary OD |
| **Sacramento** | **STAGED (this batch)** | `sacramento-trees.ts` | **~107k confirmed via ArcGIS** | Sacramento OD |
| **Minneapolis MPRB park trees** | **STAGED (this batch)** | `minneapolis-mprb-trees.ts` | **~9k (see caveat below)** | Minneapolis OD |
| **Québec City** | **STAGED (batch 2)** | `quebec-city-trees.ts` | **~158k confirmed via CKAN datastore** | CC BY 4.0 |
| **Saguenay** | **STAGED (batch 2)** | `saguenay-trees.ts` | **~28k confirmed via CKAN datastore** | CC BY 4.0 |
| **Repentigny, QC** | **STAGED (batch 2)** | `repentigny-trees.ts` | **~164k confirmed via CKAN datastore** | CC BY 4.0 |
| **Longueuil, QC** | **STAGED (batch 2)** | `longueuil-trees.ts` | **~99k confirmed via static GeoJSON** | CC BY 4.0 |
| **Stiles LA-County aggregator** | **STAGED (batch 2)** | `stiles-la-county-trees.ts` | **~391k across 8 LA-County cities (see below)** | MIT (Stiles) + permissive upstream |

### Notes on the staged batch (4 new scripts)

#### Montréal — `montreal-trees.ts`
- CKAN datastore: `donnees.montreal.ca/api/3/action/datastore_search`,
  resource `64e28fe6-ef37-437a-972d-d1d3f1f7d891`. Uses the existing
  `fetchCkanDataStore` framework helper — same pattern as Pittsburgh.
- Verified row count: **334,307**. (The deep-crawl doc's "~310k"
  estimate was slightly low; the dataset has grown.)
- Schema confirmed live: `Essence_latin`, `Essence_fr`, `Essence_ang`,
  `Latitude`, `Longitude`, `_id` as the OID. Direct CSV download via
  Google Storage is blocked ("RBAC: access denied"); the CKAN
  datastore API is the supported access path.
- Licence: **CC BY 4.0** confirmed in package metadata
  (`license_id: cc-by`).
- Pre-req: create a `Montréal public` region row.

#### Calgary direct — `calgary-trees.ts`
- ArcGIS Online item `dfdce03f6fe24bd693c67fc43a9ca7e9`
  (owner: `calgary.ca`); REST endpoint
  `services1.arcgis.com/AVP60cs0Q9PEA8rH/.../Public_Trees/FeatureServer/0`.
- Verified row counts: 580,213 total / 500,491 with `ASSET_TYPE='TREE'`
  (the rest are stumps + planting sites; filtered server-side).
- Why direct vs. the Socrata mirror (`tfs4-3wwa.json`): the ArcGIS
  layer exposes separate `GENUS`, `SPECIES`, `CULTIVAR`, `COMMON_NAME`
  columns. The Socrata endpoint flattens these into pre-joined
  uppercase strings ("ELM, BRANDON"), which made species matching
  noisier in the OpenTrees aggregator.
- Existing OpenTrees aggregator entry for Calgary (~474k rows) will
  effectively become a backup for any rows the direct script can't
  match — both write under different `import_source` ids so they
  don't collide.
- Licence: **City of Calgary Open Data Terms of Use** (per ArcGIS
  item licenseInfo).
- Pre-req: create a `Calgary public` region row.

#### Sacramento — `sacramento-trees.ts`
- ArcGIS Online item `b9b716e09b5048179ab648bb4518452b`; REST endpoint
  `services5.arcgis.com/54falWtcpty3V47Z/.../City_Maintained_Trees/FeatureServer/0`.
- Verified row count: **107,402**. Schema is clean — `BOTANICAL`
  (Latin), `SPECIES` (common, in "common, modifier" form like
  "oak, coast live"), `CULTIVAR`, `ASSET_ID` as OID.
- Licence: Sacramento Open Data ("provided as a public service and
  for general informational purposes only" — permissive).
- Climate-zone significance: this is the first **Mediterranean
  climate** city (USDA 9b, Cfa/Csa transition) in the public tier,
  distinct from coastal CA (SF zone 10a) and inland-southern CA
  (LA zone 10a/10b).
- Pre-req: create a `Sacramento public` region row.

#### Minneapolis MPRB park trees — `minneapolis-mprb-trees.ts`
- **Caveat: the deep-crawl doc's "~210k MPRB direct" estimate is
  not achievable from a public endpoint as of 2026-05-10.**
  Verified findings:
  - Minneapolis ArcGIS Online org has the live MPRB park-tree feed
    `msvcMPRB_ParkTrees_PROD` (item `cca653c117e74c6e9eb6b3db4eb132e6`,
    owner `City_of_Minneapolis`), split into 6 sub-layers by tree
    group. Total live rows: **8,964** (Conifer 1,091 / Ash 910 /
    Elm 709 / Maple 1,183 / Oak 1,480 / Other Deciduous 3,591). This
    is the parks-only layer.
  - The full city street-tree inventory (~210k records, the source
    that the Dryad 63-cities scrape pulls its ~47k Minneapolis subset
    from) lives at `City_of_Minneaoplis_Health_Dept._view`. Querying
    it returns `499 Token Required` — it is a private layer, not a
    public open-data feed. The "Tree Inventory" shapefile published
    in 2014 (item `ab795a832412417288dd0925e7caf950`) is a 2012
    Davey extraction, identical to what Dryad already covers.
  - The annual `Tree_Inventory_2016/2017/2018` feature services
    (each ~800–1,500 rows) are *Tree Sale program* addresses
    (residential subsidized planting), not the city forestry
    inventory.
- The staged script imports the MPRB park-trees feed (~9k rows) by
  unioning all 6 sub-layers and tagging the source layer in the
  external_id (`L0-`, `L1-`, … prefixes). Adds Minneapolis park-tree
  coverage that's *currently* maintained, complementing the
  2012-vintage Dryad subset.
- **Not blocking**: the Dryad subset already provides Minneapolis
  street-tree coverage; this MPRB feed adds parks. If the city ever
  exposes the 210k full-city inventory publicly, that becomes a
  separate import (probably named `minneapolis-citywide-trees.ts`).
- Pre-req: create a `Minneapolis MPRB public` region row.

### Notes on batch 2 (5 new scripts — Québec + Stiles LA-County)

#### Québec City — `quebec-city-trees.ts`
- CKAN datastore: `donneesquebec.ca`, resource
  `13a51853-a5b5-4add-8791-02ccba5c1be7` (package `vque_26`,
  "Arbres répertoriés"). Same `fetchCkanDataStore` helper as
  Montréal.
- Verified row count: **158,123**. Schema: `NOM_LATIN`,
  `NOM_FRANCAIS`, `LATITUDE`/`LONGITUDE` (decimal-degree strings),
  `NOM_TOPOGRAPHIE` (park/street context), `_id` as OID.
- License: **CC BY 4.0** confirmed in CKAN metadata (`license_id:
  cc-by`).
- Climate-zone significance: USDA 4b/5a continental humid; the
  *coldest* major-city import in the public tier alongside
  Saguenay below. Complements Montréal (5b/6a).
- Pre-req: create a `Québec public` region row.
- Other Québec City resources NOT imported by this script:
  `vque_31` (non-répertoriés — provisional/unverified trees,
  noisier) and `vque_82` (heritage subset, ~hundreds of rows).
  Both available as separate scripts later if useful.

#### Saguenay — `saguenay-trees.ts`
- CKAN datastore on `donneesquebec.ca`, resource
  `e529b48b-b17d-46e7-aaf2-6e408a38b6e8` (package
  `sag_inventaire-des-arbres-repertories`).
- Verified row count: **28,241**. Schema: lowercase
  `essence_latin`, `essence_fr`, `latitude`, `longitude` (decimal
  degrees as strings), plus `arrondissement` (Chicoutimi /
  Jonquière / La Baie), `parc`.
- License: **CC BY 4.0**.
- Climate-zone significance: USDA 3b/4a (boreal-margin
  continental) — extends our public tier into the *coldest* zones
  to date, well north of Montréal. Useful calibration anchor for
  northern species like *Betula papyrifera* and
  *Sorbus americana*.
- Pre-req: create a `Saguenay public` region row.

#### Repentigny — `repentigny-trees.ts`
- CKAN datastore on `donneesquebec.ca`, resource
  `0ab4da5a-b470-4774-9f2a-4d9bb19763a5` (package `vrep-arbres`).
- Verified row count: **164,116** — larger than expected for a
  ~85k-population suburb, reflecting Repentigny's mature, fully-
  inventoried tree canopy.
- Schema: `ESSENCE_LATIN`, `ESSENCE_FR`, `Latitude`, `Longitude`
  (decimal degrees as strings), `PROPRIETE` (terrain type).
- License: **CC BY 4.0**.
- Climate: same zone 5b as Montréal proper, but Repentigny sits on
  the inland (non-island) side of the Saint Lawrence — different
  microclimate.
- Pre-req: create a `Repentigny public` region row.

#### Longueuil — `longueuil-trees.ts`
- **No CKAN datastore for this resource** (verified 2026-05-10:
  `datastore_search` returns Not Found for resource
  `23cde69a-a1d7-4775-8271-e3b46b3a6d83`). Only paths are the
  static GeoJSON / SHP / KMZ downloads. Script uses the new
  `fetchGeoJsonUrl` framework helper to one-shot the 25MB GeoJSON.
- Verified feature count: **99,345**.
- License: **CC BY 4.0**.
- Schema is unusual: a single `Espece` property contains both
  Latin and French names joined by " - ", e.g.
  `"Acer rubrum - Érable rouge"`. The script splits on the
  first `" - "` to extract Latin (left) and French common (right).
  Genus-only rows (`Tilia sp. - Tilleul sp.`) fall through to the
  framework's binomial-only match and get skipped automatically.
- Geographic coverage: Longueuil agglomeration on the Saint
  Lawrence south shore — Longueuil, Boucherville, Brossard,
  Saint-Bruno-de-Montarville, Saint-Hubert, Saint-Lambert.
- Note: the dataset description says the inventory is *in progress*,
  so this is a growing snapshot. Re-running the script later will
  idempotently refresh existing coords + add new pins.
- No stable per-row id field in the GeoJSON; `externalId` is a
  truncated coord hash. Re-runs are still idempotent because pins
  collide on `(region_id, import_source, import_external_id)`.
- Pre-req: create a `Longueuil public` region row.

#### Stiles LA-County aggregator — `stiles-la-county-trees.ts`
- Repo: https://github.com/stiles/la-trees, top-level **MIT
  license**. Aggregator that re-publishes per-municipality LA-County
  tree inventories collected via CPRA requests or official OD
  portals.
- This single script iterates a manifest of 8 cities with
  known-permissive upstream open-data portals + clean schemas:
  Beverly Hills, Pasadena, Santa Monica, Long Beach, Glendale,
  Burbank, Culver City, West Hollywood. Each city becomes its own
  `import_source` (`stiles-beverly-hills`, `stiles-pasadena`, …)
  and lands in its own region (`Beverly Hills public`,
  `Pasadena public`, …). Failures on one city don't poison the
  others; the script catches per-city errors and continues.
- Schemas were verified live (2026-05-10) on each city's GeoJSON
  blob. Cities have *very* different column naming:
  - Pasadena: `Genus` + `Species` (UPPER-CASED separately) — script
    concatenates and case-normalizes.
  - Beverly Hills: `BOTANICAL` + `species`.
  - Santa Monica: `BotanicalN` + `species`; **geometry CRS is
    EPSG:2229 (CA State Plane Zone V)** — script uses property
    fields `lat`/`lon` (WGS84) instead.
  - Long Beach: `BOTANICALN` + `species`.
  - Glendale: `botanical` + `species`, with `lat`/`lon` properties.
  - Burbank: `SPP` (Latin binomial) — no common name; uses
    `lat`/`lon` properties.
  - Culver City: `BotanicalN` + `species`, lat/lon properties;
    rows with "Vacant site" filtered out.
  - West Hollywood: `BotName` + `species`, `Lat`/`Lon` properties
    (capitalized).
- Single-city runs supported via `CITY_SLUG` env var, e.g.
  `CITY_SLUG=pasadena npm run import:stiles-la-county-trees`.
- Estimated combined rows across the 8 enabled cities: **~391k**
  (per README counts: Pasadena 71k + Beverly Hills 29k + Santa
  Monica 32k + Long Beach 140k + Glendale 56k + Burbank 37k +
  Culver City 17k + West Hollywood 9k).
- **NOT imported** by this script (license audit pending or
  duplicate of existing feed):
  - `los-angeles-city` (duplicate of `la-trees.ts` BSS feed).
  - `los-angeles-county` (unincorporated areas — LA County DPW
    license terms not explicit).
  - 30+ other cities in the repo (Santa Clarita, Lancaster,
    Palmdale, Downey, Inglewood, etc.). The repo says these were
    "collected via the California Public Records Act"; CPRA outputs
    are public records but their *redistribution* terms vary by
    city ordinance. These can be enabled one at a time after a
    per-city open-data-portal license verification by adding them
    to the `CITIES` array in the script.
- Pre-req regions to create before running:
  `Beverly Hills public`, `Pasadena public`, `Santa Monica public`,
  `Long Beach public`, `Glendale public`, `Burbank public`,
  `Culver City public`, `West Hollywood public`.

## Imports via aggregator (OpenTrees + Dryad)

`scripts/import/opentrees-municipal.cjs` and
`scripts/import/dryad-city-trees.ts` handle a long tail of cities
in single runs. Cities currently covered (per OpenTrees centroids
list and Dryad cities list):

- **OpenTrees**: Edmonton, Calgary (will be superseded by the direct
  script above), Vancouver (superseded), Surrey BC, Winnipeg, Regina,
  Strathcona County, Ottawa, Moncton, Providence, Cupertino, Oxnard,
  Three Rivers Park District (MN), Mountain View, Richardson TX,
  Sioux Falls, Weston FL, West Chester PA, Champaign IL, St. Augustine
  FL, Bozeman MT, Nichols Arboretum (Ann Arbor), University of North
  Texas (Denton), Westerville OH, Escondido CA, Auburn ME, Cape Coral
  FL, Naperville IL.
- **Dryad 63 cities** (excluding the four that are already direct
  imports — NYC, Chicago, SF, Boston): Albuquerque, Buffalo,
  Cincinnati, Indianapolis, Kansas City, Memphis, Milwaukee,
  Nashville, Oklahoma City, Omaha, Tampa, Tucson, Denver, San Diego,
  Baltimore, Columbus, Minneapolis (~47k subset), Pittsburgh
  (already direct), and dozens more.

When a direct importer covers a city already in an aggregator (e.g.
Calgary direct supersedes the OpenTrees Calgary subset), both
imports coexist under separate `import_source` ids — re-running an
aggregator import refreshes only its own pins. There's no automatic
de-dup; if pin density gets noisy in a particular city we can switch
the public tier to the direct source by visibility-flagging the
aggregator's pins down.

## Queued (priority order, per `tree-data-sources.md` §8)

These are next in line. Each entry needs an endpoint probe + a
script in the same template.

1. **NYC 2025 census refresh** — wait for the new dataset to land
   on NYC Open Data, then re-run `nyc-trees.ts` against the 2025
   resource id.
2. **Ottawa** — ~300k, OGL-Ottawa v2.0, ArcGIS REST. Endpoint
   discoverable at `open.ottawa.ca/datasets/ottawa::tree-inventory`.
3. **Edmonton direct** — ~380k, Socrata `eecg-fc54`, OGL-Edmonton.
   (Currently covered by OpenTrees aggregator; direct gives cleaner
   taxonomy.)
4. **Winnipeg direct** — ~300k, Socrata `hfwk-jp4h`, City-OD.
5. **Québec City** — ~125k, CC BY 4.0, on `donneesquebec.ca`.
6. **Denver direct** — ~200k, Socrata `wz8h-dap6`, CC BY 3.0.
   (Currently via OpenTrees.)
7. **Ann Arbor (city + UMich)** — ~50k, recent Davey UFMP layer,
   downloadable as GeoJSON.
8. **Berkeley** — ~37k, Socrata `9t35-jmin`.
9. **Boulder** — ~50k, ArcGIS REST.
10. **New Westminster, BC** — ~10k, ArcGIS REST. Small but adds
    BC zone-7 college-town coverage.
11. **Bloomington, IN** — ~24k, Socrata `fmpy-m7cz`, TreeKeeper.
12. **Tempe, AZ** — ~26k, ArcGIS REST, "no restrictions". Small
    but cleanly licensed for a hot-arid sample.
13. **Matthaei BG / Nichols Arboretum (UMich)** — public ArcGIS hub
    with downloadable layers (uncommon for a botanic garden).
14. **Arnold Arboretum (Harvard)** — ~15k, "Data Downloads" page;
    one-shot CSV.
15. **US National Arboretum** — Plant Finder w/ CSV export, PD.

## Blocked (do not import into the paid public tier)

Per the licensing audit in `tree-data-sources.md` §1 / §7:
- Baltimore (city) — CC BY-NC-SA per Falling Fruit audit.
- Colorado Springs — CC BY-NC-SA confirmed.
- Cal Poly San Luis Obispo — CC BY-NC-SA.
- UC Botanical Garden, Berkeley — research/edu only, no redistribution.
- Falling Fruit's own crowdsourced data — CC BY-NC-SA (separate from
  the upstream sources it audits, which we *can* use directly when
  permissive).
- Austin TX — Falling Fruit audit says CC BY-NC-SA, city portal
  doesn't confirm: **needs explicit verification** before running.

### Blocked for technical (not license) reasons

- **USFS RDS-2017-0010 — McPherson et al. 49 California cities
  (~930k records)** — BLOCKED 2026-05-10. License is fully
  permissive ("can be used without additional permissions or fees")
  but **the dataset has no per-tree coordinates**. Verified by
  downloading and inspecting the published zip
  (`https://www.fs.usda.gov/rds/archive/products/RDS-2017-0010/RDS-2017-0010.zip`,
  7.3MB, 49 `*_Inventory.csv` files in 6 region folders). Schema is
  `Id.x, SpCode/SpsCode, DBH, StreetName, StreetNumber, City` plus
  in some files `Botanic Name, Common Name, Tree Type`. No lat/lng
  columns in any file. Would require geocoding 930k street
  addresses to be useful — out of scope. The dataset's true purpose
  is i-Tree Streets aggregate analysis, not per-tree mapping. Many
  individual cities in the bundle (Sacramento, Berkeley, Palo Alto,
  Santa Monica) have separate per-tree feeds with coords — those
  are handled by direct city scripts (Sacramento already DONE;
  Berkeley QUEUED; Santa Monica via Stiles batch 2).

## NEEDS-CHECK

Endpoints exist or are claimed but their availability / licence /
schema haven't been confirmed:
- Detroit (Davey 2016 inventory; not obviously open-published).
- Saint Paul (500k+ trees claimed, no public dataset).
- Cleveland (RFP 2023, no published layer yet).
- San Diego (250k+ claimed, no public layer).
- Phoenix (parks-only viewer; no city-wide download).
- Halifax HRM (hub exists; tree layer needs catalogue search).
- Princeton, NJ (TreeKeeper viewer; bulk export?).
- Iowa City, Salt Lake City (no city tree layer found).
- Atlanta (Trees Atlanta is private nonprofit; bulk licence?).
- Houston (web map only; export terms unclear).
- Baltimore County (separate from city, licence unverified).

## Operational notes

- Every direct importer follows the same `runImport(config)` shape;
  changes to the framework (e.g. concurrency tweaks, idempotency
  fixes) propagate to all of them automatically.
- Pre-req for each new city: a region row with the matching
  `regionName` must exist in `regions` before the script runs
  (registerImportSource throws otherwise).
- License strings on the `import_sources` row are surfaced in the
  About page; keep them short and accurate.
- Re-running any importer is idempotent on `(region_id,
  import_source, import_external_id)`; the framework refreshes
  `import_raw` + `location` (when the user hasn't moved the pin)
  and never overwrites user-edited fields.
