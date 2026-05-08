# Offline support plan

## Why

Foraging happens in places without reliable cell signal — woods, parks
on the edge of coverage, rural areas. Users want to:
- Open the app and see the map even when offline
- Browse pins they previously viewed
- Optionally drop new pins / observations and have them sync when back online

Without offline support, the app fails the basic "loads at all" test
exactly where it's most needed.

## Goals (v1 of offline)

1. App opens and is usable when offline
2. Recently viewed map tiles still render
3. Pins in the user's region are available offline
4. The user can explicitly download an area for a planned trip
5. Writes made offline replay automatically on reconnect

## Non-goals

- Full bidirectional sync of arbitrary regions (memory + storage limits)
- Conflict resolution beyond last-write-wins for the rare collision
- Background Sync on iOS (the API doesn't exist there; manual flush instead)
- Multi-day disconnected operation (target: ~24h offline window)

## Constraints

- **iOS Safari is the dominant device.** No Background Sync API, no
  reliable push, aggressive SW eviction under storage pressure. Designs
  must work without push and without expectation of background work.
- **Storage budget on iOS PWA**: ~500 MB per origin. Pin row is ~1 KB
  after the `import_raw` drop, so 50k pins ≈ 50 MB. Map tiles are
  ~10-30 KB each; one US city at zoom 13-16 is ~30 MB.
- **Photos are heavy** — defer photo offline-write to Phase 3b.
- **Cross-origin tiles**: OSM tile servers must allow CORS for SW
  caching to work; current basemap (osm-hot) does.

## Phased approach

### Phase 1 — Offline shell + view-cached tiles  *(~1 day)*

The smallest meaningful step. App opens offline, shows a clear status,
and renders any tiles the user has already loaded.

**What ships:**
- Service worker (`src/service-worker.ts`, SvelteKit's built-in convention)
- Pre-cache: app shell — built JS/CSS, manifest, icons
- Runtime cache: OSM map tiles (StaleWhileRevalidate, max ~8000 entries)
- Runtime cache: `static/usda-zones.geojson`, `data/forageable_species.json`,
  `data/wikipedia-extracts.txt` (read-only static assets)
- New `src/lib/stores/network.ts` — `online` writable bound to
  `navigator.onLine` + `online`/`offline` events
- "Offline" banner in `+layout.svelte` when `online === false`
- Drop-pin / log-observation buttons disabled when offline, with a
  tooltip pointing at the upcoming Phase 3 sync

**What it doesn't do:**
- Pin data goes stale when offline (last-fetched JSON in memory only)
- Tiles outside the viewed area are missing
- No writes accepted

**Files touched:**
- New: `src/service-worker.ts`
- New: `src/lib/stores/network.ts`
- Modified: `src/routes/+layout.svelte` — register SW + render banner
- Modified: `src/routes/+page.svelte` — disable drop-pin offline
- Modified: `src/lib/components/PinDetailContent.svelte` — disable write buttons offline

**Verification:**
- Build & deploy. Open browser, browse map.
- Network tab → Offline. Reload — app loads, shell is intact.
- Pan within previously viewed area — tiles render.
- Pan way out — tiles missing (acceptable).
- Banner shows "Offline" when network goes down.
- Drop-pin button disabled with tooltip.

### Phase 2 — Region pin cache + "save this area"  *(~3-5 days)*

User-initiated download for a planned trip. Reads work fully within
the saved area.

**What ships:**
- IndexedDB schema (use `idb` library — small, well-tested):
  - `pins` table: pin row + cached_at timestamp, indexed by id, region_id,
    bbox bounds
  - `species` table: full catalog (~100 KB)
  - `regions` table: user's regions
  - `cache_meta`: last-sync time per (region, bbox)
- New `src/lib/services/offlineCache.ts`:
  - `cachePins(rows)` / `getPinsInBbox(bbox)` / `getPinById(id)`
  - `cacheSpecies()` (one-shot from species catalog)
  - `clearCache(scope)` — for storage management
- New `src/lib/services/offlineDownload.ts`:
  - `downloadArea(bbox, opts)` — fetches pins for bbox via existing
    `public_pins_bbox` RPC + tiles for zoom levels 13-16, writes to cache
  - Progress events for UI
- "Save this area for offline" button on the map (visible when online).
  Picks current viewport + a 3 km buffer.
- `pinService.listPublicPins()` etc. fall through to IndexedDB on
  network error
- New `/offline` settings page: list cached areas, sizes, last-sync
  date, delete buttons
- Background sync (when online): every successful viewport fetch
  also writes those pins to IndexedDB so the active region builds up
  naturally

**What it doesn't do:**
- Writes still rejected offline
- No automatic re-download when cache is stale (user manually re-saves)

**Files touched:**
- New: `src/lib/services/offlineCache.ts` (~200 LOC)
- New: `src/lib/services/offlineDownload.ts` (~150 LOC)
- New: `src/routes/offline/+page.svelte`
- New: `src/lib/components/SaveAreaButton.svelte`
- Modified: `src/lib/services/pinService.ts` — cache fallback
- Modified: `src/routes/+page.svelte` — mount the SaveAreaButton

**Storage budget per saved area** (for sanity):
- A 3 km × 3 km bbox at zoom 13-16: ~270 tiles × ~20 KB ≈ 5 MB tiles
- ~500 forageable pins × 1 KB ≈ 500 KB pins
- One pre-saved area ≈ 6 MB. iOS quota fits ~80 such areas.

**Verification:**
- "Save this area" → toast confirms 5 MB downloaded
- Disable network, refresh — pins in saved area still render
- Pin detail click works offline if pin is in cache
- Storage page shows the saved area with delete option

### Phase 3a — Write outbox  *(~3-4 days)*

Local queue for offline writes. Replays automatically on reconnect.

**What ships:**
- IndexedDB `outbox` table: id, op_type, payload, status, created_at,
  attempted_at, error
- `op_type` enum: `create_pin`, `log_observation`, `change_status`,
  `move_pin`, `add_flag` — covers the writes a user makes on a foraging trip
- New `src/lib/services/outbox.ts`:
  - `enqueue(op)`, `dequeue(id)`, `replay()`
- Each write surface modified to call outbox first when offline (or
  always — outbox calls supabase when online), wraps the existing service
- New `src/lib/stores/syncStatus.ts` — `pending` count, `replaying` boolean
- Header chip: "3 changes to sync" / spinner during replay
- Auto-replay on reconnect: subscribe to the `online` event, kick off
  `outbox.replay()`
- Manual "Sync now" button as fallback (iOS users)

**Idempotency:**
- All ops use a client-generated UUID as a deterministic key. Server
  RPCs treat a duplicate UUID as a no-op.
- New schema: `pin_create_idempotency_key` column on `pins`, unique
  index. Same on observations, flags. The replay re-attempts safely.

**What it doesn't do (deferred to 3b):**
- Photos. Photo upload while offline is its own beast — defer.
- Conflict UI. For now: last-write-wins; the user gets a toast when
  their offline change overrode something newer on the server.

**Files touched:**
- New: `supabase/migrations/2026MMDDhhmmss_outbox_idempotency.sql` —
  add idempotency keys + unique constraints
- New: `src/lib/services/outbox.ts` (~250 LOC)
- New: `src/lib/stores/syncStatus.ts`
- Modified: every write surface in services/* — wrap with outbox
- New: `src/lib/components/SyncStatusChip.svelte`

### Phase 3b — Photos + conflict UI  *(~1 week, deferred)*

- Photo upload queue: write to IndexedDB blob store, replay against
  Supabase Storage on reconnect
- Conflict resolver UI for the rare case
- "Drop pin offline" gets a special green-pin treatment until synced

Defer until Phase 3a is in production and we see real conflict patterns.

## iOS-specific gotchas

- Service workers work but get evicted under storage pressure; tell
  users that "Add to Home Screen" makes them more reliable
- No Background Sync — replay only happens on next foreground load
- Persistent storage requires user prompt; show in onboarding when
  user enables offline mode
- iOS Safari Private Browsing has no SW at all — feature unavailable

## Storage management

`/offline` page (lives under settings):
- Total cache size
- Per-area breakdown: name, bbox preview, size, last sync, delete
- "Clear all offline data" button
- "Pre-cached areas: 3 (45 MB)" header in settings

## Phased rollout decision

Phase 1 alone is shippable in a day and meaningfully helps. I'd ship
it, watch users, decide on Phase 2 based on whether anyone actually
uses the app where this matters. Phase 3 is the heavyweight piece;
gate it on user demand or a paid-tier launch (offline is a natural
"power user" feature to charge for).

## Open questions

- Tile cache: how much is too much? Probably 100 MB is the right
  ceiling — at ~20 KB per tile that's 5,000 tiles, or roughly a
  metro-area's worth of zoom 13-16. Older tiles get LRU-evicted.
- Should pre-cached areas tie to user account vs anonymous? Anonymous
  caches survive logout; account-bound caches clear on logout.
  Probably anonymous for v1 (simpler).
- iOS "Persistent" storage prompt — when to show. Onboarding flow
  feels right.
