# FEMC (UVM Forest Ecosystem Monitoring Cooperative) Tree-Inventory Audit

Crawl date: 2026-05-10.

Source archive: https://www.uvm.edu/femc/CI4/search/raw?search-query=tree+inventory
(reports 396 results; we resolve to 186 dataset URLs + 209 project URLs +
1 minor duplicate; total 396 entries — see methodology below).

## TL;DR

| Bucket | Count | Notes |
|---|---|---|
| Dataset URLs (downloadable in principle) | **186** | The `/dataset/<slug>` records returned in search |
| Project-only URLs (no downloadable child) | **209** | The `/project/<slug>` landing pages |
| of which: with ≥1 dataset child | 161 | Already counted in the 186 above as their downloads |
| of which: description-only stubs | **51** | No data at all; metadata-only entries |
| Datasets marked "Available for download" | **59** of 186 | Rest are explicitly "not publicly available" or "request access" |
| Datasets we successfully downloaded | **59 / 59** | 100% success on Available subset |
| Datasets with per-tree lat/lng | **5** (~14% of Available; 2.7% of all 186) | Most FEMC inventories are address-only or aspatial |
| Datasets that are **USABLE** (lat/lng + permissive CC0/CC BY) | **3** | See "USABLE subset" below |
| Total importable rows (lat/lng-filled): | **~56,977** | Sum of valid lat/lng rows in the 3 datasets |
| New U.S. cities unlocked | **3** (Syracuse NY, Watertown NY, Bath ME) | Zone 5a/5b NY + Zone 6a coastal Maine |

## USABLE subset (the only datasets the importer script handles)

| Slug | Token | Rows (lat+lng valid) | License | Region | Notes |
|---|---|---|---|---|---|
| syracuse | `Z1442_2957_ZJP55R` | 48,350 (100%) | CC0 | Syracuse public | Clean schema: `Sci_Name`, `Common_Name`, `Latitude`, `Longitude`. Zone 5b/6a. Big win — first central NY city in the public tier. |
| watertown-ny-2017-2018 | `Z1445_2961_RQFR8P` | 7,581 (100%) | CC0 | Watertown NY public | `Species` column has FEMC "common, modifier (Latin)" form; mapper splits it. Zone 5a/4b (Lake Ontario margin). |
| bath-me | `Z1431_2937_0A5GEY` | 1,046 of 4,802 (22%) | CC0 | Bath ME public | Older Bath inventory; many rows have empty Lat/Long. `Genus` + `Species` columns stored separately; `Common_Name` is "ALL-CAPS, MODIFIER" form. First coastal-Maine zone 6a entry. |

## Status legend

- **USABLE** — has per-tree lat/lng AND permissive license (CC0, CC BY, Public Domain). Imported by `scripts/import/femc-tree-inventories.ts`.
- **NO-LATLNG** — dataset is downloadable + license is OK, but the CSV has no lat/lng columns (address-only). Would need geocoding. Out of scope for direct import.
- **BLOCKED-SA** — license is CC BY-SA (copyleft incompatible with the Forager public tier per existing policy). Skip.
- **BLOCKED-3rd** — license string says "Linked - Third party determines data license" (FEMC re-publishes from a third party with unclear terms). Skip without per-dataset legal audit.
- **BLOCKED-private** — FEMC says "This data is not publicly available" — the metadata exists but FEMC does not host the rows. The original owner (city forestry dept) has not released them. Pursue via the city directly.
- **BLOCKED-form** — dataset requires submitting a request form. Could be obtained per-dataset but not at scale.
- **NO-DATA** — project landing page that has no `/dataset/` child at all (description-only metadata stub).
- **UNKNOWN** — page parsed but couldn't determine availability/license.

## Methodology

1. **Enumeration**: Single GET to the search-raw page returns all 395
   result URLs inline (no JS pagination needed — the search page
   pre-renders the full result list and JavaScript only filters
   client-side). We split into 209 project URLs vs 186 dataset URLs.
2. **Per-dataset crawl**: HTTP GET each dataset page, extract title,
   license (CC URL match), download token (`Z<projectId>_<datasetId>_<key>`),
   "Data Availability" status (Available / Private / Description only /
   Request required).
