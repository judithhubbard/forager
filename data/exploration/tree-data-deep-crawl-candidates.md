# Tree-data deep-crawl candidates (task #57)

Goal: identify net-new municipal / university / arboreta tree inventories
that can expand Forager's pin coverage. URLs in the priority list have been
HEAD-checked and record counts verified via the ArcGIS REST `returnCountOnly`
trick on `2026-05-09`. ArcGIS public Feature Services are reachable from
the existing `fetchArcGisLayer()` helper with no auth.

The DB currently holds **2,530,432 pins** across 67 distinct `import_source`
tags (one `null`). Existing imports cluster heavily in the Upper Midwest /
Plains (driven by Calgary, Edmonton, Winnipeg, NYC) and are sparse in the
Southeast, Pacific Northwest, Mountain West, Texas, and university campuses.

---

## 1. Inventory of existing imports

Per-source pin counts (top 20 of 67); see Appendix A for the full list.

| Source ID | Pins | Region |
|---|---:|---|
| `opentrees-calgary` | 474,202 | Calgary, AB (zone 4a) |
| `opentrees-edmonton` | 374,888 | Edmonton, AB (zone 4a) |
| `opentrees-winnipeg` | 258,785 | Winnipeg, MB (zone 3b) |
| `nyc-trees-2015` | 156,321 | New York City (zone 7b) |
| `hamilton-public-trees` | 137,513 | Hamilton, ON (zone 6b) |
| `opentrees-ottawa` | 126,480 | Ottawa, ON (zone 5a) |
| `toronto-street-trees` | 102,603 | Toronto, ON (zone 6a) |
| `dryad-trees-portland` | 79,437 | Portland, OR (zone 8b) |
| `portland-street-trees` | 66,768 | Portland, OR (zone 8b) — second source for same city |
| `madison-street-trees` | 60,784 | Madison, WI (zone 5a) |
| `opentrees-sioux_falls` | 57,645 | Sioux Falls, SD (zone 4b) |
| `dryad-trees-denver` | 52,854 | Denver, CO (zone 6a) |
| `dryad-trees-minneapolis` | 46,628 | Minneapolis, MN (zone 4b) |
| `dryad-trees-columbus` | 37,640 | Columbus, OH (zone 6a) |
| `opentrees-naperville_il` | 37,476 | Naperville, IL (zone 5b) |
| `dryad-trees-washington-dc` | 33,648 | Washington DC (zone 7b) |
| `seattle-combined-trees` | 33,620 | Seattle, WA (zone 8b) |
| `dryad-trees-baltimore` | 31,314 | Baltimore, MD (zone 7b) |
| `dryad-trees-san-diego` | 24,620 | San Diego, CA (zone 10a) |
| `dryad-trees-st-louis` | 23,082 | St. Louis, MO (zone 7a) |

Patterns:
- Three big tags dominate: `cornell-cti`, dedicated city scrapes, and the
  Dryad bundle (`dryad-trees-*`, ~30 cities, mostly under 30k each).
- Most *Dryad* per-city counts look truncated (e.g. Austin 1,052; Oakland
  1,581; Houston 14,515) compared to those cities' actual published
  inventories — the Dryad release is a 2022 academic snapshot, not the
  current live municipal data. **Several "have" cities are upgrade
  candidates** (see Section 3).

## 2. Coverage gap analysis

Pin distribution by USDA hardiness zone (current):

| USDA zone | Pins | Region character | Gap rating |
|---|---:|---|---|
| 4a | 632,553 | Cold continental (Calgary, Edmonton, Mpls, Madison) | Saturated |
| 3b | 475,322 | Subarctic prairie (Winnipeg) | Saturated |
| 6b | 244,701 | Mid-Atlantic / Lower Midwest | Adequate |
| 7b | 209,647 | Mid-Atlantic coast (NYC, DC, Baltimore) | Adequate |
| 5b | 207,205 | Northeast / Upper Midwest (Naperville, Chicago) | Adequate |
| 7a | 160,339 | Mid-South (St. Louis, Louisville) | Adequate |
| 9a | 153,487 | Cal Coast (LA basin, Bay Area) | Adequate |
| 5a | 148,022 | Northeast / Ottawa | Adequate |
| 6a | 102,255 | Toronto, Denver, Columbus | Adequate |
| 9b | 48,232 | Inland CA / coastal SE | **Sparse** |
| 8b | 45,498 | Pacific NW low-elev / Deep SE | **Sparse** |
| 10b | 40,721 | South FL / coastal CA | **Sparse** |
| 10a | 31,417 | LA/SD coast / SE FL | **Sparse** |
| 8a | 29,552 | Texas / NC piedmont / coastal Carolinas | **Critical** |
| 11a | 1,184 | South FL / Hawaii | **Critical** |
| 2/3a | 0 | Alaska, far-northern interior | Critical (probably no data exists) |

