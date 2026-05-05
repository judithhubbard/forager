# Forager — Plan Audit

Critical read of `PLAN.md` looking for failure modes, inconsistencies, gaps, and clean-groundwork choices that prevent code duplication and ease debugging. Findings are grouped by severity and category. Each item names the section it touches and proposes a concrete fix.

---

## A. Internal inconsistencies (must fix in PLAN.md before Phase 0)

These are direct contradictions between sections — they will confuse future readers and cause the wrong thing to be implemented.

1. **Per-pin window override is in §1 goals and §2 stories but explicitly *removed* in §3.3.**
   - §1 line 24: "Override per-pin fruiting windows when personal observations diverge..."
   - §2 line 88 ("Per-pin window override" story).
   - §3.3 line 186: "There is no per-pin window override in v1."
   - **Fix**: drop the goal bullet and the user story; replace with the seasonal-shift / observation-history story.

2. **§1 non-goals list "comments" under social features, but comments are a v1 (Phase 2) feature.**
   - §1 line 46: "**Social features**: ratings, comments, public profiles, leaderboards."
   - §3.7 / §7 / §8.4 all include comments.
   - **Fix**: remove "comments" from the non-goal; rephrase the bullet as "ratings of pins, public profiles, leaderboards" (the things actually excluded).

3. **§3.2 lists `auto_verification_doy_threshold` as a *Pin field*, but the same paragraph says it's read-time-computed.**
   - Lines 139–140: described as a stored field but explicitly "Computed at read time."
   - **Fix**: remove from the Pin field list. Add a separate "derived/computed" subsection or a SQL view note saying "the effective status, including auto-degrade, is exposed via a `v_pin_effective` view."

4. **`ImportRun` field shape disagrees between §3.9 and §6.4.**
   - §3.9: `pins_created`, `pins_updated`, `pins_marked_gone`, `errors`.
   - §6.4: `pins_created`, `pins_updated`, `pins_skipped_unmatched`, `pins_with_errors`.
   - **Fix**: standardize to `pins_created`, `pins_updated`, `pins_skipped_unmatched`, `errors`. Drop `pins_marked_gone` (we never auto-mark; see §6.5).

5. **§3.10 visibility summary omits admins' edit-anywhere privilege, even though §7.3 includes it.**
   - **Fix**: add "Admins can edit/move/mark-gone any pin in their region" to §3.10.

6. **§5.9 has the same questions listed twice — once as "Open" and once as "Resolved" — with the resolutions inline.** Mildly confusing; the Open list should be removed once resolved.
   - **Fix**: delete the "Open questions" sub-list in §5.9; keep only the "Resolved" block.

7. **§3.3 "Resolution order" wording is ambiguous.** "Start with region default" then "Override with user's per-species window if exists" reads like two sequential steps, but it's actually `user_override ?? region_default`.
   - **Fix**: rewrite as: "1. Choose `effective_default = user_override(species, region) ?? region_default(species, region)`. 2. Apply current-year `RegionSeasonalShift` additively. 3. Result is the effective window."

---

## B. Failure modes the plan doesn't address

These are real production issues that will bite during Phase 1–3 if not planned for.

8. **GPS-on-photo-upload can be slow or fail.**
   - §4.7 step 3 says "request GPS before upload" but doesn't say what happens if iOS Safari takes 20 seconds, or denies permission, or returns nothing useful indoors.
   - **Plan fix**: explicit fallback ladder: (a) use cached fix from last 30s if available; (b) try `getCurrentPosition` with 10s timeout; (c) fall back to "no location" with a UI banner inviting manual placement on the map.

9. **Auth token expiration while offline.**
   - Supabase JWTs expire (default 1 hour). If JK is offline for hours, queued writes won't authenticate when replayed.
   - **Plan fix**: outbox writes carry no auth token; the sync worker re-authenticates on flush, refreshing the token first if expired. If refresh fails (long-offline session), a one-time re-login is required and the queue is preserved.

10. **Timezone semantics for "today."**
    - §5 talks about DOY but never says whose timezone determines DOY. If JK is in a different timezone, "today" is ambiguous.
    - **Plan fix**: every Region carries a `timezone` (IANA, e.g. `America/New_York`). DOY is computed in the region's timezone. Add `timezone` to §3.8 Region fields.

11. **Pin "user moved this" detection by coordinate equality is fragile.**
    - §6.5: "Update location only if user has not manually moved the pin since import. Detected by comparing the current pin location against the location stored in the previous `import_raw`."
    - Floating-point drift, identical re-imports, or sub-meter user nudges break this.
    - **Plan fix**: explicit `location_modified_by_user_at` timestamp on Pin (set the first time a user moves the location). Re-imports update location only if this is null.