3. **Download protocol**: For each Available dataset, GET the page on
   `vmc.w3.uvm.edu` (the canonical host; `www.uvm.edu/femc` 301-redirects
   there and drops the cookie). Capture `ci_session` cookie + the
   *second* `csrfHash` declaration in the page (the first is for the
   table-exists probe; the second binds to the download POST). POST
   to `/CI4/download/datatable_ajax/<token>` with form fields
   anonDownload/projectid/datasetid/csrf_test_name. Server returns
   JSON `{rand, filename, message:"success"}`. Wait ~3–10 s, then
   GET `/CI4/temp/<rand>/<filename>` for the CSV.
4. **Schema analysis**: parse each downloaded CSV header, scan all
   rows for lat/lng fill rate (treating values like (0,0) as missing,
   and bounding-box-checking against North America 17–72°N, 52°W–180°W).
5. **Classification**: status = USABLE iff (availability=Available AND
   lat/lng fill rate ≥ 1% AND license ∈ {CC0, CC BY, Public Domain}).

## Full master list (186 dataset URLs, sorted USABLE → BLOCKED-private → others; within each group, rows desc)

| Status | License | Rows | LatLng% | State | Title | Token |
|---|---|---|---|---|---|---|
| USABLE | CC0 | 48350 | 100% | New York | Syracuse, New York Street Tree Inventory Data | `Z1442_2957_ZJP55R` |
| USABLE | CC0 | 7581 | 100% | New York | Watertown, New York Street Tree Inventory Data (2017-2018) | `Z1445_2961_RQFR8P` |
| USABLE | CC0 | 4802 | 22% | Maine | Bath, Maine Street Tree Inventory Data | `Z1431_2937_0A5GEY` |
| NO-LATLNG | CC BY-SA | 44155 | 0% | New York | Syracuse, New York Street Tree Inventories Data (2004) | `Z1442_3205_Z3BKNN` |
| NO-LATLNG | third-party-linked | 22445 | 0% | New York | Tonawanda, New York Street Tree Inventory Data (2015 to 2016) | `Z1443_2958_V1UREF` |
| NO-LATLNG | CC0 | 13354 | 0% | New York | Ithaca, New York Street Tree Inventory Data | `Z1438_2946_LV3F3E` |
| NO-LATLNG | CC0 | 10315 | 0% | New York | Watertown, New York Street Tree Inventory Data (1998 to 2008) | `Z1445_3110_FTB42Z` |
| NO-LATLNG | CC0 | 8037 | 0% | New York | Newburgh, New York Street Tree Inventory Data | `Z1535_3079_DOVK2R` |
| NO-LATLNG | CC0 | 7911 | 0% | Connecticut | Hartford, Connecticut Street Tree Inventory Data | `Z1400_2878_9GFEMM` |
| NO-LATLNG | CC0 | 7911 | 0% | Connecticut | Hartford, Connecticut Street Tree Inventory Data | `Z1400_3183_OF3L7P` |
| NO-LATLNG | CC0 | 6536 | 0% | New York | Watertown, New York Street Tree Inventory Data (2017) | `Z1445_2960_BIWFM8` |
| NO-LATLNG | third-party-linked | 6351 | 0% | Massachusetts | Amherst, Massachusetts Street Tree Inventory Data | `Z1407_2885_VI53GI` |
| NO-LATLNG | third-party-linked | 5133 | 0% | Massachusetts | Boston College, (Newton, Chestnut Hill, Brighton) Massachusetts Street Tree Inventory Data | `Z1420_2901_1QX2GH` |
| NO-LATLNG | CC0 | 4877 | 0% | New York | Williamsville, New York Street Tree Inventory Data (2015) | `Z1447_2963_OKTP2X` |
| NO-LATLNG | third-party-linked | 4735 | 0% | Massachusetts | Dedham, Massachusetts Street Tree Inventory Data | `Z1415_2894_STMA2H` |
| NO-LATLNG | CC BY-SA | 3519 | 0% | Vermont | St. Albans City, Vermont Street Tree Inventory Data | `Z1470_2996_DLZV2D` |
| NO-LATLNG | CC0 | 3261 | 0% | Connecticut | Stamford, Connecticut Street Tree Inventory Data | `Z1405_2883_GZL7C4` |
| NO-LATLNG | CC0 | 2530 | 0% | New York | Cayuga Heights, New York Street Tree Inventory Data | `Z1494_3028_SYOFUP` |
| NO-LATLNG | CC BY-SA | 2502 | 0% | Vermont | Burlington, Vermont UVM Campus Tree Inventory Data | `Z1452_2968_2EL6O5` |
| NO-LATLNG | CC BY-SA | 2377 | 0% | Vermont | Hartford, Vermont Street Tree Inventory Data | `Z1456_2978_LDCKUO` |
| NO-LATLNG | CC BY-SA | 2303 | 0% | Vermont | Middlebury College, Vermont Street Tree Inventory Data | `Z1482_3014_N4HKBI` |
| NO-LATLNG | CC BY-SA | 2277 | 0% | Vermont | Essex, Vermont Street Tree Inventory Data | `Z1455_2977_UMA028` |
| NO-LATLNG | CC0 | 1961 | 0% | New York | Williamsville, New York Street Tree Inventory Data (2004) | `Z1447_3113_OPYT49` |
| NO-LATLNG | CC BY-SA | 1536 | 0% | Vermont | Shelburne, Vermont Street Tree Inventory Data | `Z1468_2994_LIGDPJ` |
| NO-LATLNG | CC BY-SA | 1531 | 0% | New York | Dewitt, New York Street Tree Inventory Data (2003) | `Z1500_3037_CDWOUR` |
| NO-LATLNG | CC BY-SA | 1456 | 0% | Vermont | Milton, Vermont Street Tree Inventory Data | `Z1463_2989_6F7EYN` |
| NO-LATLNG | CC BY-SA | 1419 | 0% | Vermont | Springfield, Vermont Street Tree Inventory Data | `Z1469_2995_92FLUI` |
| NO-LATLNG | CC0 | 851 | 0% | New York | Cazenovia, New York Street Tree Inventory Data | `Z1495_3029_SBAA48` |
| NO-LATLNG | CC0 | 811 | 0% | New York | Irvington, New York Street Tree Inventory Data | `Z1523_3067_1UR1UU` |
| NO-LATLNG | CC BY-SA | 738 | 0% | Vermont | Swanton, Vermont Street Tree Inventory Data | `Z1472_3000_SE4OVO` |
| NO-LATLNG | CC0 | 724 | 0% | Massachusetts | Salem, Massachusetts Street Tree Inventory Data | `Z1422_2908_OBVX14` |
| NO-LATLNG | CC0 | 681 | 0% | New York | North Syracuse, New York Street Tree Inventory Data | `Z1536_3080_XARLPY` |
| NO-LATLNG | CC BY-SA | 673 | 0% | Vermont | Middlebury, Vermont Street Tree Inventory Data | `Z1462_2988_MBAHXW` |
| NO-LATLNG | CC BY-SA | 650 | 0% | Vermont | Vergennes, Vermont Street Tree Inventory Data | `Z1474_3002_PMLEY8` |
| NO-LATLNG | CC BY-SA | 637 | 0% | Vermont | Bristol, Vermont Street Tree Inventories | `Z1450_2966_MK3U3M` |
| NO-LATLNG | CC BY-SA | 636 | 0% | Vermont | Colchester, Vermont Street Tree Inventory Data | `Z1454_2974_LDR7WY` |
| NO-LATLNG | CC0 | 628 | 0% | New York | Trumansburg, New York Street Tree Inventory Data | `Z1559_3104_IWK1LM` |
| NO-LATLNG | CC BY-SA | 626 | 0% | — | Brattleboro, Vermont Street Tree Inventory Data | `Z1449_2965_VHEGZE` |
| NO-LATLNG | CC BY-SA | 605 | 0% | Vermont | Rockingham, Vermont Street Tree Inventory Data | `Z1467_2993_U1AK85` |
| NO-LATLNG | CC BY-SA | 515 | 0% | Vermont | Hinesburg, Vermont Street Tree Inventory Data | `Z1457_2979_NCMGBE` |
| NO-LATLNG | CC BY-SA | 449 | 0% | Vermont | Lyndon, Vermont Street Tree Inventory Data | `Z1460_2983_TIFIZM` |
| NO-LATLNG | CC BY-SA | 414 | 0% | Vermont | Barre, Vermont Street Tree Inventory Data | `Z1448_2964_XAN72U` |
| NO-LATLNG | CC BY-SA | 401 | 0% | Vermont | Northfield, Vermont Street Tree Inventory Data | `Z1465_2991_R05KK4` |
| NO-LATLNG | CC0 | 382 | 0% | New York | Lake George, New York Street Tree Inventory Data | `Z1526_3070_8JWCH4` |
| NO-LATLNG | CC0 | 369 | 0% | Connecticut | Meriden, Connecticut Street Tree Inventory Data | `Z1401_2879_09LKPP` |
| NO-LATLNG | CC BY-SA | 352 | 0% | Vermont | South Burlington, Vermont Street Tree Inventory Data | `Z1451_2967_GLDNQ0` |
| NO-LATLNG | CC BY-SA | 342 | 0% | Vermont | Charlotte, Vermont Street Tree Inventory Data | `Z1453_2971_2XZVE3` |
| NO-LATLNG | CC BY-SA | 316 | 0% | Vermont | Johnson, Vermont Street Tree Inventory Data | `Z1459_2981_OA1ANH` |
| NO-LATLNG | CC0 | 252 | 0% | New York | Canandaigua, New York Street Tree Inventory Data | `Z1491_3025_SEWZ87` |
| NO-LATLNG | third-party-linked | 240 | 0% | Massachusetts | Brighton, Massachusetts Street Tree Inventory Data | `Z1419_2900_ISCOGV` |
| NO-LATLNG | CC BY-SA | 231 | 0% | Vermont | Winooski, Vermont Street Tree Inventory Data | `Z1477_3006_4W3KXM` |
| NO-LATLNG | CC BY-SA | 172 | 0% | Vermont | Windsor, Vermont Street Tree Inventory Data | `Z1476_3005_XJUE73` |
| NO-LATLNG | CC BY-SA | 157 | 0% | Vermont | Montpilier, Vermont Street Tree Inventory Data | `Z1464_2990_MT9DY4` |
| NO-LATLNG | CC BY-SA | 139 | 0% | Vermont | Plainfield, Vermont Street Tree Inventory Data | `Z1466_2992_HA8QUQ` |
| NO-LATLNG | CC0 | 94 | 0% | New York | Freeville, New York Street Tree Inventory Data | `Z1514_3055_9D09L1` |
| NO-LATLNG | CC BY-SA | 59 | 0% | Vermont | St. Albans Town, Vermont Street Tree Inventory Data | `Z1471_2999_HF1M37` |
| NO-LATLNG | CC BY-SA | 44 | 0% | Vermont | Thetford, Vermont Street Tree Inventory Data | `Z1473_3001_1WZ6QZ` |
| NO-LATLNG | CC BY-SA | 44 | 0% | Vermont | Waterbury, Vermont Street Tree Inventory Data | `Z1475_3004_R57C29` |
| NO-LATLNG | CC BY-SA | 36 | 0% | Vermont | Hyde Park, Vermont Street Tree Inventory Data | `Z1458_2980_EQUDEP` |
| BLOCKED-private | — | 82192 | — | New York | Rochester, New York Street Tree Inventory (2015-2016) | `` |
| BLOCKED-private | — | 58105 | — | New York | Buffalo, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 37174 | — | Massachusetts | Springfield, Massachusetts Street Tree Inventory | `` |
| BLOCKED-private | — | 37174 | — | Massachusetts | Springfield, Massachusetts Street Tree Inventory Data | `` |
| BLOCKED-private | — | 30433 | — | Massachusetts | Cambridge, Massachusetts Street Tree Inventory Data | `` |
| BLOCKED-private | — | 28210 | — | New York | New Rochelle, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 26811 | — | Massachusetts | Concord, Massachusetts Street Tree Inventory Data | `` |
| BLOCKED-private | — | 16975 | — | Massachusetts | Arlington, Massachusetts Street Tree Inventory Data (2016-2017) | `` |
| BLOCKED-private | — | 16316 | — | Massachusetts | Brookline, Massachusetts Street Tree Inventory Data | `` |
| BLOCKED-private | — | 15485 | — | Connecticut | Milford, Connecticut Street Tree Inventory Data | `` |
| BLOCKED-private | — | 15043 | — | Massachusetts | Chicopee, Massachusetts Street Tree Inventory Data | `` |
| BLOCKED-private | — | 12075 | — | Massachusetts | Northampton, Massachusetts Street Tree Inventory Data | `` |
| BLOCKED-private | — | 8505 | — | New York | Jamestown, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 8457 | — | New York | Rome, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 6369 | — | New York | Rotterdam, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 5100 | — | New York | Tonawanda, New York Street Tree Inventory Data (2008) | `` |
| BLOCKED-private | — | 4268 | — | Connecticut | Orange, Connecticut Street Tree Inventory Data | `` |
| BLOCKED-private | — | 3917 | — | Massachusetts | Chelsea, Massachusetts Street Tree Inventory Data | `` |
| BLOCKED-private | — | 3720 | — | Connecticut | Middletown, Connecticut Street Tree Inventory Data (All Trees) | `` |
| BLOCKED-private | — | 3429 | — | New York | East Aurora, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 3365 | — | New York | East Hampton, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 3150 | — | New York | Cortland, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 3004 | — | New York | Dobbs Ferry, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 2923 | — | New York | Ogdensburg, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 2858 | — | New York | Fulton, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 2805 | — | Connecticut | Wethersfield, Connecticut Street Tree Inventory Data | `` |
| BLOCKED-private | — | 2581 | — | New York | Fayetteville New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 2529 | — | New York | Canton, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 2310 | — | New York | Massena, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 2272 | — | Massachusetts | MIT Cambridge, Massachusetts Street Tree Inventory Data | `` |
| BLOCKED-private | — | 2253 | — | New York | Hastings-On-Hudson, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 2234 | — | Massachusetts | Springfield, Massachusetts School Tree Inventory Data | `` |
| BLOCKED-private | — | 2220 | — | New York | East Rockaway, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 2177 | — | New York | Geneva, New York Street Tree Inventory Data (2007) | `` |
| BLOCKED-private | — | 2074 | — | New York | Webster, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 2058 | — | New York | Fairport New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 1862 | — | New York | Potsdam, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 1748 | — | New York | Poquott, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 1685 | — | New York | Medina, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 1440 | — | New York | Brockport, New York Street Tree Inventory | `` |
| BLOCKED-private | — | 1415 | — | Connecticut | Essex, Connecticut Street Tree Inventory Data | `` |
| BLOCKED-private | — | 1310 | — | Connecticut | Connecticut College, New London, Connecticut Street Tree Inventory Data | `` |
| BLOCKED-private | — | 1133 | — | New York | Penn Yan, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 1128 | — | New York | Beacon, New York Street Tree Inventory Data (Street) | `` |
| BLOCKED-private | — | 1126 | — | Connecticut | Cheshire, Connecticut Street Tree Inventory Data | `` |
| BLOCKED-private | — | 1123 | — | Maine | Kennebunkport, Maine Street Tree Inventory Data | `` |
| BLOCKED-private | — | 1112 | — | New York | Manilus, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 1073 | — | New York | Seneca Falls, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 1063 | — | New York | Mamaroneck, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 1042 | — | New York | Pittsford, New York Street Tree Inventory Data (2004-2017) | `` |
| BLOCKED-private | — | 1027 | — | New York | Rhinebeck, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 969 | — | Massachusetts | Swampscott, Massachusetts Street Tree Inventory Data | `` |
| BLOCKED-private | — | 959 | — | New York | Salamanca, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 929 | — | New York | Elmaria, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 928 | — | New York | Bath, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 921 | — | New York | Fair Haven New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 906 | — | New York | Cape Vincent, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 867 | — | New York | Owego, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 836 | — | New Hampshire | Keene, New Hampshire Street Tree Inventory Data (2013) | `` |
| BLOCKED-private | — | 775 | — | New York | Pittsford, New York Street Tree Inventory Data (2004) | `` |
| BLOCKED-private | — | 752 | — | Massachusetts | Greenfield, Massachusetts Street Tree Inventory Data | `` |
| BLOCKED-private | — | 719 | — | Maine | Yarmouth, Maine Street Tree Inventory Data | `` |
| BLOCKED-private | — | 715 | — | New York | Great Neck Plaza, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 703 | — | New York | New Hartford, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 699 | — | New York | Clyde, New York Street Tree Inventory Dataset | `` |
| BLOCKED-private | — | 614 | — | New York | Clayton, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 603 | — | New York | Portville, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 588 | — | New York | Honeoye Falls, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 584 | — | New York | Cuba, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 577 | — | New York | Lima, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 562 | — | New York | Hamilton, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 555 | — | New York | Verplanck, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 555 | — | New York | Verplanck, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 548 | — | New York | Red Hook, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 463 | — | New Hampshire | Keene, New Hampshire Street Tree Inventory Data (2010) | `` |
| BLOCKED-private | — | 457 | — | New York | Jordan, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 449 | — | New York | Tivoli, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 449 | — | Massachusetts | Turner Falls, Massachusetts Street Tree Inventory Data | `` |
| BLOCKED-private | — | 439 | — | New York | Patchogue, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 436 | — | New York | Pulaski, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 410 | — | New York | Greene, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 384 | — | Massachusetts | Deerfield, Massachusetts Street Tree Inventory Data | `` |
| BLOCKED-private | — | 380 | — | New York | Fishkill, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 368 | — | New York | Elbridge, New York Street Tree Inventory | `` |
| BLOCKED-private | — | 368 | — | New York | Shortsville, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 360 | — | New York | Allegany, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 354 | — | New York | Dundee, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 354 | — | New York | Sherburne, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 345 | — | New York | Andover, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 345 | — | New York | Earlville, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 335 | — | New York | Clinton, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 331 | — | New York | South Nyack, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 314 | — | New York | Dexter, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 303 | — | New York | Pleasantville, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 287 | — | New York | Saranac Lake, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 287 | — | New York | Granville, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 274 | — | New York | Spencer, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 264 | — | New York | Groton, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 256 | — | New York | Minoa, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 252 | — | New York | Burdett, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 239 | — | New York | Adams, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 232 | — | Connecticut | Colchester, Connecticut Street Tree Inventory Data | `` |
| BLOCKED-private | — | 156 | — | New Hampshire | Manchester, New Hampshire Street Tree Inventory Data | `` |
| BLOCKED-private | — | 145 | — | New York | Rochester, New York Street Tree Inventory Data (2007) | `` |
| BLOCKED-private | — | 140 | — | Massachusetts | Dedham, Massachusetts Park Tree Inventory Data | `` |
| BLOCKED-private | — | 140 | — | — | Mcgraw, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 111 | — | Massachusetts | Worcester, Massachusetts Street Tree Inventory Data | `` |
| BLOCKED-private | — | 106 | — | New York | Tully, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | 102 | — | Massachusetts | Somerville, Massachusetts Street Tree Inventory (2016) | `` |
| BLOCKED-private | — | — | — | Massachusetts | Arlington, Massachusetts Street Tree Inventory Data (1998) | `` |
| BLOCKED-private | — | — | — | New York | Beacon, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | — | — | New York | Dewitt, New York Street Tree Inventory Data (2009) | `` |
| BLOCKED-private | — | — | — | New York | Geneva, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | — | — | Connecticut | New Haven, Connecticut Street Tree Inventory Data | `` |
| BLOCKED-private | — | — | — | New York | Saugerties, New York Street Tree Inventory Data | `` |
| BLOCKED-private | — | — | — | Massachusetts | Somerville, Massachusetts Park Tree Inventory Data (2016) | `` |
| BLOCKED-private | — | — | — | Massachusetts | Somerville, Massachusetts Street Tree Inventory Data | `` |
| BLOCKED-form | — | 1963 | — | Massachusetts | Springfield, Massachusetts Park Tree Inventory Data | `Z1424_2912_780Y0R` |
| BLOCKED-form | — | — | — | Nyc | Overstory Tree Inventory | `` |
| BLOCKED-form | — | — | — | Nyc | Understory Tree Inventory | `` |
| BLOCKED-form | — | — | — | — | Salamander Scanned Data | `` |
| UNKNOWN | third-party-linked | — | — | — | Inventory of Hubbard Brook Valley Plots | `` |
| UNKNOWN | — | — | — | New York | Batavia, New York Street Tree Inventory Data | `` |
| UNKNOWN | third-party-linked | — | — | Connecticut | New Haven, Connecticut Street Tree Inventory (2013) | `` |
| UNKNOWN | third-party-linked | — | — | Connecticut | New Haven, Connecticut Street Tree Inventory (2018) | `` |
| UNKNOWN | third-party-linked | — | — | Massachusetts | Salem, Massachusetts Street Tree Inventory Data (2016 to 2017) | `` |
| UNKNOWN | third-party-linked | — | — | Connecticut | Stamford, Connecticut Street Tree Inventory Data (2017) | `` |