By US/Canada region:

| Region | Estimated coverage | Gap rating |
|---|---|---|
| Mid-Atlantic (DC, Baltimore, Philly) | DC ✓, Balt ✓, Philly missing | **High-leverage gap** (Phila = 152k available) |
| Pacific NW (Seattle, Portland, Vancouver BC) | Seattle 33k, Portland 79k+67k | Partial — Seattle has 233k available |
| Mountain West (Denver, SLC, Boulder) | Denver 53k, SLC missing, Boulder missing | **Major gap** |
| Southeast (Charlotte, Atlanta, Nashville, Jax) | Atlanta 8k, Nashville 33 trees, others missing | **Major gap** |
| Texas (Austin, Houston, Dallas) | Austin 1k, Houston 14k truncated | **Major gap** (Austin live = 62k) |
| University arboreta | Cornell BG only (732) | **Major gap** |
| Mid-Atlantic universities (UVA, Duke, JHU) | None | Gap |
| Pacific arboreta (Stanford, UCB, UC Davis) | None | Gap |

---

## 3. Prioritized candidate list (net-new sources)

URLs verified `2026-05-09` against `https://www.arcgis.com/sharing/rest/`.
Record counts pulled with `returnCountOnly`. All ArcGIS-Hub-hosted services
are publicly readable; license terms vary (generally permissive open-data,
but the scrape script should record per-source attribution per the existing
`registerImportSource()` pattern). "Schema OK" means the layer exposes a
scientific or common name field on inspection.

### Tier 1 — flagship gap-fillers (priority 1)

| # | Name | URL | Records | Effort | Notes |
|---|---|---|---:|---|---|
| 1 | **DC DDOT Urban Forestry** | `https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Urban_Tree_Canopy/MapServer/23` | 220,154 | L | DDOT live data (existing `dryad-trees-washington-dc` is 33k from 2022). Direct 6.6× upgrade. ArcGIS MapServer; same shape as Madison scrape. License: DC public-domain. |
| 2 | **Philadelphia PPR 2024** | `https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/ppr_tree_inventory_2024/FeatureServer/0` | 151,713 | L | Net-new. Closes the Philly gap. Scientific + common names. License: City of Philadelphia OPA open data (permissive). |
| 3 | **Indiana 20-municipalities (UGI Maps)** | `https://services.arcgis.com/tKsJAIiLjd90D5q2/arcgis/rest/services/Bloomington_and_Indianapolis_Tree_Inventories/FeatureServer/0` | 387,655 | L | One scrape covers Indianapolis, Bloomington, Carmel, Fort Wayne, etc. Owner: `ugimaps_IU`. Massive gap-fill. |
| 4 | **Utah Urban Tree Inventory (statewide)** | `https://services.arcgis.com/ZzrwjTRez6FJiOq4/arcgis/rest/services/UrbanTreeInventory/FeatureServer/0` | 99,028 | L | Statewide UT including SLC, Provo, Logan. Closes Mountain West gap. License: Utah Forestry, Fire & State Lands open data. |
| 5 | **Seattle Combined Tree Point (live)** | `https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/Combined_Tree_Point/FeatureServer/0` | 233,409 | L | 7× upgrade over current `seattle-combined-trees` (33k). Has `SCIENTIFIC_NAME` + `COMMON_NAME`. Update existing `seattle-trees.ts` to use this. |

### Tier 2 — strong gap-fillers (priority 2)

