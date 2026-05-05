# Forager — Plan

A personal, mobile-friendly map of forageable plants in and around Ithaca, NY.

Status: drafting. Sections filled in one at a time.

---

## 1. Goals & Non-Goals

### Goals

Primary use case: a private foraging map for JK and a small set of invited collaborators, usable from a laptop browser and an iPhone in the field.

Concretely, the app lets a user:
- See a map of trees, shrubs, and other organisms that produce forageable fruit, nuts, or mushrooms.
- Bootstrap that map from public datasets — initially the Cornell Campus Tree Inventory and the City of Ithaca Tree Inventory — filtered to forageable species.
- Manually add new spots, including non-tree foragables (black raspberry patches, mushroom flushes, walnut trees not in any inventory).
- Use phone GPS to auto-locate on the map and to drop pins at the user's current position.
- Attach photos to specific pins, with GPS captured at the moment of upload (since iOS Safari strips photo EXIF).
- Take per-pin notes: quality, accessibility, ownership/permission concerns, observed fruiting dates, etc.
- See an expected fruiting window per species for the local climate zone (USDA 5b/6a for Ithaca).
- View "what's likely ripe now" — pins whose species is in its expected fruiting window today.
- Tag pins with environmental hazards (poison ivy adjacent, heavy tick area, private property — ask first, slippery slope, etc.). User-added, displayed prominently on the pin so they're visible before walking up.
- Work within **regions**. A region is a scope that owns a set of pins, a member list, a climate zone, and zero or more background datasets. A user can belong to multiple regions and switches between them one at a time; pins and edits are scoped to the active region and do not leak across. Sharing happens *inside* a region — privacy is achieved by working in a region only you belong to (e.g., a personal "JK only" region for sensitive spots like a chanterelle patch).
- Invite collaborators (~3 at launch, capacity for dozens) into a region. No public access.
- Work offline in the field and sync when back online.

### Future direction (post-v1)

- **Cross-region pin "publishing"** — promoting a pin from a private region to a shared one, or vice versa. v1 keeps pins in a single region.
- **Region-specific dataset import pipelines** beyond Cornell + Ithaca (e.g., regional tree inventories elsewhere). v1 ships the import paths for those two; new datasets are manual code work.
- **Phenology refinement** via growing-degree-days from a weather API. v1 uses static date windows.

### Non-goals (explicitly out of scope for v1)