12. **Service-worker cache versioning.**
    - §4.5 mentions caching but no invalidation strategy. Stale caches are the #1 PWA bug.
    - **Plan fix**: build-time version stamp injected into the service worker; on activate, purge old caches. Standard pattern but worth committing to in the plan.

13. **Email deliverability from Supabase's default sender.**
    - §4.4 says default sender, polish later. In practice this often lands in Promotions/spam — bad onboarding for the first invitee.
    - **Plan fix**: list "test invitation deliverability with at least one Gmail and one non-Gmail address" as a Phase 2 acceptance check, not a v2 polish.

14. **No migration tooling mentioned.**
    - Schema will evolve. Without a migration tool, every change becomes a manual SQL ritual.
    - **Plan fix**: pick `supabase/cli` migrations (or `dbmate`/Sqitch) at Phase 0. Each schema change = a numbered migration file in the repo. Dev applies first, prod applies on release.

15. **Concurrent imports / admin actions.**
    - Two admins running an import simultaneously could create duplicate `ImportRun` rows or conflict.
    - **Plan fix**: take an advisory lock per (region, source) at the start of an import. Real concern only when multi-admin lands; flag for v2.

---

## C. Architectural commitments to make now (prevents code duplication & eases debugging)

These are the "clean groundwork" calls. Most cost almost nothing now but pay enormous dividends later.

16. **Client-generated UUIDs for all entities, end to end.**
    - Reason: offline-first writes need stable IDs *before* the server sees them. Photos can reference observations that haven't synced yet, etc.
    - Without this: a remapping layer must translate "client temp ID" to "server real ID" everywhere. Significant pain, easy to get wrong.
    - **Commit**: every table has `id uuid primary key default gen_random_uuid()`. Client generates the UUID before insert. Server upserts; replay is naturally idempotent.

17. **Single write path: always go through an outbox.**
    - Reason: avoid having an "online write path" and an "offline write path" with different code. The Phase 1 / Phase 3 split reads as if offline is added later, which encourages divergent paths.
    - **Commit**: from Phase 1 day one, every mutation goes through `outbox.enqueue(write)`. In Phase 1, the outbox flushes immediately and synchronously. Phase 3 just adds queueing under offline. Same code path always. UI optimistically shows the write; reconciliation is uniform.

18. **Domain-typed service layer (`PinService`, `ObservationService`, ...) wrapping the Supabase SDK.**
    - Reason: components that import the Supabase client directly will duplicate query shapes, retry logic, and region-scope checks. A thin service module centralizes them.
    - **Commit**: `src/lib/services/*.ts`. Components use services; services use Supabase. No raw `supabase.from(...)` outside the service module.

19. **Shared types module for client + scripts.**
    - Reason: import scripts and client both build pin shapes. If they drift, imports break or insert malformed data.
    - **Commit**: `supabase gen types typescript` (or equivalent) emits a `database.types.ts` from the live schema. Both client and import scripts consume it. Single source of truth.

20. **Pure logic lives in Postgres functions, not duplicated client-side.**
    - Specifically:
      - `effective_window(pin_id, user_id, year)` → SQL function returning the resolved `(start_doy, end_doy)`.
      - `is_region_member(user_id, region_id)` → boolean, used in many RLS policies and elsewhere.
      - A `v_pin_effective` view that exposes computed status (with auto-degrade) and effective windows alongside the pin row.
    - Reason: the resolution math is in §3.3 and §5.3 — implementing it in TypeScript *and* SQL invites drift. Better to have one source.
    - **Commit**: Phase 0 stands up these functions; client queries the view, gets effective values for free.

21. **Photo storage paths should not include `region_id` or `pin_id`.**
    - §4.7 / §7.5: paths are `photos/<region>/<pin>/<photo-id>.jpg`.
    - Issue: if a photo's pin is later promoted to another region (v2) or moved, the storage path would need to change — hard.
    - **Commit**: flat path `photos/<photo-id>.jpg`. Access control via Storage policies that join photo → pin → region_membership.

22. **Climate zone as a structured value, not free text.**
    - §3.8 says "free text initially." Free text invites typos and prevents valid filtering.
    - **Commit**: `climate_zone` is `(system: enum 'usda' | 'koppen' | 'other', code: text)`. v1 only uses `usda`. Cheap to model now, expensive to retrofit when invitees in other regions show up.

23. **Region creation as a transactional function with template seeding.**
    - Reason: when a personal region is created (Phase 2), it needs the same SpeciesFruitingWindow rows as the shared region, the creator added as admin, default map center, etc. This is multi-table seeding that should not be done from the client in pieces.
    - **Commit**: `create_region(name, climate_zone, copy_windows_from regions.id)` Postgres function. Used by Phase 2 personal-region creation; reusable for any future region.