| # | Name | URL | Records | Effort | Notes |
|---|---|---|---:|---|---|
| 6 | **Austin Public PARD Tree Inventory** | `https://services.arcgis.com/0L95CJ0VTaxqcmED/arcgis/rest/services/Tree_Inventory/FeatureServer/0` | 62,274 | L | 60× upgrade over `dryad-trees-austin` (1,052). Closes Texas gap. |
| 7 | **Oakland Public Tree Inventory** | `https://services.arcgis.com/9tC74aDHuml0x5Yz/arcgis/rest/services/Oakland_Public_Tree_Inventory_/FeatureServer/0` | 70,420 | L | 44× upgrade over `dryad-trees-oakland` (1,581). |
| 8 | **Pasadena Street ROW Trees** | `https://services2.arcgis.com/zNjnZafDYCAJAbN0/arcgis/rest/services/Street_ROW_Trees/FeatureServer/0` | 57,070 | L | Net-new SoCal coverage (zone 10a). |
| 9 | **Redlands CA Street Trees** | `https://services.arcgis.com/FLM8UAw9y5MmuVTV/arcgis/rest/services/Street_Trees/FeatureServer/0` | 54,150 | L | Net-new Inland Empire (zone 9a). |
| 10 | **Boulder CO Tree Inventory** | `https://gis.bouldercolorado.gov/ags_svr2/rest/services/parks/TreesOpenData/MapServer/0` | 50,024 | L | Net-new Mountain West college town. |
| 11 | **Denver Parkway Trees (USCSSI)** | `https://services1.arcgis.com/ZIL9uO234SBBPGL7/arcgis/rest/services/Denver_Parkway_Trees/FeatureServer/0` | 353,392 | M | 7× upgrade over `dryad-trees-denver` (53k). Note: USCSSI-hosted layer; verify same-as-municipal before mass import. |
| 12 | **Palm Springs CA Tree Inventory** | `https://services.arcgis.com/f48yV21HSEYeCYMI/arcgis/rest/services/COPS_Tree_Inventory/FeatureServer/0` | 15,211 | L | Net-new desert coverage (zone 10a). |
| 13 | **Ithaca City Managed Trees (live)** | `https://services5.arcgis.com/R1JbITZvSQHJsl5r/arcgis/rest/services/City_Managed_Trees/FeatureServer/0` | 13,258 | L | 10× upgrade over current `ithaca-ti` (1,302). Local relevance for Forager's home base. |
| 14 | **Tualatin OR Street Trees** | `https://services7.arcgis.com/cw66lBk1O7OM8APn/arcgis/rest/services/Street_Trees_View_2/FeatureServer/0` | 11,249 | L | Net-new Portland-metro suburb. |
| 15 | **Harrisburg PA Street Trees** | `https://services5.arcgis.com/9n3LUAMi3B692MBL/arcgis/rest/services/Corrected_2018_Tree_Layer/FeatureServer/0` | 8,610 | L | Net-new Mid-Atlantic state-capital coverage. |

### Tier 3 — university arboreta (priority 3)

University inventories generally smaller (<10k) but high-quality, high
species diversity, and they fill specific localized gaps. All ArcGIS
Hub-hosted with permissive terms.

| # | Name | URL | Records | Effort | Notes |
|---|---|---|---:|---|---|
| 16 | **Stanford Trees** | `https://services.arcgis.com/7CRlmWNEbeCqEJ6a/arcgis/rest/services/Stanford_Trees/FeatureServer/0` | 7,203 | L | Has separate "Stanford Trees Edible" (subset). Bay Area campus. |
| 17 | **U Montana Arboretum (Missoula)** | `https://services2.arcgis.com/3FyEz1ZRTg2oyrLc/arcgis/rest/services/TreeTableServiceVer1ViewOnlyLayer/FeatureServer/0` | 2,923 | L | Net-new MT coverage. |
| 18 | **U Michigan Nichols Arboretum (live)** | `https://services7.arcgis.com/AK42VSd2ESNY4Vkp/arcgis/rest/services/...` (re-resolve from item `febee55e7dac43298952af77c8f8d809`) | ~2k | L | Already imported as `opentrees-nichols_arboretum` (2,174). Skip — covered. |
| 19 | **Vassar College Arboretum** | `https://services2.arcgis.com/HXuDXoXgsUiaeXTG/arcgis/rest/services/Arboretum_Tree_Point_v3_Public/FeatureServer/0` | 158 | L | Small but well-curated. Hudson Valley NY. |
| 20 | **Beacon NY (Hudson Valley)** | `https://services1.arcgis.com/0Lw2m57KEotYYFaA/arcgis/rest/services/Q_All_Trees/FeatureServer/0` | 1,128 | L | Net-new Hudson Valley town. |
| 21 | **UVA Cultural Landscape Survey Trees** | `https://services2.arcgis.com/8k2PygHqghVevhzy/arcgis/rest/services/CLS_UVa_Trees/FeatureServer/0` | 620 | L | Charlottesville campus; complements existing `charlottesville-tree-inventory`. |

