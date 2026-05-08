# Cost, capacity, and pitfalls before launch

Snapshot of where the app stands financially / operationally and what
to watch for at production scale.

## Current monthly cost

| Service | Plan | Cost | Notes |
|---|---|---|---|
| Supabase | Pro | **$25** | DB + Auth + Storage + Realtime + Edge Functions |
| GitHub Pages | Free | $0 | Static hosting for the SvelteKit app |
| OpenStreetMap (HOT) tiles | Free, attribution required | $0 | Per their TOS, fine for low-volume + attributed; commercial-scale use should self-host or use a paid provider |
| Wikimedia Commons (photos) | Free | $0 | Photos are hot-linked from upload.wikimedia.org; their TOS allows it |
| Wikidata SPARQL | Free | $0 | Used at import time only, ~once per catalog change |
| Domain (if you buy one) | — | $1-2/mo amortized | Optional; gh-pages subdomain works |
| **Total** | | **~$25/mo** | |

## Capacity on the $25/mo Supabase Pro plan

Hard limits:

| Resource | Pro tier | Current | Headroom |
|---|---|---|---|
| Database size | 8 GB | ~700 MB (was 700 MB; will drop ~500 MB after import_raw vacuum) | **8×** before upgrade |
| Storage | 100 GB | ~0 (no photo uploads yet) | huge |
| Egress (network out) | 250 GB/month | unknown without metering, likely <1 GB so far | **250×** before upgrade |
| Monthly active users (MAU) | 100,000 included; **$0.00325 per MAU above** | low single digits | linear cost above 100k |
| Auth: signups, logins | unlimited | low | non-binding |
| Edge functions | 2M invocations | 0 | non-binding |
| Realtime concurrent connections | 500 | 0 | non-binding (we don't use Realtime) |

### How many users can $25/mo realistically support?

The binding constraint is almost always **egress** (data transferred to clients), not DB size or MAU.

**Rough back-of-envelope per active session:**
- App shell load (cached after first visit): ~500 KB
- Map tiles for one session of pan/zoom: ~5-15 MB (cached after first viewport)
- Pin fetches per viewport: ~100-300 KB (capped at 500 pins × ~600 bytes)
- USDA zones overlay (one-time, cached): ~720 KB gzipped
- Species catalog: ~100 KB

Per **first** session for a new user: ~10-20 MB.
Per **return** session (cached shell + tiles): ~1-5 MB of new pin/RPC data.

Egress budget: 250 GB/month = **256,000 MB**.

| User pattern | MB/month per user | Users at 250 GB |
|---|---|---|
| Power users (daily, lots of pan) | ~100 MB | **2,500** |
| Regular users (weekly) | ~30 MB | **8,300** |
| Tourists (one session, never return) | ~15 MB | **17,000** |

**Realistic mix at $25/mo: 5,000-15,000 monthly actives** before egress becomes the binding constraint. Past that, three options:

1. **Cloudflare in front of Supabase REST**. Per the plan §"Cloudflare in front of Supabase REST" — public-pin reads are highly cacheable (`Cache-Control: max-age=60, s-maxage=300`). A CDN absorbs 80-95% of repeat reads, effectively multiplying egress capacity 5-20×. Cloudflare free tier handles this; +$0/mo.
2. **Self-host map tiles**. OSM-HOT tile fetches are direct to French servers. Once you outgrow polite use, switch to a paid tile provider ($30-100/mo for moderate scale) or self-host with PMTiles served from R2 (~$5-15/mo for the data + transfer).
3. **Upgrade Supabase**. Team plan starts at $599/mo for 8 GB → 50 GB DB, much more egress. That's a large jump; only justified at thousands of paid users.

### Cost at scale (rough projections)

| MAU | Monthly cost | Notes |
|---|---|---|
| 1,000 | $25 | Comfortably within Pro |
| 10,000 | $25-50 | Pro + maybe $0-25 over MAU cap; egress within budget |
| 100,000 | $50-150 | At MAU cap; need Cloudflare in front to keep egress sane |
| 500,000 | ~$1,500-2,500 | MAU overage starts adding up; Pro plan still fine for DB |
| 1,000,000+ | $3,000+ | Reconsider Team tier or migrate to dedicated infra |

A single paid subscription at $30/year covers ~5,000 MB of egress at your unit costs — roughly 50-300 sessions of use per year. Healthy ratio if even 1% of free users convert.

## App Store distribution

PWAs can technically install directly via Safari "Add to Home Screen" — no App Store review, no fees, no Apple cut. **That works today** with what's already shipped. Distribution by URL.

For a **real App Store presence** (search ranking, ratings, the App Store badge that signals legitimacy), you'd wrap the PWA in **Capacitor** and submit a native shell:

| Item | Cost | Notes |
|---|---|---|
| Apple Developer Program | **$99/year** | Required to publish on App Store; covers iOS + macOS + tvOS submissions |
| Google Play Developer | **$25 one-time** | Lifetime; required for Play Store submission |
| Capacitor wrapping | $0 (open source) | Adds a thin native shell around the PWA. Plan §Phase 4 already has this teed up. |
| Privacy policy + terms | $0-200 | Required for App Store. Free templates work; lawyer review optional ($100-300) |
| App icons + screenshots | $0-50 | Generators online; or hand-made |
| **One-time + annual** | **~$125 + $99/yr** | |

Apple's anti-steering allowances post-Epic mean you can:
- Distribute the app for **free** on the App Store
- Have users sign up + pay on the **web** at forager.app
- Direct users from inside the app to the web for subscription via a clearly-labeled link
- Keep 100% of subscription revenue (no Apple 30%/15% cut)

This is what Spotify, Netflix, Patreon, etc. all do post-2024. The submission is more rigorous (Apple checks the link is appropriate) but it works.

**Alternative**: full IAP for App Store users only (Apple takes 30% first year, 15% after; or 15% small-business if revenue <$1M/year). Simpler UX (one-tap subscribe) but lower margins.

I'd ship the PWA-only version first, get to $1k/mo subscription revenue, then invest the $200/year in Apple + Google to get the App Store presence. The first revenue dollar is harder than the App Store paperwork.

## Pitfalls to watch for

### Operational

- **Backups**. Supabase Pro does daily backups (kept 7 days). Test restore at least once before launch — find out the procedure when nothing's broken.
- **Schema migrations under load**. Migrations that take long table-locking work (`ALTER TABLE ADD COLUMN NOT NULL`, `CREATE INDEX` without `CONCURRENTLY`) can briefly stall reads. Use `CONCURRENTLY` for all post-launch indexes.
- **Free-tier scraping**. People will hit your public Supabase REST endpoints from scripts. Throttle at the Cloudflare layer when traffic gets real.
- **Photo storage growth**. If/when you allow user photos, storage grows fast. Resize aggressively on upload (max 1600×1200, 200 KB JPEG); cap per-pin count (3 photos); cap per-user lifetime (~100 photos for free tier, more for paid).
- **The Read-only-mode trap you just hit**. Supabase's spend-cap behavior is to flip writes off rather than auto-charge. Set up email alerts at 70% / 90% of the egress + DB-size budget. Better: set a credit card and explicitly disable hard caps so you eat $5-30 of overage rather than $30-300 of downtime.

### Data quality

- **Imports go stale**. Dryad's data is from 2022. NYC OpenData updates yearly. Set a calendar reminder to refresh the imports every 12-24 months.
- **Coordinate outliers**. Already saw 615 of these from Dryad. New imports will surface more; keep the post-import filter from migration 36 in place.
- **Wrong-species pins**. Tree inventories misidentify regularly. Community flags will surface this; threshold rules need calibrating after a month of real use.
- **Watchlist notifications going wrong**. A bug that emails 100k users daily about phantom ripeness is the kind of mistake that costs you the user base. Stage the notifier by sending to <100 internal/test users for the first month before opening to all.

### Legal / liability

- **Foraging is a real-world activity with real-world risks.** The Disclaimer modal is good but talk to a lawyer before public launch. Standard disclaimers around mushroom ID, allergies, trespassing, contamination.
- **Dryad data license**. CC0; no attribution required, no restrictions. Fine.
- **OPHZ map**. Public domain derivative; their LICENSE.md confirms reuse. Fine.
- **Wikipedia text**. CC BY-SA 4.0 — share-alike. We never copy verbatim text into the DB; the prose is original. Fine.
- **OpenStreetMap tiles**. Use the HOT-style URL (which we do). Attribution must remain visible — already in the basemap config. Don't hot-link an extreme volume; switch to paid or self-hosted past ~50k requests/day. Fine for now.
- **Wikimedia Commons photos**. Hot-linking is allowed; attribution shown in the lightbox is required for most licenses. Already implemented. Fine.

### Growth

- **Don't open the firehose without a moat**. Free tier with no commitment churns; people sign up, never come back. The watchlist alerts (per Phase 2F) are the engagement loop. Make sure they work before driving any real volume.
- **Paid conversion**. The free tier needs to feel useful but the paid tier needs to feel necessary. Don't gate basic features (curating their region's species, marking a tree gone) behind paid.
- **Region quality at launch**. Cap the launch to "we have good data here" cities. Better to seed 10 cities really well than 60 with patchy coverage.