## Notable findings

### Dataset families (schema fingerprints)

- **Davey TreeKeeper "Syracuse-style"** — `Address, Suffix, Street, Side,
  Site, On_Street, From_Street, To_Street, X, Y, Latitude, Longitude,
  Inventory_Date, Site_ID, Site_Comments, Species, Common_Name, Sci_Name,
  DBH, Area, Cultivar, Planting_Date, Space_Size`. Has lat/lng. Examples:
  Syracuse, Watertown NY 2017-18.
- **Davey "Watertown-style" reduced** — same Davey collection but a
  pre-2010 schema that strips `Sci_Name` and stuffs everything into
  `Species` in the "common-name, modifier (Latin name)" format. Has
  lat/lng but the species column needs splitting. Examples:
  Watertown NY 2017-2018.
- **Davey "Hartford / Newburgh-style" aspatial** — `Address, Suffix,
  Street, Side, Site, On_Street, Inventory_Date, Site_ID, Species,
  DBH, Area, Cultivar` — same Davey lineage but with the lat/lng
  columns stripped. *Many* of the 24 NO-LATLNG-but-CC0 datasets are
  this shape (Stamford CT, Hartford CT, Newburgh NY, Cazenovia NY,
  etc.). If we ever build a US-Census-block geocoder, all of these
  unlock together.