### Tier 4 — Garden Explorer arboreta (priority 4)

Garden-Explorer-based plant collections (Arnold Arboretum, NYBG, Brooklyn
Botanic, Morris, Morton, Missouri Botanical, Longwood, etc.) are high-value
but require a **separate scrape pattern** — they expose JSON via
`/explorer/api/plants` rather than ArcGIS. Roughly 20-50k accessions each.

Recommended: defer until a Garden-Explorer-specific framework helper is
added. Best targets:

| # | Name | Records | Notes |
|---|---|---|---|
| 22 | **Arnold Arboretum (Harvard)** | ~16,000 accessions | World-class; uses BG-Map + Explorer; lat/lng exposed per accession. Boston-area gap-filler. |
| 23 | **Missouri Botanical Garden** | ~50,000 accessions (Tropicos) | Has a public REST API beyond the user-facing Explorer. STL coverage. |
| 24 | **Morris Arboretum (UPenn)** | ~12,000 accessions | Philly metro complement to PPR. |
| 25 | **Morton Arboretum (Lisle IL)** | ~22,000 accessions | Chicago metro arb. |

---

## 4. Quick wins (easy implementation, share existing scrape pattern)

These five all use the `fetchArcGisLayer()` helper with no modifications;
each becomes a `~150 LOC` script following `seattle-trees.ts` pattern.

1. **Philadelphia PPR 2024** — biggest single net-new addition (152k).
   Closes the Philly gap; ArcGIS Feature Server, schema known to be
   `tree_id`, `COMMON_NAME`, `SCIENTIFIC_NAME`, `geometry.{x,y}`.

2. **Austin PARD Tree Inventory** — `Tree_Inventory` Feature Server
   on the same `services.arcgis.com/0L95CJ0VTaxqcmED` host. 62k.
   Replace the truncated `dryad-trees-austin` (1,052).

3. **Oakland Public Tree Inventory** — same pattern, 70k. Replace
   `dryad-trees-oakland` (1,581).

4. **DC DDOT MapServer/23** — already-known endpoint shape (Madison
   scrape uses MapServer). 220k.

5. **Boulder Trees Open Data** — Boulder MapServer, 50k. Net-new
   Mountain West.

For all five, the per-script scrape → matchSpecies → upsert flow already
works; only `mapFeature()` needs the per-city field-name mapping.

---

## 5. Patterns and broader notes

- **ArcGIS REST Feature Services dominate.** ~80% of tree inventories
  identified are on ArcGIS Hub or self-hosted ArcGIS. The existing
  `fetchArcGisLayer()` helper handles all of them with auto-pagination.
  `fetchArcGisLayer({ url, pageSize: 2000 })` lifts ~95% of the ETL work.

- **One-shared-scrape opportunity.** Several
  `services.arcgis.com/<owner-id>/arcgis/rest/services/...` owners host
  multiple cities' tree layers (e.g. `tKsJAIiLjd90D5q2` hosts
  Bloomington + Indianapolis + 18 other Indiana cities under a single
  layer; `0L95CJ0VTaxqcmED` hosts Austin's PARD + general Tree_Inventory
  + several adjacent layers). A generic `arcgis-feature-service.ts`
  scrape that takes a YAML/JSON list of `{ sourceId, regionName, url,
  fieldMap }` would cut per-city setup to ~15 LOC of config.

- **LiDAR-derived "tree centroids" are tempting but useless for
  Forager.** Seattle's 968k LiDAR-Centroids layer has no species/common
  name — fails criterion 2 (species-level data). Skip these. Same goes
  for Charlotte's `Charlotte Mecklenburg Tree Canopy` (polygons only).

- **Dryad bundle is dated (2022 snapshot).** Several "have" cities
  (Austin, Oakland, Houston, Atlanta, San Diego) have live municipal
  endpoints with 5–60× more trees. Treat the Dryad import as a
  starter and prefer live ArcGIS feeds where they exist — the
  per-source pin upsert is keyed on `(import_source,
  import_external_id)`, so swapping to a live source is a clean
  re-import under a new `source_id` (e.g. `austin-pard-trees`).