24. **Audit/events table for user actions.**
    - Reason: when something looks wrong ("why did this pin's species change?", "who marked this gone?"), there's no trail. `import_raw` audits imports but user actions are unaudited.
    - **Commit**: a slim `events(id, entity_type, entity_id, user_id, action, payload jsonb, at)` table, written by triggers on key tables (pins, observations) for `INSERT`/`UPDATE`/`DELETE`. ~50 lines of SQL; saves hours of debugging later.

25. **Seed-file schema versioning.**
    - `forageable_species.json` and `data/species/<region>.json` will evolve.
    - **Commit**: each file has a top-level `"schema_version": 1` and a parser that errors clearly on mismatch. Cheap insurance.

26. **A single `useActiveRegion()` accessor.**
    - Region scoping is enforced server-side by RLS, but client filtering UX depends on knowing the active region. Reading `localStorage.activeRegionId` from many places leads to scattered bugs (e.g., region switch not propagating).
    - **Commit**: a single Svelte store / accessor `activeRegion`. All components read from it; setters are gated. Service-layer methods take a region context implicitly (no raw region IDs in component code).

27. **"Effective" reads vs. raw reads everywhere.**
    - Most UI surfaces want the *effective* values (status with auto-degrade applied, effective fruiting window with overrides). Admin/debug surfaces want raw.
    - **Commit**: every entity has both a raw-row read and a "view"-style read (e.g. `v_pin_effective`). UI always reads the view; admin tools can read the underlying table.

---

## D. Topics to clarify before Phase 0 (small but unblocked work)

Each of these is a 5-minute decision; capturing them now prevents drift.

28. **Phase 1 auth UX with one user.** Does JK actually log in (yes, even if there's only one account)? Or does Phase 1 ship with a dev shortcut? Recommend: real login from day one, no dev shortcut.

29. **Local development workflow.** SvelteKit dev server pointing at `forager-dev` Supabase, with a `.env.local`. Document this in the README; it's the difference between an hour and a day of onboarding for any future contributor.

30. **Seed re-run semantics.** When a `data/species/ithaca.json` field changes and we re-seed, do we overwrite admin-edited windows or leave them? Recommend: upsert on `(species_id, region_id)` but only for fields that *aren't* admin-edited, OR have a `--force` flag that admins must use deliberately.

31. **Invitee with no membership / orphan-state UX.** What does Anna see if she somehow has an auth account but no region membership (e.g., admin removed her)? Recommend: a "you have no regions" screen with text inviting her to ask for a new invite — not a crash or an empty map.

32. **Test data fixtures for dev.** Phase 0 should produce a `scripts/seed-dev.ts` that creates a deterministic set of test pins, observations, and photos in `forager-dev`. Without this, every dev cycle does a fresh manual setup.

---

## E. Optional, lower-priority

33. **Stage filters in "what's now" views.** §5.4 only buckets by ripe; the stages enum supports `flowering`/`green`/`ripening`. A future user might want a "flowering now" view for, e.g., elderflower. Cheap to add to the stage-bucketing function as a parameter; flag if it's wanted.

34. **OSM tile fair-use plan.** Pre-caching tiles for a city-sized region runs ~50 MB. OSM's tile usage policy permits modest caching but not aggressive scraping. If we end up downloading the whole city's tile pyramid on first launch, that's borderline. Worth a short note in §4.5 acknowledging the limit.

35. **Phase 0 also needs an explicit branching strategy.** main = prod, with PRs from feature branches. Mention this; it's the simplest workable thing and saves a future "should we use git flow?" debate.

36. **Documentation as code: ADRs (architecture decision records) for the big choices.** Optional, but a `docs/adr/0001-supabase.md` style log keeps the *why* alongside the *what*. The PLAN.md is the design; ADRs are the rationale archives.

---

## Summary: top 8 things I'd fold into PLAN.md before Phase 0 begins

1. Fix the per-pin override / comments / `auto_verification` / `ImportRun` inconsistencies (§A).
2. Commit to **client-generated UUIDs** end-to-end (#16).
3. Commit to a **single write path through an outbox** from Phase 1 day one (#17).
4. Commit to a **service-layer wrapping Supabase** (#18) and **shared types module** (#19).
5. Commit to **Postgres functions/views for shared logic** (window resolution, membership checks, effective-pin view) (#20).
6. Add **timezone** to Region (#10) and a **location_modified_by_user_at** to Pin (#11).
7. Add **migration tooling** to Phase 0 (#14) and an **events/audit table** (#24).
8. Clarify **Phase 1 auth UX** and **invitee orphan-state UX** (#28, #31).

Everything else can wait or be addressed during the relevant phase.