- **Public / community map.** Invitees only. Not a Falling Fruit clone.
- **Native iOS app.** PWA only, no App Store.
- **Species identification from photos** (ML, Seek, iNaturalist-style). The user identifies; the app records.
- **Real-time push notifications.** iOS Safari PWAs can't reliably background-push. v1 "alerts" = in-app "ripe now" view, plus possibly an opt-in email digest later.
- **Full phenology modeling.** v1 uses hardcoded date windows per species per zone. Growing-degree-day models and live weather data are a v3 stretch goal.
- **Foraging ethics / legal enforcement.** Permission notes are stored if written; no enforcement or warnings beyond that.
- **Mushroom safety vetting.** The app records what the user says is there; it is not a safety tool.
- **Automated poisonous look-alike detection.** No ML or rule engine warning "this might be pokeweed not elderberry." Users can tag hazards manually (see goals) but the app does not infer them.
- **Public-style social features**: pin ratings, public profiles, leaderboards. (Comments and per-pin observations are part of v1; see §3.7, §7.)
- **Multi-climate-zone logic.** v1 assumes one zone (Ithaca's). Generalize later if invitees are elsewhere.

### Success criteria for v1

- JK can plan a foraging walk on a laptop, take a phone into the field, drop pins + photos one-handed, and review at home — with no data loss across devices.
- An invitee can see JK's map, contribute their own pins/photos, and the data model keeps authorship clear.
- The "ripe now" view is accurate enough to be useful for at least 5–10 species JK actually forages.

---

## 2. User Stories

Stories are written first-person to keep them concrete. *JK* is the primary user. *Anna* stands in for an invitee.

### At home (laptop, planning)

- **Sunday-morning walk planning.** Late June. I open the app, see "12 species likely ripe this week" listed beside a map. I tap "serviceberry," the map filters to just serviceberry pins, and I pick three within walking distance.
- **Seeding the map from public data.** I bulk-import every forageable species (serviceberry, Cornelian cherry, pawpaw, etc.) from the Cornell Campus Tree Inventory. Pins appear tagged "imported: Cornell." Re-running the import is idempotent.
- **Reviewing field notes.** Back from a walk with 6 pins and 14 photos. I open each pin, correct species if needed, add quality notes ("very tart, mostly green"), tag any hazards.
- **Adjusting a species window.** Serviceberries are a week early this year. I bump the species-level fruiting window for "serviceberry" by 7 days. The app asks whether the change applies to the whole region (visible to all members) or just to my personal view. I pick one.
- **Switching regions.** I usually work in "Ithaca shared" with Anna and others. I switch to my personal "JK only" region to drop a chanterelle pin no one else will see. Top-of-app region switcher; pins, photos, observations, and "ripe now" all rescope to the active region.

### In the field (phone, GPS, possibly weak signal)

- **One-tap pin drop.** I'm in front of a Cornelian cherry. Tap "+", GPS auto-captures, pick the species from a recent-species list, snap a photo, save. Under 30 seconds, one-handed.
- **Walking to a known pin.** I want to revisit a serviceberry from last year. Tap the pin → "navigate." The map shows me + the pin; optional handoff to Apple/Google Maps for turn-by-turn.
- **Logging fruit stage.** Standing at a known pin, I tap "log observation" → pick stage (flowering / green / ripening / ripe / past) → optional quality note → save. The pin's "current stage" updates.
- **Tagging a hazard.** Heavy poison ivy around this patch. Tap "add hazard" → "poison ivy." The pin now shows a hazard icon visible from the map view.
- **Pinning an unknown tree.** I don't recognize it. Drop a pin marked "unknown — needs ID," attach photos (leaves, bark, fruit if any), ID at home later.
- **Working offline.** No signal in the gorge. I drop 4 pins with photos. They show as "pending sync." Upload happens automatically when signal returns.

### Sharing & collaboration

- **Inviting a collaborator.** I add `anna@example.com` to the Ithaca region. Anna gets an email, signs in, lands on the Ithaca map, can immediately add pins.
- **Seeing someone else's contribution.** Anna adds a black walnut. It shows on my map with her name attached and a visual marker indicating contributor.
- **Keeping a spot private.** Chanterelle patch I don't want to share. I switch to my personal "JK only" region and pin it there. Anna never sees it because she isn't a member of that region.
- **Suggesting a correction.** Anna pinned a tree as "serviceberry" but my photo of the bark suggests otherwise. I leave a comment on her pin without overwriting. v1: comment-only; pin authors are the only ones who can edit their own pins.

### Phenology & alerts

- **"What's ripe now."** Open the app → list of pins whose species is in its expected ripe window today, sorted by distance from me.
- **Forecast.** "Mulberries should start in ~4 days." Informational in v1; no push.

### Lifecycle / edge cases

- **Imported tree is gone.** Campus tree was cut down. I mark its pin's status as `gone`. Re-import doesn't recreate it. (Pins have four statuses: `active`, `gone`, `dormant`, `needs_verification` — see §3.)
- **Conflicting data.** Cornell records species A; my observation says B. Personal observation wins for display; the import's claim is preserved as metadata so we can audit.
- **Bad GPS under canopy.** A field-dropped pin is 30m off. On the laptop I drag it to correct, and the corrected location is what syncs.
- **Invitee leaves.** Anna stops using the app. Her pins stay; her name remains on them as the original contributor by default. If she asks for her name to be removed, it's anonymized to "former member" but the pin stays.

---

## 3. Data Model

Conceptual schema. Field types and constraints get nailed down at implementation time. PostgreSQL + PostGIS in Supabase is the assumed substrate.

### 3.1 Entities (overview)

- **User** — auth identity.
- **Region** — collaboration scope. Owns pins, members, climate zone, datasets.
- **RegionMembership** — which user belongs to which region, with what role.
- **Invitation** — pending email-based invite into a region.
- **Species** — taxonomic record. Shared globally across regions.
- **Pin** — a forageable thing in a place (tree, bush, patch, fungal flush, etc.). The central entity.
- **SpeciesFruitingWindow** — region-level default ripe window for a species.
- **UserFruitingWindowOverride** — user's personal override for a species in a region.
- **RegionSeasonalShift** — a region-wide, year-specific offset ("2024 was ~10 days early") applied to all fruiting predictions in that region for that year.
- **Observation** — a record of a visit: stage, quality, when.
- **Photo** — image attached to a pin and optionally a specific observation.
- **Hazard** — user-flagged hazard tag on a pin (poison ivy, ticks, private property, etc.).
- **Comment** — comment on someone else's pin (v1: read-only to author).
- **ImportSource** — bookkeeping for bulk imports (Cornell, Ithaca, etc.) and idempotency.

### 3.2 Pin (central entity)

Fields:
- `id` (UUID, generated client-side — see §10 C16)
- `region_id` — pins live in exactly one region.
- `created_by` (user) / `created_at`
- `updated_at`
- `species_id` (nullable — supports `unknown — needs ID` state)
- `display_name` (nullable, free-form override of species common name)
- `location` — PostGIS `geography(Point, 4326)`
- `location_accuracy_m` — captured from GPS at drop time, useful for showing a confidence radius
- `status` — one of `active` | `gone` | `dormant` | `needs_verification`
- `notes` — free text from author
- `import_source` (nullable) — e.g. `cornell-cti`, `ithaca-ti`, `manual`
- `import_external_id` (nullable) — original record's ID in the source dataset
- `import_raw` (jsonb, nullable) — the original record, preserved verbatim for audit
- `last_observed_at` (denormalized from latest observation, for "ripe now" queries)
- `last_observed_stage` (same)
- `location_modified_by_user_at` (nullable timestamp — set the first time a user moves the location of an imported pin; gates re-import behavior, see §6.5)

Notes:
- `(import_source, import_external_id)` unique within a region — ensures re-imports are idempotent.
- A pin's *displayed* species is `species_id`. The import's claim is in `import_raw`. They can diverge after a user correction; `import_raw` is never mutated by the user.
- One pin = one point. Patches/groves are a single point in v1 (centroid). Polygons are a v2 question.
- **Effective status** (including auto-degrade to `needs_verification` after 4 years without observations) is *not* a stored field. It's exposed via a `v_pin_effective` Postgres view that computes it from `last_observed_at`. Client UI reads from this view; raw `status` is for admin/debug surfaces.

### 3.3 Species & fruiting windows

**Species**
- `id`
- `scientific_name` (canonical, e.g., `Amelanchier laevis`)
- `common_name` (display)
- `aliases` (array — `serviceberry`, `Juneberry`, `shadbush`)
- `is_forageable` (bool — drives the curated list and import filters)
- `forage_parts` (array — `fruit`, `nut`, `flower`, `leaf`, `mushroom`, etc.)
- `safety_notes` (free text, e.g., "do not confuse with pokeweed")

Species are global across regions — taxonomy doesn't change by location. (Common names *can*; the `aliases` array handles regional variants.)

**SpeciesFruitingWindow** — region-level default
- `species_id`, `region_id`
- `start_doy`, `end_doy` (day-of-year, since windows recur yearly)
- `peak_doy` (optional)
- `notes`
- `created_by`, `updated_at`

**UserFruitingWindowOverride** — personal
- `user_id`, `species_id`, `region_id`
- `start_doy`, `end_doy` (absolute, not offsets — see note below)
- `notes`

**RegionSeasonalShift** — year-level region-wide offset
- `region_id`, `year`
- `offset_days` (signed integer, e.g. `-10` for "everything ~10 days early this year")
- `notes` (e.g. "warm March, dry April")
- `set_by` (admin user_id), `updated_at`

**Resolution order for a predicted window** (given a pin, viewing user, current year):
1. `effective_default = user_override(species, region) ?? region_default(species, region)`
2. Apply `RegionSeasonalShift.offset_days` for the current year (additive).
3. Result is the effective window (`start_doy`, `end_doy`).

UI displays the effective window plus chips showing which adjustments are in effect ("region default + 2024 seasonal shift −10d").

Why absolute DOYs (not offsets) for the user override: if the region default later changes, an offset would silently follow it, which is rarely the desired semantics. Offsets are nicer to type — we accept them as input and display them as offsets, but store the resulting absolute DOYs.

There is no per-pin window override in v1. Per-pin variation is captured implicitly through observation history (we may surface "this tree's empirical ripe-window from past observations" in v2).

### 3.4 Observation

- `id`, `pin_id`, `user_id`
- `observed_at` (datetime)
- `stage` — `flowering` | `green` | `ripening` | `ripe` | `past` | `bare` | `unknown`
- `quality_rating` — 1–5 (optional)
- `quality_notes` — free text
- `created_at`

Observations are append-only — they record history. Editing a typo'd stage is OK (own observations only); deletion is allowed but rare.

Year-over-year display: the pin detail view groups observations by year so a user can see e.g. "2024: ★★★★ abundant" vs "2025: ★★ sparse" — important because trees often alternate-bear (good year, off year). No separate `Harvest` entity; this is a UI aggregation over observations.

### 3.5 Photo

- `id`, `pin_id`, `observation_id` (nullable — a photo can attach to the pin generally or to a specific observation)
- `user_id`, `taken_at`
- `captured_lat`, `captured_lng`, `captured_accuracy_m` — captured at upload time (since iOS Safari strips EXIF GPS)
- `storage_path` — Supabase Storage object key for the full image (downscaled to ~1600px on upload)
- `thumbnail_path` — small image for map/list rendering
- `caption` (free text)

### 3.6 Hazard

- `id`, `pin_id`, `user_id`, `created_at`
- `hazard_type` — enum: `poison_ivy` | `ticks` | `private_property` | `unstable_terrain` | `water_crossing` | `traffic` | `other`
- `notes` (free text)

A pin can have multiple hazards. Hazard icons surface on the map marker, not just the detail view.

### 3.7 Comment

- `id`, `pin_id`, `user_id`, `body`, `created_at`

v1 has comments but no editing of others' pins. Pin fields are author-only.

### 3.8 Region, RegionMembership, Invitation

**Region**
- `id`, `name` (e.g. "Ithaca shared", "JK only")
- `climate_zone` (e.g. `5b`; free text initially — USDA codes plus future flexibility)
- `timezone` (IANA, e.g. `America/New_York`) — determines what "today" means for DOY-based predictions
- `default_map_center` (geography Point), `default_zoom`
- `created_by`, `created_at`

**RegionMembership**
- `user_id`, `region_id`
- `role` — `admin` | `member`
- `joined_at`

**Invitation**
- `id`, `region_id`, `email`, `invited_by`, `role`
- `token` (random, for email link)
- `expires_at`, `accepted_at` (nullable), `accepted_by` (user_id, nullable)

### 3.9 ImportSource & ImportRun

**ImportSource** (registered importers)
- `id` — `cornell-cti`, `ithaca-ti`, etc.
- `name`, `url`, `description`
- `region_id` — which region the data lands in (importers are region-bound)
- `species_filter` — array of species IDs to keep (so "Cornell" only imports forageable trees, not all 12k records). In v1 this filter is **hard-coded in the repo** as a JSON file (e.g. `data/forageable_species.json`) co-located with the species seed data; admin-UI editing is v2.

**ImportRun** (audit trail)
- `id`, `import_source_id`, `started_at`, `finished_at`
- `pins_created`, `pins_updated`, `pins_skipped_unmatched`, `errors` (jsonb)
- `triggered_by` (user_id)

Re-import logic: for each incoming record, look up `(import_source, import_external_id)` within the region. If found, refresh `import_raw` and `location` (only if user hasn't manually moved the pin — flag this); never overwrite user-edited fields. If not in the incoming data but previously imported and still `active`, leave alone (don't auto-mark gone — sources sometimes have partial dumps).

### 3.10 Visibility & access rules (preview — full treatment in §8)

- A user sees data only from regions they're a member of.
- The active region scopes everything in the UI.
- Within a region, all members see all pins, observations, photos, hazards, comments.
- Pin authors can edit their own pin's fields. Anyone in the region can comment, observe, photograph, or flag hazards on any pin.
- Admins can edit/move/mark-gone any pin in their region (not only their own), manage memberships, run imports.
- **Filtering**: the map and list views support filtering by species, status, hazard type, and "currently in window." Multi-select within a category, AND across categories.

### 3.11 Resolved decisions

- **Per-pin prediction overrides**: dropped. Replaced by `RegionSeasonalShift` (year-level region-wide offset) + observation history.
- **Patches**: points only in v1 (single dot per pin). Polygons are post-v1.
- **Photo de-dup**: not implemented. Re-uploading the same photo creates two records; cost is trivial.
- **Multiple species at one location**: two separate pins. Map UI must support filtering by species to keep it navigable.

---

## 4. Architecture

How the pieces actually fit together: where code runs, where data lives, how a phone in the woods talks to a database in the cloud.

### 4.1 Topology

Three logical pieces:

1. **The PWA** — a static SvelteKit-built bundle (HTML/JS/CSS + service worker) hosted on **GitHub Pages**. It runs in any modern browser and is installable to an iPhone home screen. This is the entire client.
2. **Supabase project** — a managed Postgres database (with PostGIS), an auth service, and an object store for photos. The PWA talks to it directly over HTTPS using the Supabase JS SDK. There is no custom backend server.
3. **GitHub repository** — source of truth for *code*, *species seed data*, and the *import scripts*. CI deploys the PWA to GitHub Pages on every push to `main`. Imports are run manually from a developer's laptop, not from the server.

Data flow: phone/laptop → Supabase API → Postgres + Storage. Reads and writes both go through the Supabase SDK, which enforces auth tokens and Postgres Row-Level Security (RLS).

### 4.2 Tech stack & rationale

| Concern | Choice | Why |
|---|---|---|
| Framework | **SvelteKit** | Light bundle, good PWA story, fast on mobile, simple componentry. Could also do vanilla JS but SvelteKit pays off as soon as we have ~5 screens. |
| Map | **Leaflet** + OpenStreetMap tiles | Free, mobile-friendly, well-known, no API key for OSM tiles. Mapbox/MapLibre are options if styling needs grow. |
| Backend | **Supabase** | Postgres + PostGIS + auth + storage in one. Generous free tier. Open-source so we're not locked in. Good JS SDK. |
| Auth | **Supabase Auth, email + password** (invitation-only signup) | Familiar UX, no third-party identity provider. Email is sent only at invitation/registration time, not on every login. |
| Hosting | **GitHub Pages** | Free, HTTPS by default (required for geolocation/camera), no infra to run. |
| CI | **GitHub Actions** | Builds and deploys the PWA on push. |
| Photos | **Supabase Storage** | Same auth, same project, signed URLs for access control. |
| Local cache / offline queue | **IndexedDB** (via `idb` or Dexie) | Standard browser DB. Service worker uses it for queued writes. |

### 4.3 Hosting & deployment

- **Repo**: `github.com/<jk>/forager` — code, species data, import scripts, this PLAN.md.
- **CI**: pushes to `main` trigger a GitHub Actions workflow that builds the SvelteKit bundle and deploys to the `gh-pages` branch (or uses GitHub Pages' built-in Actions deployment).
- **Public URL**: `https://<jk>.github.io/forager/` initially. Custom domain (`forager.<something>.com`) is a later flip — DNS CNAME + GitHub Pages setting.
- **HTTPS**: enforced by GitHub Pages. Required for `navigator.geolocation` and the file/camera input on iOS.
- **PWA install**: `manifest.webmanifest` declares name, icons, theme color, display=standalone. iOS users get a near-native experience via "Add to Home Screen."

### 4.4 Authentication & invitations

**Auth model**: Supabase Auth with **email + password**. Self-signup is disabled; new accounts are created only via invitation. After registration, login uses email + password — no further emails are sent.

**Invitation flow**:
1. Admin enters `anna@example.com` and selects a region/role. The app inserts an `invitation` row with a random `token`.
2. The system sends Anna a one-time **invitation email** containing a link: `https://forager/register?invite=<token>`.
3. Anna clicks the link → registration page with email pre-filled and read-only. She sets a password (and optionally a display username).
4. Submitting creates the Supabase Auth user, marks the invitation `accepted_at`, and inserts the corresponding `RegionMembership`.
5. Subsequent logins: email + password, no email sent.

**Why this works without ongoing emails**: clicking the invitation link in Anna's inbox proves she owns the email, so we don't need a separate "verify your email" step. After registration, password auth carries the session.

**No invitee = no access**: signups outside the invitation flow are blocked at the API layer. Even if someone bypassed signup, RLS denies all reads/writes since they'd have no `RegionMembership`.

**Display name vs. email login**: v1 uses email as the login identifier. Each user has an editable `display_name` shown on pins and comments. (Open question: do you want a *separate* unique `username` distinct from email, used as the login handle? Slight added complexity. Default: no.)

**Email sender**: invitation emails go through Supabase's default sender. The "from" address will be a Supabase domain. Custom SMTP (e.g., Resend) is a v2 polish task — only needed if Supabase's defaults end up in spam folders, which is rare for low volume.

### 4.5 Data flow & sync

**Online (the common case)**
- The PWA opens a Supabase client with the user's auth token.
- The active region (stored in localStorage) scopes every query.
- Reads use the Supabase SDK directly — no caching layer beyond the browser's HTTP cache and a small in-memory store for the current map view.
- Writes (drop pin, log observation, add photo) go straight to Supabase. UI optimistically updates, then reconciles when the response arrives.
- **Realtime** is off in v1 — invitees see new pins on next refresh. Supabase Realtime is a v2 toggle (free tier supports it; we'd just have to think about UX).

**Offline (field use, weak signal)**
- Service worker caches the app shell, fonts, map tiles for *visited* areas only (no aggressive pre-fetching of full tile pyramids — respects [OSM's tile usage policy](https://operations.osmfoundation.org/policies/tiles/)), and the user's current region's pins.
- Service worker carries a build-time version stamp; on activation it purges old caches. Standard pattern, prevents the most common PWA bug class.
- Writes performed offline are appended to an **IndexedDB outbox** (one record per write). UI shows a small "pending sync" badge.
- When the app detects online (or on next launch), the outbox is replayed: each pending write is sent to Supabase in order, with the entity's client-generated UUID serving as an idempotency key.
- Photo uploads are part of the same outbox — the photo blob lives in IndexedDB until it successfully uploads.

**Auth & offline**
- Supabase JWTs expire (~1 hour). Outbox entries do **not** carry a token — they're plain payloads.
- On flush, the sync worker first ensures a valid session: if the access token is expired, it attempts a refresh. If refresh fails (e.g., long offline session past the refresh-token TTL), the user is prompted to re-login. The outbox is preserved across re-login.

**Sync edge cases**
- *Conflicting offline edits to the same pin*: last-writer-wins on the server. We log conflicts to a debug view; in practice, two devices editing the same pin offline within minutes is rare for one user.
- *iOS background sync limits*: we don't rely on background sync (iOS Safari limits it). The outbox flushes when the app is foregrounded.

### 4.6 Region switching

- Active region is client-side state, persisted to `localStorage` as `forager.activeRegionId`.
- Switching regions clears the in-memory pin cache and refetches.
- A region switcher in the top bar shows the user's regions; admins see a "manage" entry.
- Auth tokens are not region-scoped; RLS does the actual filtering server-side based on `RegionMembership`.

### 4.7 Photo pipeline

1. User taps "add photo" on a pin or observation.
2. Browser opens the camera or file picker (`<input type="file" accept="image/*" capture="environment">`).
3. Client captures location for the photo, with this fallback ladder (since iOS Safari strips EXIF GPS):
   1. Use a cached GPS fix from the last 30 seconds if available.
   2. Try `navigator.geolocation.getCurrentPosition` with a 10-second timeout.
   3. On failure or denial: open the **`LocationPicker`** sheet — a small map centered on the pin (if attached to one) with three actions: "Use this pin's location" (one-tap default; copies pin coords), "Tap to set" (free placement), or "Skip" (store no location). The same `LocationPicker` is used for manual pin placement and for editing pin locations on a laptop.
4. Client downscales the image to ~1600px on the long edge using a canvas (preserves quality but caps storage cost). Original is *not* kept on the server; user's camera roll has the original.
5. Both the downscaled image and a ~256px thumbnail are uploaded to Supabase Storage under `photos/<photo-id>.jpg` (flat path; access controlled via Storage policies that join photo → pin → region_membership — see §10 C21).
6. A `Photo` row is inserted with the storage paths and the captured location.
7. If offline, all of the above happens against IndexedDB and is flushed later.

### 4.8 Import pipeline

Imports are *one-shot scripts*, not a runtime feature.

- A Node script in `scripts/import/cornell-cti.ts` (and a sibling for Ithaca) downloads the public dataset, filters by `forageable_species.json`, transforms each record into our pin shape, and upserts via `(import_source, import_external_id)`.
- The script reads Supabase credentials from a `.env.local` file the developer runs with. Service-role key is used (bypasses RLS) — kept out of the client bundle.
- Each import run inserts an `ImportRun` row recording counts and any errors.
- Re-running is idempotent: existing pins update their `import_raw` and (if the user hasn't moved the pin) their `location`. User-edited fields are never touched.
- **Why scripts not a runtime importer**: easier to inspect, easier to dry-run, no server endpoint to authorize, and imports are rare events.

### 4.9 Environments & cost

- **Dev**: a separate Supabase project (`forager-dev`) and a local SvelteKit dev server. Use a dev `.env` to point at `forager-dev`.
- **Prod**: `forager-prod` Supabase project. GitHub Pages serves the prod bundle.
- **Free-tier reality** (Supabase, as of mid-2026):
  - 500 MB database — easily 100k+ pins worth.
  - 1 GB storage — at ~200 KB per downscaled photo, ~5,000 photos.
  - 50,000 monthly active users — overkill for our scale.
  - 2 GB egress — fine until photo browsing gets heavy.
  - If we exceed any of these (most likely storage), the next tier is ~$25/month.

### 4.10 Resolved & remaining

Resolved:
- Hosting: GitHub Pages (Vercel reconsider only if preview deploys become valuable).
- Backend: Supabase (Postgres + PostGIS + Storage + Auth).
- Auth: email + password, invitation-only signup, registration email sent at invite time.
- Realtime collaboration: off for v1.
- Imports: scripts run by admin from local machine; no in-app importer.
- Project name: **Forager**.

Open / minor:
- **Separate `username` distinct from email**: resolved — no, email is the login identifier. `display_name` is editable per user.
- **Map tile fair-use** at scale: monitor; switch to a paid tile provider only if OSM rate-limits us. Not v1 concern.

---

## 5. Phenology Approach

How "the app should tell me what's likely ripe right now" actually works in v1. Goal: useful predictions from a small static seed of species data, with room to grow into smarter models later.

### 5.1 Concepts

- **Stage**: the visible state of a forageable. Enum: `flowering` → `green` → `ripening` → `ripe` → `past` (`bare` and `unknown` for off-season / unidentified).
- **"Today" for DOY math**: computed in the active region's `timezone`, not the user's device timezone. A traveling user does not get a different "ripe now" view than one at home.
- **Stage window**: for a given species in a given region, the day-of-year (DOY) range during which a stage is *typically* observable. Stored as `start_doy` / `end_doy`. Windows for adjacent stages may overlap (a tree can have flowers and green fruit simultaneously).
- **Effective window**: the window we actually use to predict a stage for a given pin, after applying user overrides and the region-year seasonal shift (see §3.3).
- **Predicted current stage**: the stage whose effective window contains today's DOY. If multiple match, the latest in the progression wins. If none match, the stage is `bare`.

### 5.2 Stage windows in species seed data

Each forageable species has, per region, a record like:

```
serviceberry (Amelanchier laevis) — Ithaca, zone 5b
  flowering: DOY 110 – 130
  green:     DOY 125 – 165
  ripening:  DOY 160 – 175
  ripe:      DOY 170 – 195
```

Stored in `data/species/<region>.json` in the repo, loaded into the `SpeciesFruitingWindow` table at seed time. v1 ships with windows for ~30 species in Ithaca. Refining a window is just editing the JSON and re-seeding (or hand-editing in the DB once invitees are using the app).

Not every species has all four stages tracked. For mushrooms we'd typically only have a `ripe` window (the flush). For nuts, the relevant window is `ripe` (drop / harvest).

### 5.3 Prediction resolution

For a given pin, viewing user, and current date, the resolution order for each stage's window:

1. **Region default** for that species in the active region.
2. Override with **user's per-species window** if one exists for this user/species/region.
3. Add the active region's **seasonal shift** for the current year (additive, signed).

The result is the effective window. The predicted current stage is computed from today's DOY against effective windows.

UI shows the chain of adjustments transparently: "ripe window: DOY 170 – 195 (region default), shifted −7 (2026 seasonal shift) → effective DOY 163 – 188."

### 5.4 The "ripe now" view

Algorithm (queries `v_pin_effective` for the active region's pins, accepts a target stage parameter — `ripe` is the default; `flowering` and `ripening` are also valid for "elderflower now" or "early ripening" views):

1. Compute today's DOY in the active region's timezone.
2. For each pin: look up the effective window for the target stage → check if today is inside.
3. Bucket each pin into:
   - **In window now** (today ∈ stage window)
   - **Starting soon** (today within 14 days of `start_doy`)
   - **Just past** (today within 14 days *after* `end_doy`)
   - **Off-season** (everything else; hidden by default)
4. Sort each bucket by distance from user's GPS (nearest first).

In v1 the UI exposes the `ripe` view as the primary surface and treats the others as quick filters off the same component.

Filters: by species, by hazard, by status (`active` only by default — `gone` and `dormant` excluded; `needs_verification` shown with a marker).

### 5.5 Forecast view

"What's coming up over the next ~30 days." Computed similarly to (5.4) but iterates DOY from today to today+30 and groups species by their start day. Useful for planning a calendar.

### 5.6 Observation history integration

When a user opens a pin, the detail view shows:

- **Predicted stage today** (from §5.3 math).
- **Most recent observation** (if any) — overrides the prediction's confidence ("you logged this as `ripe` 2 days ago").
- **Year-by-year history** — observations grouped by year, with the dates they hit each stage.

In v1 the prediction does *not* learn from history; it always uses the species/user/region windows. v2 might surface "based on your last 3 years' observations of *this* pin, ripe is typically DOY 168 ± 4" as a suggested override.

### 5.7 Sourcing initial window data

For v1 (Ithaca, ~30 species), windows are compiled by hand from:

- USDA Plants database (range/general phenology).
- USA National Phenology Network (USA-NPN) species profiles.
- Cornell Cooperative Extension and Cornell Botanic Gardens write-ups (local to Ithaca).
- Foraging field guides (Sam Thayer, Steve Brill, Wild Edibles of New England) for cross-reference.
- JK's own past observations where available.

These are explicitly *approximations*. The first season of use will surface bad windows; we adjust by editing and re-seeding (or using the in-app override UI once it exists).

### 5.8 Not in v1

- Growing-degree-day (GDD) computation from a weather API. v3 stretch goal.
- Machine learning of pin-specific windows from observation history. v2 idea.
- Multi-cycle fruiting per year (e.g., everbearing raspberry fall crops). v1 supports one window per stage per species per region — we'll fudge fall crops with notes for now.
- Stage windows for non-forageable phases (leaf-out, leaf-drop). Out of scope.
- Push notifications for "X is ripe today." In-app "ripe now" view only.

### 5.9 Resolved

- Multi-cycle fruiting: data model carries an array of windows per stage per species. Cheap to add now.
- Mushroom modeling: rough date ranges in v1, refined by observation.
- Default "near you" radius: 5 km, user-configurable.

---

## 6. Dataset Ingestion

How public tree inventories become pins in Forager.

### 6.1 Sources for v1

Two seed datasets, both Ithaca-region:

- **Cornell Campus Tree Inventory** — `https://cugir.library.cornell.edu/catalog/cugir-009100`. Hosted on CUGIR (Cornell's geospatial repository). Available as shapefile / GeoJSON. Covers the Cornell campus; ~12k–14k trees with species, location, DBH, condition.
- **City of Ithaca Tree Inventory** — `https://www.cityofithacany.gov/253/Tree-Inventory-GIS`. Likely an ArcGIS REST endpoint plus downloadable extracts. Covers city street trees and city parks; thousands of records with species, location, condition.

Field details for both will need to be inspected from the actual dump before we lock the schema mapping; the plan below assumes typical inventory fields (`tree_id`, scientific name, common name, lat/lng, DBH, condition).

### 6.2 Filter — the forageable species list

`data/forageable_species.json` in the repo is the source of truth for what counts as forageable. Each entry:

```
{
  "scientific_name": "Amelanchier laevis",
  "common_name": "Allegheny serviceberry",
  "aliases": ["serviceberry", "Juneberry", "shadbush"],
  "forage_parts": ["fruit"],
  "safety_notes": ""
}
```

Scope for v1: ~30 species — the things JK actually forages or might forage. Examples: serviceberry, Cornelian cherry, pawpaw, persimmon, mulberry, black walnut, butternut, shagbark hickory, crabapple, beach plum, autumn olive, mountain ash, hazel, elderberry, sassafras, spicebush.

The same file is consumed by:
- The species seed (creates `Species` rows).
- The import filter (any record whose scientific name doesn't resolve into this list is skipped).
- The species seed for fruiting windows (paired with `data/species/ithaca.json` from §5).

Name normalization: incoming records often have inconsistent capitalization, abbreviations (`A. laevis`), or genus-only entries. The filter normalizes whitespace + case and matches on scientific name first, common name + aliases as fallback. Unmatched records get logged so we can extend the list if we missed something.

### 6.3 Schema mapping (illustrative)

Cornell record (illustrative shape — confirm at implementation):
```
{ tree_id: "C-12345", sci_name: "Amelanchier laevis",
  common_name: "Allegheny serviceberry",
  lat: 42.4501, lng: -76.4811,
  dbh_in: 8, condition: "Good" }
```
→ Forager `Pin`:
```
{ region_id: "ithaca",
  import_source: "cornell-cti",
  import_external_id: "C-12345",
  species_id: <looked up via forageable_species>,
  location: POINT(-76.4811 42.4501),
  location_accuracy_m: 1,
  status: "active",
  import_raw: <the entire source record>,
  display_name: null,
  notes: null }
```

The original record is stored verbatim in `import_raw` so we can re-derive fields later, audit conflicts, and (if needed) re-process with a corrected mapping without re-fetching the source.

### 6.4 Pipeline mechanics

For each source, a Node script in `scripts/import/<source-id>.ts`:

1. **Fetch** the dataset. For CUGIR: download the published file. For ArcGIS REST: paginate queries, respecting page limits (typically 1k–2k records per request).
2. **Parse**. Use a small library (`shapefile` or `@turf/turf`) for shapefile input; native JSON parse for GeoJSON; ArcGIS-specific shape conversion for the Ithaca endpoint.
3. **Filter** by the forageable species list (§6.2).
4. **Transform** each record into the pin shape.
5. **Upsert** into Supabase using the service-role key, keyed on `(region_id, import_source, import_external_id)`.
6. **Record** an `ImportRun` row with counts (`pins_created`, `pins_updated`, `pins_skipped_unmatched`, `pins_with_errors`) and any error details.

Scripts are run from a dev laptop with a local `.env`. Service-role credentials never enter the client bundle.

The script takes an advisory Postgres lock (`pg_advisory_lock(hashtext(region_id || ':' || import_source))`) at start and releases at finish, so two admins can't run the same import simultaneously. With one admin in v1 this is theoretical; the cost is one extra SQL line.

### 6.5 Re-import & idempotency

Re-running an import is safe and mostly a no-op:

- **Existing pin found** (by `(region_id, import_source, import_external_id)`):
  - Update `import_raw` to the latest source record.
  - Update `location` *only if* `location_modified_by_user_at` is null. (The flag is set the first time a user moves the pin; this is more reliable than coordinate comparison, which is fragile under floating-point drift and sub-meter nudges.)
  - Never overwrite user-edited fields (`display_name`, `notes`, `species_id` if changed, `status`).
- **Pin not yet imported** (new in source): insert as `active`.
- **Pin in our DB but not in the new dump**: leave alone. Some sources publish partial extracts; auto-marking gone would create false negatives. Manual `gone` marking by users handles real removals.
- **Source record without a forageable species match**: skip; log to `ImportRun.errors` only if the species name was clearly an attempted match (e.g., looked like one of our species but didn't normalize).

### 6.6 Licensing & attribution

Both datasets are public-sector and likely permissive (public domain or open data license), but **we verify before importing**. The license terms are recorded as text in the `ImportSource` metadata and shown in an "About data" page in the app.

Pins display a "source: Cornell CTI" badge in the detail view. Bulk attribution appears in the app's about page and `README.md`.

### 6.7 Manual additions

Pins added through the app (from a phone or laptop) have `import_source = NULL` and `import_external_id = NULL`. They behave identically to imported pins for all UI purposes, but are unaffected by re-imports.

A user *can* edit the `species_id` of an imported pin (e.g., correcting "this is actually a different cultivar"); the `import_raw` preserves the original claim for audit.

### 6.8 Resolved & remaining

Resolved:
- **Starter species list** stays as drafted; species absent from the source datasets remain available for manual pins.
- **License verification**: we'll check Cornell and Ithaca terms during implementation. Given the private/closed-group use, ambiguity is not a blocker; we'll proceed unless there's an explicit prohibition.
- **iNaturalist** as a v2 dataset: in scope for v2, especially for non-tree forageables (mushrooms, brambles, ground plants).

Open / minor:
- **Distribution format choices** for both Cornell (CUGIR offers multiple) and Ithaca (need to confirm export availability) — pick at implementation.
- **Refresh cadence** — manual; ~annually feels right.
- **Falling Fruit** as another v2 dataset.

---

## 7. Sharing & Permissions

How regions, roles, and Postgres Row-Level Security keep data scoped, and what each user can actually do.

### 7.1 Roles

Two roles in v1, scoped per region (a user can have different roles in different regions):

- **Admin** — creator of a region by default. Can invite/remove members, change roles, edit/move/mark-gone any pin, run imports, set the region seasonal shift, edit species fruiting windows for the region.
- **Member** — can view everything in the region, add their own pins/observations/photos/hazards/comments, edit only their own contributions.

For v1 with ~3 invitees, JK is the sole admin of the "Ithaca shared" region. Multi-admin is supported by the model (just promote a member); we don't ship admin transfer UI in v1.

### 7.2 What every member can do (within their active region)

- See all pins, observations, photos, hazards, comments.
- Add a pin, observation, photo, hazard, or comment to any pin.
- Edit/delete *their own* pins, observations, photos, comments. (Pin authorship is recorded at creation; not transferable.)
- Set their own per-species fruiting window override, personal "near you" radius, etc.

### 7.3 What only admins can do

- Invite or remove members; change roles.
- Edit/move/mark-gone any pin (not only their own).
- Run imports.
- Set the `RegionSeasonalShift` for the current year.
- Edit the region default `SpeciesFruitingWindow` rows.
- Edit region metadata (name, default map center, climate zone).

### 7.4 Region invariants (the cross-region wall)

These properties hold by construction:

- A query for any region-scoped entity (pin, observation, photo, comment, hazard, invitation, run) **must** include the active region's ID and a check that the user is a member.
- Switching the active region in the UI clears in-memory caches; nothing from the prior region survives the switch except the user's own personal settings.
- A user with no membership in any region sees no data and is sent to a "you have no regions yet" screen, with text inviting them to ask the person who invited them for a fresh invite. (Covers the case where an admin removed an invitee, or where an invite was accepted but the membership row was lost.)

### 7.5 Row-Level Security (sketch)

Concrete enough for implementation. Supabase Auth populates `auth.uid()`.

**Pin**
- `SELECT`: `EXISTS (SELECT 1 FROM region_membership WHERE user_id = auth.uid() AND region_id = pin.region_id)`
- `INSERT`: same membership check + `created_by = auth.uid()`
- `UPDATE` / `DELETE`: `created_by = auth.uid()` OR caller is admin of `region_id`

**Observation, Photo, Hazard, Comment**
- `SELECT`: caller is a member of the parent pin's region.
- `INSERT`: same + `user_id = auth.uid()`.
- `UPDATE` / `DELETE`: `user_id = auth.uid()` (own only). Admin override allowed for moderation in rare cases.

**Region**
- `SELECT`: caller is a member of the region OR has a pending invitation to it.
- `UPDATE`: caller is admin of the region.

**RegionMembership**
- `SELECT`: caller is a member of the same region (you can see your co-members).
- `INSERT`: only via the invitation-acceptance Postgres function (which validates the token); direct inserts denied.
- `DELETE`: caller is admin of the region OR removing themselves.

**Invitation**
- `SELECT`: caller is admin of the region OR the invitation's email matches the caller's email (so an invitee can read their own pending invitation when accepting).
- `INSERT` / `DELETE`: caller is admin of the region.
- `UPDATE`: only via the acceptance function.

**Species**: read by all authenticated users; written by admins (any region admin can edit; species are global). v1 may keep species table editable only via service role to keep it clean — that's a small simplification.

**SpeciesFruitingWindow** (region-level): read by region members; write by region admins.

**UserFruitingWindowOverride**: full CRUD by `user_id = auth.uid()`. Other users cannot read.

**RegionSeasonalShift**: read by region members; write by region admins.

**ImportSource / ImportRun**: read by region members; write by service role (scripts).

**Storage (photos)**: bucket policies mirror the photo table — read access requires region membership (joined via `photo → pin → region_membership`); signed URLs for time-limited links. Path convention: flat `photos/<photo_id>.jpg`. Pin moves between regions don't require renaming objects.

### 7.6 Privacy through region scoping

A "private to me" pin lives in a region with a single member (the user). There is no per-pin visibility flag. Consequences:

- Switching to your private region rescopes the entire UI to that region. You don't see "Ithaca shared" pins while looking at "JK only."
- Promoting a private pin to a shared region is a manual move (out of scope for v1 — we'd add a "duplicate to region X" action in v2).

### 7.7 Departure & data retention

- A user can be removed from a region by an admin; their `RegionMembership` is deleted, but their pins/observations/photos/comments stay in the region with their authorship preserved.
- A user can request their `display_name` be anonymized to "former member"; their auth record can be deleted while preserving content (foreign keys nullable / soft-tied).
- Hard-deleting a user's content is supported by admin action but is rarely the right move.

### 7.8 Resolved & deferred

Resolved:
- **No moderation features in v1.** Small trusted group; misuse handled by removing the membership.
- **Admins can edit any pin in their region** (move, mark gone, fix typo'd species). Useful for cleaning up after imports.
- **Users can delete their own content** (pins, observations, photos, hazards, comments). Admins can also delete content in their region but rarely should.

Deferred to v2:
- **Promote a pin from private to shared region.**
- **Region-ownership transfer / multi-admin UI.**

---

## 8. Phasing

Each phase is shippable and useful in isolation. We don't aim for a big-bang v1 launch — we dogfood each phase until the next one is ready.

### 8.1 Principles

- **Each phase has end-user value to JK.** No infrastructure-only phases.
- **Skip features rather than half-build them.** Better to ship a phase without offline support and add it cleanly in the next phase than to ship broken offline.
- **Data model is forward-compatible from day one.** v1 schema already accommodates regions, multi-user, multi-region — even when phase 1 only uses one user. Avoids painful migrations.
- **Manual scripts > admin UI** until the volume justifies UI.

### 8.2 Phase 0 — Setup (invisible scaffolding)

- GitHub repo `forager` with code + this `PLAN.md`.
- Branching: `main` = prod (auto-deploys to GitHub Pages); feature work happens on branches and merges via PR.
- `README.md` documenting local development workflow: clone, install, copy `.env.example` to `.env.local`, point at `forager-dev`, `npm run dev`. Written before any feature code so future-you (or a contributor) can stand up a working dev env in under 10 minutes.
- Two Supabase projects: `forager-dev`, `forager-prod`.
- **Migration tooling** wired up via `supabase/cli` — every schema change is a numbered migration file in the repo, applied to dev first and to prod on release.
- SvelteKit project skeleton, PWA manifest, service worker shell with build-time version stamp.
- GitHub Actions deploy to GitHub Pages on push to `main`.
- Postgres schema (DDL for §3 tables), with PostGIS enabled, expressed as the initial migration.
- Postgres functions/views from §10 C20: `is_region_member()`, `effective_window()`, `v_pin_effective`.
- Seed data files: `data/forageable_species.json`, `data/species/ithaca.json`.
- A seed script that loads species + fruiting-window data into the DB. Default behavior: **insert-if-not-exists** (does not overwrite admin-edited rows). A `--force` flag overrides for the rare full-rebuild case.
- A dev-fixtures script `scripts/seed-dev.ts` that populates `forager-dev` with ~10 fake pins, observations, and photos so UI work has something to show against from day one.
- Supabase Storage bucket `photos` with policies.

*Effort: ~3–4 engineer-days.*

### 8.3 Phase 1 — Solo MVP

The smallest thing JK can actually use. **No multi-user, no invitations, no offline queue.** One hardcoded user (JK), one hardcoded region (`Ithaca shared`).

- Auth (email + password) — real login from day one, no dev shortcut. Even with only one user, the working flow gets built once and stays built.
- Map screen with Leaflet + OSM tiles, GPS auto-locate.
- Pin CRUD: drop pin (with GPS), view, edit, mark gone/dormant/needs-verification.
- Species picker (typeahead from seeded forageables).
- Observation logging (stage, quality 1–5, notes).
- Photo upload with GPS captured at upload time, downscaled to 1600px.
- Hazard tagging.
- "Ripe now" view (hardcoded "near you" = 5 km).
- Pin detail page with year-over-year observation history.
- Cornell + Ithaca import scripts run from JK's laptop. Forageable filter applied.

End of Phase 1: JK can plan walks, drop pins, take field notes, look up "what's ripe today." Solo.

*Effort: ~7–10 engineer-days.*

### 8.4 Phase 2 — Multi-user

- Invitation flow (email-based, token-consumed-on-registration).
- Real RegionMembership-driven RLS (Phase 1 has a stub).
- Region switcher in the top bar.
- Admin actions: invite, remove, role change, set region seasonal shift, edit region default windows.
- Comments on pins.
- Authorship displayed on pins, observations, photos.
- Personal "private" region creation (single-member region for sensitive spots).

End of Phase 2: JK invites Anna and a couple of others. Each can drop pins, comment, log observations. Privacy is achievable via a personal region.

**Phase 2 acceptance check**: send a test invitation to at least one Gmail address and one non-Gmail address; confirm the email lands in the inbox (not Promotions/Spam) and the registration link works. If deliverability is poor, escalate the custom-SMTP work (a v2 polish task) into Phase 2.

*Effort: ~5–7 engineer-days.*

### 8.5 Phase 3 — Field polish (= v1 complete)

- Offline queue (IndexedDB outbox, replay on reconnect).
- Service worker caching of app shell + visible map tiles.
- Forecast view (next 30 days).
- Filter UI (species, status, hazard, "currently in window").
- "Navigate here" handoff to Apple/Google Maps.
- Pin "needs verification" auto-flag after 4 years without an observation.
- User per-species window override UI.
- Quality-of-life: bigger touch targets, one-handed pin drop confirmed, low-battery GPS mode.
- About / data attribution page.

End of Phase 3: app is robust enough for unsupervised field use by all invitees. This is what we'd call **v1**.

*Effort: ~5–8 engineer-days.*

### 8.6 v2 backlog (post-launch)

- Realtime updates between active sessions.
- iNaturalist + Falling Fruit dataset imports.
- Polygon support for patches/thickets.
- Cross-region pin promotion (private → shared).
- Empirical pin-specific fruiting windows learned from observation history.
- Region ownership transfer / multi-admin UI.
- Admin UI for editing the forageable species list.
- Custom email sender, custom domain.
- Optional weekly email digest of "ripe now."
- Data export (CSV / GeoJSON) per user.

### 8.7 v3 horizon

- Growing-degree-day–based predictions from a weather API.
- Optional native wrappers if PWA limitations bite (rarely needed for this use case).
- Image-based species suggestions (could be as simple as deep-linking to iNaturalist's CV API).

### 8.8 Wall-clock vs. engineer-days

The estimates above are concentrated effort. In practice, hobby cadence (a few hours a week) extends the wall-clock significantly. If JK works on this ~10 hours/week, total v1 effort (~17–25 engineer-days) maps to roughly **3–5 calendar months** to v1 — assuming no major reroutes. That's fine; phased shipping means JK is using the app long before v1 is "done."

### 8.9 Resolved

- **Auth in Phase 1** even with one user (avoids painful migration later).
- **Comments deferred to Phase 2** (require multi-user).
- **Custom domain deferred to v2** (`<jk>.github.io/forager` is fine for v1).
- **Effort estimate stands**: ~17–25 engineer-days at ~10 hrs/week → ~3–5 calendar months for v1.

Open / minor:
- **Beta-tester for Phase 2** — probably one trusted invitee first, then expand to ~3.

---

## 9. Open Questions & Things Not Yet Discussed

Most of the plan is settled. This section is the consolidated list of what's *not*.

### 9.1 Still genuinely open (decide before / during Phase 0)

- **License terms** for the Cornell and Ithaca tree datasets — quick verification step before the first import run. (§6.8)
- **Distribution format** to use for each source dataset — pick at implementation. (§6.8)
- **Beta-test ordering** for Phase 2 invitees. (§8.9)

### 9.2 Things we haven't discussed yet but should before launch

- **Visual design / theme.** Color palette, marker styles, typography, dark mode. Not a blocker for Phase 0–1; worth a short discussion before Phase 3 polish.
- **App icon and PWA install branding.** Needs to exist before "Add to Home Screen" looks right. Defer until Phase 3.
- **Data-handling notice.** The app collects GPS coordinates and photos with location metadata. For a private app among friends, a one-page "what we collect, where it lives" page in the about section is sufficient — not a legal privacy policy. Worth writing before the first invitee joins.
- **Backups / disaster recovery.** Supabase's free tier has nightly snapshots; we should also export the database periodically (a cron-equivalent or weekly manual dump) given the data is irreplaceable user observation history.
- **Testing strategy.** No mention so far. For a personal app, a thin layer is enough: unit tests for window-resolution math and import-mapping logic, manual testing for UI. Worth deciding at Phase 0.
- **Error reporting.** When the offline queue silently fails to sync, how does JK find out? Sentry has a free tier; alternatively, a small "sync errors" screen visible in the app.
- **Accessibility.** Touch targets, color contrast, screen-reader labels. Phase 3 polish item.

### 9.3 Decisions deferred to v2 / v3 (already noted, listed here for the record)

- iNaturalist & Falling Fruit dataset imports.
- Polygon support for patches/thickets.
- Cross-region pin promotion (private → shared).
- Region ownership transfer & multi-admin UI.
- Empirical pin-specific fruiting windows from observation history.
- Custom email sender, custom domain.
- Realtime updates between sessions.
- Optional email digest of "ripe now."
- Push notifications.
- Growing-degree-day / weather-API-driven phenology.
- Image-based species suggestions.

---

## 10. Architectural Commitments

Cross-cutting choices that bind the implementation. These exist to prevent code duplication, keep debugging tractable, and avoid painful retrofits. Each commitment is referenced from the section that depends on it.

### Committed (apply from Phase 0)

**C16. UUIDs end-to-end.** Every entity has `id uuid primary key default gen_random_uuid()`. Clients generate UUIDs *before* insert. Reasons: (a) offline-first writes can reference each other (a photo's `observation_id` is known before either has synced); (b) replays are naturally idempotent — server upserts ignore duplicates by ID. Without this, a remapping layer ("client temp ID → server real ID") leaks into every component.

**C17. Single write path through an outbox, from Phase 1 day one.** All mutations go through `outbox.enqueue(write)`. In Phase 1 the outbox flushes immediately (online-only); Phase 3 just adds queueing for offline. Same code path always, no second "online vs. offline" branching. UI shows optimistic state and reconciles via the outbox event stream.

**C18. Domain-typed service layer wrapping Supabase.** All Supabase SDK calls live inside `src/lib/services/*.ts` (one module per entity: `pinService`, `observationService`, `photoService`, etc.). Components import services, never the raw Supabase client. Centralizes query shapes, retry/replay logic, optimistic updates, and region scoping. No `supabase.from(...)` outside the service layer.

**C19. Shared types module generated from the schema.** `supabase gen types typescript` (run as part of CI / locally) emits `src/lib/database.types.ts`. Both client and import scripts (`scripts/import/*.ts`) consume it. Single source of truth for entity shapes; eliminates drift between the schema and code that builds rows.

**C20. Pure logic in Postgres functions and views.** Specifically:
- `is_region_member(user_id uuid, region_id uuid) → boolean` — used in many RLS policies and in the service layer.
- `effective_window(pin_id uuid, viewing_user_id uuid, year integer) → (start_doy int, end_doy int)` — implements the resolution order from §3.3 and §5.3.
- `v_pin_effective` — view exposing pin row plus computed effective status (with auto-degrade to `needs_verification` after 4 years stale) and effective fruiting windows.

Client UI reads from `v_pin_effective`; raw `pin` rows are for admin/debug surfaces. This is the only place the resolution math lives — TypeScript never re-implements it.

**C21. Flat photo storage paths.** Storage objects live at `photos/<photo_id>.jpg` (and `photos/<photo_id>-thumb.jpg`), *not* nested under region or pin. Access control is enforced by Storage policies that join photo → pin → region_membership. This means future actions (cross-region pin promotion, pin moves) don't require renaming objects.

**C26. A single `useActiveRegion()` accessor.** A Svelte store at `src/lib/stores/activeRegion.ts` is the only thing that reads/writes `localStorage.activeRegionId`. All components subscribe to it. Service-layer methods take a region context implicitly. Prevents region switches from leaking inconsistencies.

**C27. UI reads from views; raw tables are for admin/debug.** The general rule: every entity that has computed/effective semantics has a corresponding view (`v_pin_effective`, `v_observation_with_stage`, etc.). UI code reads from views by default. Raw rows are for migrations, scripts, and explicit admin tooling. Prevents the same logic from being implemented twice in TypeScript and SQL.

### Deferred (add when actually needed, not before)

- **Structured climate zone** (`(system, code)` instead of free text). Free text is fine in v1 (one region). Migrate later with a single column addition + parser.
- **Region creation as a transactional Postgres function**. Plan to write it for **Phase 2** when personal regions become a feature; not Phase 0.
- **Audit/events table.** Add the first time we hit a real "who changed this and when?" debug session. Don't build speculatively.
- **Seed-file schema versioning.** Skip; we control both producer and consumer of `data/*.json`. If the format changes, both change at once.

---

## Plan status

This document is the source of truth for Forager's design. It will be edited as decisions firm up or change. When implementation begins, individual phases may move to issue tracking, but architectural and product decisions return here.


---

---