## Performance: keeping the app smooth

Already done:

- ✅ Slim bbox RPC (skips heavy v_pin_effective fields on the public layer)
- ✅ SECURITY DEFINER on public read paths (skips RLS per row)
- ✅ Per-pin climate_zone_id (no per-fetch zone lookup)
- ✅ has_ripe_observation_ever as a precomputed column
- ✅ Pre-aggregated density grid for heatmap zooms
- ✅ Server-side per-species summary RPC for accurate counts without fetching all pins
- ✅ Service worker caching app shell + tiles + USDA zones overlay

Still to do (in rough priority order):

1. **Cloudflare in front of Supabase REST** — biggest single win for both cost and latency. ~½ day of setup. Public read paths get 60s/300s cache headers; CDN absorbs 80-95%+ of repeat traffic.
2. **Phase 2 + 3 of offline support** (data/offline-plan.md) — IndexedDB pin/tile cache + write outbox. Drastically cuts re-fetch traffic for return users.
3. **Per-interest-group density grid** — restore the previously-promised "heatmap reflects user interests" behavior. Needed when user has non-default interests.
4. **HTTP cache headers everywhere** that's safe (species catalog, USDA zones, regions list, climate_zones). Cheap to add.
5. **`ANALYZE` after bulk imports** — already discovered in migration history; bake into the importer.
6. **Photo upload with aggressive resizing** — when photos land in v1.x, resize client-side to 1600×1200 max + 200 KB target before upload.
7. **Database index audit at launch.** Specifically ensure these are in place:
   - GIST on `pins.location` (yes, already)
   - GIN on `species.aliases` (yes, already)
   - GIN on `species.interest_tags` (yes, added migration 29)
   - composite (`pins.region_id`, `pins.species_id`) for the activity feed
   - partial indexes for `visibility = 'public'` paths
8. **Error tracking / observability**. Hook up Sentry (free tier 5k events/month) or similar. Without this, you find out about bugs from users.
9. **Frontend bundle size**. Vite tree-shakes pretty well, but periodically check the build output. Keep the per-route JS payload under ~150 KB gzipped to load fast on mobile.
10. **Cold-start latency on Edge Functions** (when/if added). First request after idle can be 1-3s; pre-warm with a periodic ping if a function is on a hot path.

## Honest summary

Right now, with what's shipped, you can probably handle **a few thousand monthly actives on $25/month** without trouble. That's enough to run a private beta and validate the funnel.

Past that, the upgrade order is:
1. Cloudflare ($0)
2. Apple/Google dev programs (~$125 + $99/yr) — only when ready to be in stores
3. Stripe payments ($0 base + 2.9% + $0.30/transaction) — only when ready to charge
4. Supabase MAU overage ($0.003/MAU > 100k) — small, scales gracefully
5. Self-hosted map tiles (~$10-30/mo) — only at high volume

You're well-positioned. The main near-term work is **Cloudflare** + **finalizing payment + verifying watchlist alerts** before opening it to the public.