- **Garden Explorer / BG-Map gardens** (Arnold, NYBG, Morton, MBG,
  Longwood) are the high-leverage university/arboretum class but need
  a different scrape framework. They expose accession data via
  `bgexplorer.com` JSON or a per-garden `/api/plants?page=N` endpoint.
  Worth a separate task once the ArcGIS quick wins are in.

- **Hawaii / Alaska / north-of-50 latitude.** No public tree
  inventories found that fit Forager's criteria. Hawaii has the
  truncated `dryad-trees-honolulu` (210). This may be a permanent
  data-availability gap, not a scrape gap.

- **Quebec / French Canadian datasets.** OpenTrees catalog flagged
  Quebec City, Repentigny, Longueuil (Donneesquebec.ca) as 403'd; HEAD
  retried under a browser User-Agent might recover them. Low priority.

---

## Appendix A — full existing-source list

67 total `import_source` tags. Top 20 in Section 1; the remaining 47
range from 16,684 (`dryad-trees-overland-park`) down to 33
(`dryad-trees-nashville`) plus 9 `null`-tagged historic rows. The
long tail is dominated by the Dryad bundle (~30 cities) and the
OpenTrees catalog (~10 cities). Full counts available via:

```sql
select import_source, count(*)
from pins
group by import_source
order by 2 desc;
```

## Appendix B — sources investigated and rejected

- **Charlotte NC.** TreesCharlotte program publishes only canopy-coverage
  polygons, not individual trees. Closest candidate found: `Urban
  Arboretum Trail Route` (a footpath, not an inventory). **Skip**.
- **Atlanta.** `TreesAtlanta Morton Arboretum 2018` is an internal
  collection-tracking layer (~2018), no public download. **Skip**;
  use existing `dryad-trees-atlanta` (8k).
- **Houston.** `COH_UrbanForestry_AdoptATree` returned 1 record (a
  test). No live municipal tree inventory found beyond the Dryad
  snapshot. **Skip** for now.
- **Nashville.** No live ArcGIS service found; existing 33-tree Dryad
  entry is effectively empty. Worth a manual portal check on
  `data.nashville.gov` later.
- **Miami-Dade.** `Neighborhood Street Tree Survey` had 2 records (a
  Survey123 form). Only canopy polygons available at scale. **Skip**.
- **Quebec / Repentigny / Montreal.** All 403'd in OpenTrees audit.
  Re-attempt with browser UA.
- **Boyce Thompson, Boulder Plant Database, Phipps, etc.** Garden
  Explorer-based; deferred to Tier 4 follow-up.

---

## User-submitted URLs (2026-05-10) — needs verification

Submitted by JK via chat after the audit agent completed; each needs the same
verification treatment as the priority list above (HEAD-check, schema/format
inspection, record count via ArcGIS REST or equivalent, license review).

1. **Montana DNRC statewide tree inventories** —
   https://dnrc.mt.gov/Forestry/Resources/statewide-tree-inventories
   Statewide aggregator hub. Likely contains links to multiple MT cities.
   Mountain West gap-filler. Worth surveying for individual feeds.

2. **Auburn AL urban forestry tree inventory** —
   https://www.auburnal.gov/public-works/landscape-and-sustainability/urban-forestry/tree-inventory/
   Southeast / Auburn University metro (zone 8a). Single-city inventory.
   Light coverage in current DB for Alabama; would close a gap.

3. **Virginia city tree inventory (data.virginia.gov)** —
   https://data.virginia.gov/dataset/city-tree-inventory1
   State open-data portal. Multi-city dataset (URL slug "1" suggests there
   may be others). Mid-Atlantic / VA piedmont coverage. Verify scope.

4. **Arizona Urban Tree Map (AZ DFFM)** —
   https://dffm.az.gov/resources/arizona-urban-tree-map-azutm
   Statewide AZ aggregator. Phoenix metro + Tucson + smaller cities likely
   covered. Closes the Southwest gap (zones 8a-9b desert) that the audit
   flagged as sparse. Worth surveying.

Status: queued for the same verification + scrape-config workflow as the
audit-identified candidates (Tier 1 / Tier 2). State-level aggregators
(MT, VA, AZ) likely expose multiple individual city/county feeds — survey
the parent URL to enumerate child datasets before building scrape configs.