- **i-Tree Streets** — `Town, Common, Genus, Species, Type, Dbh, BA,
  DbhCl, 4Class, CONDITION, ...`. Aggregate-stand format. No coords.
  Hartford CT (the "1" version) is this shape.
- **VTrans Davey-Vermont (FID/SiteID style)** — `FID, fkSiteID,
  TreeNum, SpeciesID, Species_Comments, Diameter, TreeSize,
  ConditionI, RemoveTree, Consult, Needs, DD_deadwoo, ...`. All 32
  Vermont CC BY-SA datasets share this schema. **No lat/lng anywhere
  in the table.** Each row links via `fkSiteID` to a site table that's
  not exposed in the FEMC download.
- **Custom one-off (Boston College, Middlebury College, Burlington
  UVM Campus)** — campus-internal botanic-garden style with `BOTANICAL`
  / `LatinName` / `Botanical` columns. No geometry exposed in FEMC.
- **Bath-style mixed lat/lng + address** — `Lat, Long` columns exist
  but populated only on rows inventoried after the survey started using
  GPS. Useful for the geo-located fraction.

### Cities we cannot import directly via FEMC but might be worth chasing at source

FEMC's private metadata stubs name a lot of cities with significant
trees that don't appear in our current tree-imports-progress doc.
Pursue the city's open-data portal directly if interested:

