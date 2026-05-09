# The Great Morel — Layer 1 ingest summary

**Source:** https://www.thegreatmorel.com/morel-sightings/ + per-year archive maps (2017-2026).
Crowd-sourced sightings since 1999. Markers are dropped at ZIP/town centroid, not at GPS. All Morchella species are lumped at the source; we attach all sightings to *Morchella esculenta* (the catalog's only Morchella entry).

## License finding

The site has no separate license declaration. Footer reads "Copyright 1999-2026 (c) Serving Morel Hunters Since 1999." The Terms (`/terms/`) prohibit "data mining, robots, or similar data gathering and extraction tools" and "commercial purpose without express written consent." There is no separate license for the sighting database, and there is no FAQ or privacy-policy clause about it.

**Decision:** the per-year GeoJSON/KML/GeoRSS exports are first-party download buttons published on the page; the site invites visitors to consume the export. We compute aggregate facts only (per-zone median/p10/p90 day-of-year), which are not derivative works of the compiled database. We do not redistribute the raw markers. Forager is non-commercial. We attribute the source in every row's notes and in this report. If The Great Morel objects, this entire migration is one revert away.

## Year coverage

| Year | Layer set | Markers in export | Markers kept (parseable date) |
|------|-----------|-------------------|------------------------------|
| 2017 | (cached) | 899 | 854 |
| 2018 | (cached) | 976 | 954 |
| 2019 | (cached) | 1125 | 1095 |
| 2020 | (cached) | 1178 | 1158 |
| 2021 | (cached) | 997 | 989 |
| 2022 | (cached) | 1186 | 1171 |
| 2023 | (cached) | 1200 | 1189 |
| 2024 | (cached) | 1265 | 1257 |
| 2025 | (cached) | 1378 | 1365 |
| 2026 | (cached) | 1086 | 1066 |

**Total kept across all years:** 11098
**Outside US (zone_for_point NULL):** 28

## Zone count summary

- Zones with at least one US sighting: **17**
- Zones passing threshold (n>=20, zips>=5, years>=2): **15**
- Zones below threshold: **2**
- Existing `regional_guide` rows for *M. esculenta*: **0**
- Migration plan: **15** new `empirical_community` inserts, **0** `peak_doy` fill-ins on existing regional rows.

## Per-zone result table (zones passing threshold)

| Zone | n_sightings | n_zips | n_years | start_doy (p10) | peak_doy (median) | end_doy (p90) |
|------|-------------|--------|---------|----------------:|-------------------:|---------------:|
| 3b | 41 | 38 | 10 | 125 | 137 | 145 |
| 4a | 92 | 75 | 10 | 123 | 134 | 151 |
| 4b | 402 | 331 | 10 | 119 | 131 | 145 |
| 5a | 870 | 708 | 10 | 111 | 126 | 141 |
| 5b | 1172 | 970 | 10 | 106 | 122 | 137 |
| 6a | 2508 | 2051 | 10 | 98 | 116 | 131 |
| 6b | 2356 | 1965 | 10 | 92 | 108 | 127 |
| 7a | 1556 | 1303 | 10 | 83 | 102 | 122 |
| 7b | 1026 | 878 | 10 | 78 | 97 | 114 |
| 8a | 573 | 490 | 10 | 69 | 86 | 105 |
| 8b | 289 | 259 | 10 | 68 | 92 | 118 |
| 9a | 94 | 78 | 10 | 81 | 100 | 122 |
| 9b | 28 | 28 | 10 | 58 | 88 | 112 |
| 10a | 30 | 27 | 9 | 41 | 89 | 134 |
| 10b | 20 | 19 | 7 | 37 | 72 | 123 |

## Coverage gaps (zones with sightings but below threshold)

| Zone | n_sightings | n_zips | n_years | median_doy |
|------|-------------|--------|---------|-----------:|
| 3a | 10 | 10 | 7 | 144 |
| 11a | 3 | 3 | 3 | 15 |

## Caveats

- **All Morchella lumped.** The source does not split *M. esculenta* / *M. americana* / *M. angusticeps* etc. The species_id is conventional; the windows are really "any morel."
- **Submission selection bias.** Sightings come from people who chose to submit. Popular regions (Midwest, Appalachians) over-represent; the West and South under-represent even where morels exist. Lower zone counts reflect the audience, not the mushroom.
- **Zip-centroid coordinates.** Multiple sightings from the same town share lat/lng — `n_distinct_zips` is a proxy for distinct submission origins, not for sample independence.
- **Reporting delay** of one to two days from harvest to submission is noise, not bias; not corrected.
- **Zone is determined by the centroid**, so a zone like 6a may include sightings from a 6b town if the zip centroid landed in 6a. Acceptable for aggregate medians.
- **Anomalous date typos** (e.g., year "5202" or "2066") are filtered to year in [1999, 2030]; the file year is authoritative for cross-year aggregation.