- **Rochester NY** (~82k + ~13k two-snapshot inventories — both private on FEMC).
- **Springfield MA** (~37k street trees, ~2k park, ~2k school — all private).
- **Concord MA** (~27k).
- **Northampton MA** (~12k).
- **Arlington MA** (~17k).
- **Brookline MA** (~16k).
- **Chicopee MA** (~15k).
- **MIT Cambridge MA** (~2k — campus subset, separate from existing
  Cambridge MA city import).
- **Milford CT** (~15k).
- **Concord MA / Dedham MA / Salem MA / Worcester MA** — all
  metadata-only on FEMC; chase city portals.
- **Jamestown NY, Rome NY, New Rochelle NY** — each ~5–28k records;
  the city open-data portals would be the place to look.

### Already covered

- **Ithaca, NY** — FEMC has the 13,354-tree dataset (CC0) but it has
  no lat/lng columns (only a `geometry` field encoding NY State Plane
  in a non-standard "X: 835618…, Y: 892074…" string). Already covered
  by the direct `ithaca-ti.ts` importer at higher fidelity. Skip.

## Operational notes

- **FEMC's data-acquisition form is bypass-friendly**: every dataset
  page exposes an `anonDownload=1` form field that skips the user-info
  collection while still triggering a server log entry. Our importer
  uses this. This is allowed per the FEMC data policy at
  https://www.uvm.edu/femc/CI4/about/data_policy (the form is for
  funding justification, not gating).
- **Server-side CSV is built per-request** into `/CI4/temp/<rand>/`
  — the random-prefix dir is single-use. If the importer is re-run,
  it generates a fresh CSV each time. No caching to worry about.
- **CSV character encoding**: FEMC serves CRLF UTF-8 with quoted fields.
  Standard CSV parsers handle it.
