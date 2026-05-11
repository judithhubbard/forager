<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { base } from '$app/paths';
  import {
    getEffective,
    updateStatus,
    updateVisibility,
    remove as removePin,
    type PinEffective,
    type PinStatus
  } from '$lib/services/pinService';
  import {
    listByPin as listHazards,
    create as createHazard,
    remove as removeHazard,
    HAZARD_TYPES,
    HAZARD_LABELS,
    HAZARD_EMOJI,
    type Hazard,
    type HazardType
  } from '$lib/services/hazardService';
  import {
    listAll as listSpecies,
    clearCache as clearSpeciesCache,
    type Species
  } from '$lib/services/speciesService';
  import { bumpDataChange } from '$lib/stores/dataChange';
  import {
    listByPin,
    create as createObservation,
    remove as removeObservation,
    groupByYear,
    STAGES,
    type Observation,
    type ObservationWithUser,
    type Stage,
    type ObservationPrecision
  } from '$lib/services/observationService';
  import { profileLabel } from '$lib/services/profileService';
  import { profile } from '$lib/stores/profile';
  import { session } from '$lib/stores/auth';
  import {
    listForPin as listCommunityFlags,
    add as addCommunityFlag,
    remove as removeCommunityFlag,
    FLAG_LABELS,
    type FlagType,
    type FlagCounts
  } from '$lib/services/communityFlagsService';
  import { activeRegion } from '$lib/stores/activeRegion';
  import { settings, type PhotoLicense } from '$lib/stores/settings';
  import {
    ACCESS_STATUSES,
    ACCESS_LABELS,
    ACCESS_EMOJI,
    setStatus as setAccessStatus,
    type AccessStatus
  } from '$lib/services/accessService';
  import {
    isWatchingPin,
    watchPin,
    unwatch as unwatchRow,
    type WatchlistRow
  } from '$lib/services/watchlistService';
  import {
    listByPin as listPhotos,
    signUrls,
    upload as uploadPhoto,
    remove as removePhoto,
    capturePhotoLocation,
    type Photo
  } from '$lib/services/photoService';
  import { supabase } from '$lib/supabase';

  type WindowRow = {
    stage: string;
    start_doy: number;
    end_doy: number;
    peak_doy?: number | null;
    is_confirmed?: boolean | null;
    confidence?: string | null;
    notes?: string | null;
  };

  /** Earthy palette, must match the /windows page so this mini-timeline
   *  reads consistently. Multi-stage species (elderberry: ripe +
   *  flower_harvest; basswood: leaf + flower_harvest; cattail: shoot +
   *  flower_harvest + root_dig; mushrooms: mushroom_flush; herbs/roots/
   *  sap species: leaf / root_dig / sap_run) all need to render here. */
  const STAGE_COLORS: Record<string, string> = {
    flowering: '#9b7fb2',
    green: '#6b9442',
    ripening: '#b87a2f',
    ripe: '#8e2828',
    past: '#7a7368',
    flower_harvest: '#c252a8',
    leaf: '#4a8a3a',
    shoot: '#7ab26a',
    root_dig: '#8b6b3a',
    sap_run: '#c4a55c',
    mushroom_flush: '#7d5c8a',
    bark_strip: '#6b4f3a'
  };
  const STAGE_ORDER = [
    'sap_run', 'shoot', 'leaf', 'flower_harvest',
    'flowering', 'green', 'ripening', 'ripe', 'past',
    'mushroom_flush', 'root_dig', 'bark_strip'
  ];

  export let pinId: string;

  const dispatch = createEventDispatcher<{
    statusChanged: void;
    requestMove: { pinId: string };
    deleted: { pinId: string };
  }>();

  let pin: PinEffective | null = null;
  // Migration 24 added climate_zone_code to v_pin_effective. Generated
  // types haven't been regenerated yet, so cast through unknown to
  // surface the value reactively without a runtime branch.
  $: zoneCode = (pin as unknown as { climate_zone_code: string | null } | null)?.climate_zone_code ?? null;

  // Community flags (Phase 1 community curation). Free + paid users
  // can flag a public pin as gone / wrong-species / inaccessible /
  // low-quality. Aggregated counts surface here as informational
  // signals; the visibility-affecting score is server-maintained.
  let flagCounts: FlagCounts | null = null;
  let flagBusy: FlagType | null = null;
  let flagError = '';
  async function refreshFlags() {
    if (!pinId) { flagCounts = null; return; }
    try {
      flagCounts = await listCommunityFlags(pinId);
    } catch (err) {
      console.error('[PinDetail] flag load failed', err);
    }
  }
  async function toggleFlag(t: FlagType) {
    if (!pinId || !$session || flagBusy) return;
    flagBusy = t;
    flagError = '';
    try {
      const has = flagCounts?.mine.has(t);
      if (has) await removeCommunityFlag(pinId, t);
      else await addCommunityFlag(pinId, t);
      await refreshFlags();
    } catch (err) {
      flagError = err instanceof Error ? err.message : 'Could not save flag.';
    } finally {
      flagBusy = null;
    }
  }
  /** Order to render flag chips in. Pulled into a const so the
   *  template stays a one-liner. */
  const FLAG_ORDER: FlagType[] = ['gone', 'wrong_species', 'inaccessible', 'low_quality'];
  // Refresh flag counts when the user navigates between pins.
  $: if (pinId) void refreshFlags();

  let species: Species | null = null;
  let observations: ObservationWithUser[] = [];
  let allSpecies: Species[] = [];
  let windows: WindowRow[] = [];

  // Per-source harvest policy (migration 29). When the source city has
  // told us how they want foragers to treat their trees, we display it
  // prominently. Loaded lazily after the main pin paint so the critical
  // path isn't blocked.
  type HarvestPolicy = 'not_addressed' | 'personal_use_ok' | 'encouraged' | 'discouraged' | 'prohibited';
  interface HarvestPolicyInfo {
    policy: HarvestPolicy;
    note: string | null;
    sourceName: string;
  }
  let harvestPolicyInfo: HarvestPolicyInfo | null = null;
  /** True iff this species has fruiting windows in some OTHER region —
   *  used to render a "no regional harvest data here yet" hint when
   *  the local timeline is empty. Lets users see that they're missing
   *  curated data, not that the species has none anywhere. */
  let speciesHasWindowsElsewhere = false;

  type OtherObs = {
    stage: string | null;
    observed_at: string | null;
    pin_id: string | null;
  };
  let otherSpeciesObs: OtherObs[] = [];
  let photos: Photo[] = [];
  let thumbUrls = new Map<string, string>();
  let fullUrls = new Map<string, string>();
  let loading = true;
  let errorMessage = '';

  let fileInput: HTMLInputElement;
  let uploading = false;
  let uploadError = '';

  let lightboxPhoto: Photo | null = null;

  let hazards: Hazard[] = [];
  let showHazardForm = false;
  let hazardType: HazardType = 'poison_ivy';
  let hazardNotes = '';
  let hazardSubmitting = false;

  let pendingStatus: PinStatus | null = null;
  let statusSaving = false;
  let deletingPin = false;
  /** Eligibility for destructive ops (delete, move, status change).
   *  Owner can always edit their own pin. Region admins can edit
   *  any non-public pin in their region (public pins are admin-only
   *  globally — keeps community-curated data tamper-resistant).
   *  Global admins can edit anything. */
  $: canEditPin = !!pin && (
    pin.created_by === $profile?.id
    || (pin.visibility !== 'public' && $activeRegion?.role === 'admin')
    || $profile?.is_global_admin === true
  );

  async function handleDeletePin() {
    if (!pin || deletingPin) return;
    if (!confirm('Delete this pin? This removes its observations, photos, and hazards too. This cannot be undone.')) return;
    deletingPin = true;
    try {
      await removePin(pinId);
      // Parent closes the panel + refetches the map (the
      // bumpDataChange inside pinService.remove triggers the refetch).
      dispatch('deleted', { pinId });
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Could not delete pin.';
    } finally {
      deletingPin = false;
    }
  }

  let accessSaving = false;
  let accessError = '';

  let watching: WatchlistRow | null = null;
  let watchBusy = false;

  async function refreshWatching(id: string) {
    if (!$session) {
      watching = null;
      return;
    }
    try {
      watching = await isWatchingPin(id);
    } catch {
      watching = null;
    }
  }
  async function toggleWatchPin() {
    if (!pin || !$session) return;
    watchBusy = true;
    try {
      if (watching) {
        await unwatchRow(watching.id);
        watching = null;
      } else {
        const id = await watchPin(pin.id!);
        watching = {
          id,
          user_id: $session.user?.id ?? '',
          species_id: null,
          pin_id: pin.id!,
          notify_email: true,
          notify_in_app: true,
          created_at: new Date().toISOString()
        };
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Could not update watch.';
    } finally {
      watchBusy = false;
    }
  }
  async function onAccessChange(e: Event) {
    if (!pin) return;
    const v = (e.currentTarget as HTMLSelectElement).value;
    const next = v === '' ? null : (v as AccessStatus);
    accessSaving = true;
    accessError = '';
    try {
      await setAccessStatus(pin.id!, next);
      pin = { ...pin, access_status: next };
    } catch (err) {
      accessError = err instanceof Error ? err.message : 'Could not save access status.';
    } finally {
      accessSaving = false;
    }
  }
  // needs_verification is set automatically by the 4-year auto-degrade rule;
  // not a manual choice. active = exists; gone = removed; dormant = unproductive.
  const STATUSES: PinStatus[] = ['active', 'gone', 'inaccessible', 'not_good'];

  function statusLabel(s: PinStatus | null | undefined): string {
    switch (s) {
      case 'gone':              return 'Gone';
      case 'inaccessible':      return 'Inaccessible';
      case 'not_good':          return 'Not good';
      case 'needs_verification': return 'Needs verification';
      case 'dormant':           return 'Dormant';
      case 'active':            return 'Active';
      default:                  return 'Active';
    }
  }

  let formOpen = false;
  let formStage: Stage = 'ripe';
  let formQuality: number | null = null;
  let formNotes = '';
  /** Observation visibility — defaults to the pin's visibility (no
   *  point posting a "shared" observation on a private pin) but the
   *  user can flip per-observation. Reset every time the form opens
   *  so it tracks the current pin. */
  let formVisibility: 'shared' | 'private' = 'shared';
  /** Reset formVisibility only on the false→true transition of
   *  formOpen. The earlier reactive fired whenever `pin` got a new
   *  reference (e.g. after refetch on save) and silently overwrote
   *  whatever the user had picked mid-edit. */
  let prevFormOpen = false;
  $: {
    if (formOpen && !prevFormOpen && pin) {
      formVisibility = (pin.visibility as 'shared' | 'private') ?? 'shared';
    }
    prevFormOpen = formOpen;
  }
  // Year/month/day form fields — three selects avoids the native date
  // input's flaky keyboard handling on Chrome/Mac (the dd kept resetting).
  const NOW = new Date();
  let formYear: number = NOW.getFullYear();
  let formMonth: number = NOW.getMonth() + 1; // 1-12
  let formDay: number = NOW.getDate(); // 1-31
  let formSubmitting = false;

  // Cap day choices at the days-in-month to prevent invalid combos like Feb 30.
  $: maxDay = new Date(formYear, formMonth, 0).getDate();
  $: dayOptions = Array.from({ length: maxDay }, (_, i) => i + 1);
  // If the day exceeds the new max (e.g. switching from Jan to Feb on the 31st),
  // clamp it down.
  $: if (formDay > maxDay) formDay = maxDay;

  // Short shareable id (first 8 chars of UUID) for talking about the pin.
  $: shortId = pinId ? pinId.slice(0, 8) : '';

  // Title and whether to also show the species common name beneath
  // (skipped if the title already IS the common name).
  // Species name is always the title. display_name is no longer set
  // by the drop-pin form (notes go in the notes field), but legacy
  // pins that have one display it as a small subtitle.
  $: title = species?.common_name ?? pin?.display_name ?? 'Unnamed';
  $: showCommonNameBelow = false;

  // Try to extract a human-readable accession / external id from the raw
  // import payload, regardless of which source produced it.
  function extractAccession(raw: unknown): string | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as { [key: string]: unknown };
    const v = obj.accession ?? obj.Accession ?? obj.ACCESSION;
    return typeof v === 'string' ? v : null;
  }
  $: accession = pin ? extractAccession(pin.import_raw) : null;

  function todayIso(): string {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }

  $: byYear = groupByYear(observations);
  $: years = [...byYear.keys()].sort((a, b) => b - a);

  /** Group photos by their observation_id so each observation can render
   *  its own thumbnail strip; "loose" photos (no observation) keep their
   *  own grid at the bottom. */
  $: photosByObs = (() => {
    const m = new Map<string, Photo[]>();
    for (const p of photos) {
      if (!p.observation_id) continue;
      const arr = m.get(p.observation_id) ?? [];
      arr.push(p);
      m.set(p.observation_id, arr);
    }
    return m;
  })();
  $: loosePhotos = photos.filter((p) => !p.observation_id);

  /** Map db license code → human-readable short label for the lightbox
   *  footer. Keep in sync with the license enum in
   *  src/lib/stores/settings.ts and the SQL CHECK constraint. */
  const LICENSE_SHORT: Record<string, string> = {
    'CC-BY-SA-4.0':        'CC BY-SA 4.0',
    'CC-BY-4.0':           'CC BY 4.0',
    'CC-BY-NC-SA-4.0':     'CC BY-NC-SA 4.0',
    'CC0':                 'CC0',
    'all-rights-reserved': 'all rights reserved'
  };
  function photoCreditLine(p: Photo): string {
    const credit = p.photographer_credit?.trim();
    const author = credit
      ? credit
      : p.uploader_username
        ? '@' + p.uploader_username
        : 'unknown';
    const license = LICENSE_SHORT[p.license] ?? p.license;
    return `Photo by ${author} · ${license}`;
  }

  // Reload whenever pinId changes (for use as a reusable panel component).
  let lastLoadedId: string | null = null;
  $: if (pinId && pinId !== lastLoadedId) {
    lastLoadedId = pinId;
    load();
    refreshWatching(pinId);
  }

  async function loadHarvestPolicy(sourceId: string): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('import_sources')
        .select('name, harvest_policy, harvest_policy_note' as never)
        .eq('id', sourceId)
        .single();
      if (error || !data) return;
      const row = data as unknown as {
        name: string;
        harvest_policy: HarvestPolicy | null;
        harvest_policy_note: string | null;
      };
      // Only surface when the city actively set a policy. Default
      // 'not_addressed' means we render no banner — silence rather
      // than a wishy-washy "no policy" hint.
      if (row.harvest_policy && row.harvest_policy !== 'not_addressed') {
        harvestPolicyInfo = {
          policy: row.harvest_policy,
          note: row.harvest_policy_note,
          sourceName: row.name
        };
      }
    } catch (err) {
      console.warn('[PinDetail] harvest_policy load failed:', err);
    }
  }

  async function load() {
    loading = true;
    errorMessage = '';
    pin = null;
    species = null;
    observations = [];
    hazards = [];
    photos = [];
    windows = [];
    otherSpeciesObs = [];
    speciesHasWindowsElsewhere = false;
    thumbUrls = new Map();
    fullUrls = new Map();
    harvestPolicyInfo = null;
    const requestedId = pinId;
    try {
      // First-paint critical path: pin metadata, species lookup, this
      // pin's own observations, hazards. As soon as these resolve the
      // panel can render. On mobile cellular, each Supabase round-trip
      // is ~1-2s, so chaining a second-batch + photos sequentially used
      // to stretch first-paint to ~10s.
      const [pinResult, speciesResult, obsResult, hazResult] = await Promise.all([
        getEffective(pinId),
        listSpecies(),
        listByPin(pinId),
        listHazards(pinId)
      ]);
      // If the user clicked a different pin while we were loading, drop
      // these results — a later load() call owns the panel now.
      if (requestedId !== pinId) return;
      pin = pinResult;
      allSpecies = speciesResult;
      observations = obsResult;
      hazards = hazResult;
      if (pin?.species_id) {
        species = allSpecies.find((s) => s.id === pin?.species_id) ?? null;
      }
      loading = false;

      // Background fills: timeline context (species windows + other-pin
      // observations), photos, harvest policy banner. These update
      // reactive state as they arrive; the panel re-renders in place.
      // No await on the outer load() — let the panel be interactive
      // immediately.
      loadTimelineContext(requestedId).catch((err) => {
        console.warn('[PinDetail] timeline-context load failed:', err);
      });
      loadPhotos();
      if (pin?.import_source) {
        loadHarvestPolicy(pin.import_source);
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Failed to load pin.';
      loading = false;
    }
  }

  async function loadTimelineContext(requestedId: string) {
    if (!pin?.species_id) return;
    // Phase 1A cutover (task #36) made species_fruiting_windows
    // climate-zone-keyed. The legacy region_id filter returned empty
    // for every pin outside Ithaca; switch to a climate_zones join.
    // pin's zoneCode comes from v_pin_effective.climate_zone_code.
    const zoneCode = (pin as unknown as { climate_zone_code: string | null }).climate_zone_code;
    const winQuery = supabase
      .from('species_fruiting_windows')
      .select('stage, start_doy, end_doy, peak_doy, is_confirmed, confidence, notes, climate_zones!inner(code)' as never)
      .eq('species_id', pin.species_id);
    const [winRes, otherObsRes] = await Promise.all([
      zoneCode
        ? winQuery.eq('climate_zones.code' as never, zoneCode)
        : Promise.resolve({ data: [] as WindowRow[], error: null }),
      pin.region_id
        ? supabase
            .from('v_observation_with_pin')
            .select('stage, observed_at, pin_id')
            .eq('species_id', pin.species_id)
            .eq('pin_region_id', pin.region_id)
            .neq('pin_id', pin.id)
            .order('observed_at', { ascending: false })
            .limit(500)
        : Promise.resolve({ data: [] as OtherObs[], error: null })
    ]);
    if (requestedId !== pinId) return;
    windows = (winRes.data ?? []) as WindowRow[];
    otherSpeciesObs = (otherObsRes.data ?? []) as OtherObs[];
    if (windows.length === 0) {
      const { data } = await supabase
        .from('species_fruiting_windows')
        .select('id')
        .eq('species_id', pin.species_id)
        .limit(1);
      if (requestedId !== pinId) return;
      speciesHasWindowsElsewhere = (data?.length ?? 0) > 0;
    }
  }

  async function addHazard() {
    if (!pin) return;
    hazardSubmitting = true;
    try {
      await createHazard({ pinId, hazardType, notes: hazardNotes.trim() || null });
      hazards = await listHazards(pinId);
      hazardNotes = '';
      showHazardForm = false;
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Could not add hazard.';
    } finally {
      hazardSubmitting = false;
    }
  }

  async function deleteHazard(h: Hazard) {
    try {
      await removeHazard(h.id);
      hazards = hazards.filter((x) => x.id !== h.id);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Could not remove hazard.';
    }
  }

  async function saveStatus() {
    if (!pendingStatus || !pin) return;
    statusSaving = true;
    try {
      await updateStatus(pinId, pendingStatus);
      pin = await getEffective(pinId);
      pendingStatus = null;
      dispatch('statusChanged');
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Could not update status.';
    } finally {
      statusSaving = false;
    }
  }

  /** Triggered when the user picks a value from the status select.
   *  Saves immediately rather than requiring a follow-up 'Set X'
   *  button click — the dropdown's only choices are valid statuses
   *  to apply, so the pick IS the intent. */
  async function onStatusSelect(e: Event) {
    const v = (e.currentTarget as HTMLSelectElement).value;
    if (!v) return;  // user re-selected the placeholder; do nothing
    pendingStatus = v as PinStatus;
    await saveStatus();
  }

  async function loadPhotos() {
    const requestedId = pinId;
    const fetched = await listPhotos(pinId);
    if (requestedId !== pinId) return;
    photos = fetched;
    if (fetched.length === 0) {
      thumbUrls = new Map();
      fullUrls = new Map();
      return;
    }
    // Sign thumbnail + full-size paths in one round-trip so opening
    // the lightbox is instant. Splitting the lightbox-open into a
    // second signUrls call cost ~500ms-2s of cellular RTT for no
    // good reason — the cost of signing extra URLs is negligible.
    const thumbPaths = fetched.map((p) => p.thumbnail_path);
    const fullPaths = fetched.map((p) => p.storage_path);
    const allSigned = await signUrls([...thumbPaths, ...fullPaths], 3600);
    if (requestedId !== pinId) return;
    const newThumb = new Map<string, string>();
    const newFull = new Map<string, string>();
    for (const p of fetched) {
      const t = allSigned.get(p.thumbnail_path);
      const f = allSigned.get(p.storage_path);
      if (t) newThumb.set(p.thumbnail_path, t);
      if (f) newFull.set(p.storage_path, f);
    }
    thumbUrls = newThumb;
    fullUrls = newFull;
  }

  /** Holds the observation_id that the next file-input change should attach
   *  the uploaded photo to. Set right before triggering fileInput.click(). */
  let pendingUploadObsId: string | null = null;

  /** Per-upload license override. Defaults to the user's preference but
   *  can be flipped per-photo without changing the default. Reset to
   *  the default whenever the panel opens a *different* pin (gated
   *  by lastLoadedId so a same-pin refresh — e.g. after observation
   *  save — preserves the user's per-session license choice). */
  let uploadLicense: PhotoLicense = $settings.defaultPhotoLicense;
  /** License-help panel below the upload row. The native HTML title=
   *  attribute doesn't work on touch devices — users tapped the "?"
   *  and saw nothing. Replaced with an explicit toggle that paints
   *  the explanations inline. */
  let showLicenseHelp = false;
  let lastLicenseResetForId: string | null = null;
  $: if (pin && pin.id !== lastLicenseResetForId) {
    uploadLicense = $settings.defaultPhotoLicense;
    lastLicenseResetForId = pin.id;
  }

  const PHOTO_LICENSE_OPTIONS: { value: PhotoLicense; label: string }[] = [
    { value: 'CC-BY-SA-4.0',        label: 'CC BY-SA 4.0' },
    { value: 'CC-BY-4.0',           label: 'CC BY 4.0' },
    { value: 'CC-BY-NC-SA-4.0',     label: 'CC BY-NC-SA 4.0' },
    { value: 'CC0',                 label: 'CC0 (public domain)' },
    { value: 'all-rights-reserved', label: 'All rights reserved' }
  ];

  async function handleFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !pin || pin.lng == null || pin.lat == null) return;
    uploading = true;
    uploadError = '';
    const obsId = pendingUploadObsId;
    pendingUploadObsId = null;
    try {
      const loc = await capturePhotoLocation({
        lng: pin.lng,
        lat: pin.lat,
        accuracyM: pin.location_accuracy_m
      });
      await uploadPhoto({
        pinId,
        observationId: obsId,
        file,
        capturedLat: loc.lat,
        capturedLng: loc.lng,
        capturedAccuracyM: loc.accuracyM,
        license: uploadLicense
      });
      await loadPhotos();
      input.value = '';
    } catch (err) {
      uploadError = err instanceof Error ? err.message : 'Upload failed.';
    } finally {
      uploading = false;
    }
  }

  async function openLightbox(p: Photo) {
    lightboxPhoto = p;
    if (!fullUrls.has(p.storage_path)) {
      const map = await signUrls([p.storage_path], 3600);
      fullUrls = new Map([...fullUrls, ...map]);
    }
  }
  function closeLightbox() {
    lightboxPhoto = null;
  }

  let deletingPhotoId: string | null = null;
  async function deleteLightboxPhoto() {
    if (!lightboxPhoto) return;
    if (!confirm('Delete this photo? This cannot be undone.')) return;
    deletingPhotoId = lightboxPhoto.id;
    try {
      await removePhoto(lightboxPhoto);
      photos = photos.filter((p) => p.id !== lightboxPhoto!.id);
      lightboxPhoto = null;
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Could not delete photo.';
    } finally {
      deletingPhotoId = null;
    }
  }

  async function submitObservation() {
    formSubmitting = true;
    errorMessage = '';
    try {
      const observedAt = new Date(formYear, formMonth - 1, formDay, 12, 0, 0);
      await createObservation({
        pinId,
        stage: formStage,
        qualityRating: formQuality,
        qualityNotes: formNotes.trim() || null,
        observedAt,
        observedPrecision: 'day',
        visibility: formVisibility
      });
      formOpen = false;
      formNotes = '';
      formQuality = null;
      formYear = NOW.getFullYear();
      formMonth = NOW.getMonth() + 1;
      formDay = NOW.getDate();
      // Parallelize the post-save refresh: the obs list and pin row
      // are independent reads, so let them race instead of chaining
      // ~500ms-2s of cellular latency back to back.
      const [refreshedObs, refreshedPin] = await Promise.all([
        listByPin(pinId),
        getEffective(pinId)
      ]);
      observations = refreshedObs;
      pin = refreshedPin;
      dispatch('statusChanged');
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Save failed.';
    } finally {
      formSubmitting = false;
    }
  }

  /** Owner-only: flip a pin between shared and private. Called from
   *  the visibility chip in the title row. RLS will reject anyone who
   *  isn't the creator, but we already gate the click in the markup. */
  async function togglePinVisibility() {
    if (!pin) return;
    const next: 'shared' | 'private' = pin.visibility === 'private' ? 'shared' : 'private';
    try {
      await updateVisibility(pinId, next);
      pin = { ...pin, visibility: next };
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Could not change visibility.';
    }
  }

  async function deleteObservation(o: Observation) {
    if (!confirm('Delete this observation?')) return;
    try {
      await removeObservation(o.id, o.pin_id);
      const [refreshedObs, refreshedPin] = await Promise.all([
        listByPin(pinId),
        getEffective(pinId)
      ]);
      observations = refreshedObs;
      pin = refreshedPin;
      dispatch('statusChanged');
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Delete failed.';
    }
  }

  function fmtDate(s: string): string {
    return new Date(s).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function fmtObservation(o: Observation): string {
    const d = new Date(o.observed_at);
    const precision = (o as Observation & { observed_precision?: ObservationPrecision })
      .observed_precision ?? 'day';
    if (precision === 'year') return d.toLocaleDateString(undefined, { year: 'numeric' });
    if (precision === 'month') {
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
    }
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  // For the year/month form fields.
  const YEAR_OPTIONS = (() => {
    const ys: number[] = [];
    const cy = new Date().getFullYear();
    for (let y = cy; y >= cy - 30; y--) ys.push(y);
    return ys;
  })();
  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  function stageColor(s: Stage): string {
    switch (s) {
      case 'flowering': return '#d691b3';
      case 'green':     return '#789a4a';
      case 'ripening':  return '#c79a3c';
      case 'ripe':      return '#d57100';
      case 'past':      return '#7a6a5a';
      case 'bare':      return '#a0a0a0';
      default:          return '#9090a0';
    }
  }

  /** Compute the trimmed timeline range for the mini-timeline: hugs the
   *  earliest stage start to latest stage end, padded by 14 days. */
  function miniTodayDoy(): number {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    return Math.floor((now.getTime() - start.getTime()) / 86_400_000);
  }
  $: todayDoy = miniTodayDoy();
  /** Trim hugs the species' fruiting windows but always extends to
   *  cover today, so the red "now" line stays visible — important
   *  for off-season species (e.g., a persimmon viewed in May). */
  $: miniRange = (() => {
    if (windows.length === 0) return { start: 1, end: 365, span: 364 };
    let lo = 365, hi = 1;
    for (const w of windows) {
      if (w.start_doy < lo) lo = w.start_doy;
      if (w.end_doy > hi) hi = w.end_doy;
    }
    lo = Math.min(lo, todayDoy);
    hi = Math.max(hi, todayDoy);
    const start = Math.max(1, lo - 14);
    const end = Math.min(365, hi + 14);
    return { start, end, span: Math.max(1, end - start) };
  })();
  function miniPct(doy: number): number {
    return ((doy - miniRange.start) / miniRange.span) * 100;
  }
  $: todayInRange = todayDoy >= miniRange.start && todayDoy <= miniRange.end;

  const MINI_MONTH_TICKS = [
    { label: 'J', doy: 1 },   { label: 'F', doy: 32 },
    { label: 'M', doy: 60 },  { label: 'A', doy: 91 },
    { label: 'M', doy: 121 }, { label: 'J', doy: 152 },
    { label: 'J', doy: 182 }, { label: 'A', doy: 213 },
    { label: 'S', doy: 244 }, { label: 'O', doy: 274 },
    { label: 'N', doy: 305 }, { label: 'D', doy: 335 }
  ];
  $: miniMonthTicks = MINI_MONTH_TICKS.filter(
    (t) => t.doy >= miniRange.start && t.doy <= miniRange.end
  );

  /** Sort windows in canonical stage order so flowering renders first
   *  and past last (matches the /windows page). */
  $: sortedWindows = [...windows].sort(
    (a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage)
  );

  /** Convert any ISO date string into 1–366 DOY in local time. NaN
   *  for unparseable dates so callers can drop them. */
  function isoToDoy(iso: string): number {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return NaN;
    const start = new Date(d.getFullYear(), 0, 0);
    return Math.floor((d.getTime() - start.getTime()) / 86_400_000);
  }

  /** Observations made on THIS pin → bold prominent ticks on the
   *  mini-timeline. Excludes 'bare' / 'unknown' which don't map to a
   *  stage color. */
  $: thisPinTicks = (() => {
    const out: { stage: string; doy: number }[] = [];
    for (const o of observations) {
      if (!o.stage || !o.observed_at) continue;
      if (o.stage === 'bare' || o.stage === 'unknown') continue;
      const doy = isoToDoy(o.observed_at);
      if (!Number.isFinite(doy)) continue;
      if (doy < miniRange.start || doy > miniRange.end) continue;
      out.push({ stage: o.stage, doy });
    }
    return out;
  })();

  /** Observations on OTHER pins of the same species → faded background
   *  ticks for context. */
  $: otherPinTicks = (() => {
    const out: { stage: string; doy: number }[] = [];
    for (const o of otherSpeciesObs) {
      if (!o.stage || !o.observed_at) continue;
      if (o.stage === 'bare' || o.stage === 'unknown') continue;
      const doy = isoToDoy(o.observed_at);
      if (!Number.isFinite(doy)) continue;
      if (doy < miniRange.start || doy > miniRange.end) continue;
      out.push({ stage: o.stage, doy });
    }
    return out;
  })();
</script>

<div class="content">
  {#if loading}
    <p class="hint">Loading…</p>
  {:else if !pin}
    <p class="error">Pin not found.</p>
  {:else}
    <section class="summary">
      <div class="title-row">
        <h2>{title}</h2>
        <span class="status-chip status-{pin.effective_status ?? 'active'}">
          {statusLabel(pin.effective_status)}
          {#if pin.is_edible_now}<span class="ripe-dot" title="In ripe window">🍒</span>{/if}
        </span>
        {#if pin.visibility === 'public'}
          <span class="vis-chip vis-public" title="Public — visible to anyone, including signed-out viewers.">🌐 public</span>
        {:else if pin.visibility === 'private' && pin.created_by === $profile?.id}
          <button
            type="button"
            class="vis-chip vis-private"
            title="Only you can see this pin. Click to share with the group."
            on:click={togglePinVisibility}
          >🔒 private</button>
        {:else if pin.visibility === 'private'}
          <span class="vis-chip vis-private" title="Private — only the owner can see this.">🔒 private</span>
        {:else if pin.created_by === $profile?.id}
          <button
            type="button"
            class="vis-chip vis-shared"
            title="Shared with the group. Click to make private."
            on:click={togglePinVisibility}
          >shared</button>
        {/if}
      </div>
      {#if harvestPolicyInfo}
        <!-- City-set harvest policy banner. Only renders when the
             source has actively set a non-default policy via the
             Phase 3 outreach process. Color + icon convey the
             expectation at a glance; the optional note adds context. -->
        <div class="harvest-policy harvest-policy-{harvestPolicyInfo.policy}">
          <div class="hp-head">
            <span class="hp-icon" aria-hidden="true">
              {#if harvestPolicyInfo.policy === 'encouraged'}✓
              {:else if harvestPolicyInfo.policy === 'personal_use_ok'}◐
              {:else if harvestPolicyInfo.policy === 'discouraged'}⚠
              {:else if harvestPolicyInfo.policy === 'prohibited'}⛔
              {/if}
            </span>
            <span class="hp-label">
              {#if harvestPolicyInfo.policy === 'encouraged'}Foraging encouraged by {harvestPolicyInfo.sourceName}
              {:else if harvestPolicyInfo.policy === 'personal_use_ok'}Personal-use harvest permitted by {harvestPolicyInfo.sourceName}
              {:else if harvestPolicyInfo.policy === 'discouraged'}{harvestPolicyInfo.sourceName} asks foragers not to harvest these trees
              {:else if harvestPolicyInfo.policy === 'prohibited'}Harvest prohibited at this source
              {/if}
            </span>
          </div>
          {#if harvestPolicyInfo.note}
            <p class="hp-note">{harvestPolicyInfo.note}</p>
          {/if}
        </div>
      {/if}
      {#if species}
        <p class="sub">
          <em>{species.scientific_name}</em>
          {#if showCommonNameBelow}<span class="muted"> · {species.common_name}</span>{/if}
        </p>
        <p class="loc-row">
          <span class="loc">
            {pin.lat?.toFixed(5)}, {pin.lng?.toFixed(5)}
          </span>
          {#if pin.location_accuracy_m}
            <span class="muted">±{pin.location_accuracy_m}m</span>
          {/if}
        </p>
      {/if}

      {#if $session}
        <div class="watch-row">
          <button
            class="watch-btn"
            class:active={!!watching}
            on:click={toggleWatchPin}
            disabled={watchBusy}
            title={watching ? 'Stop watching this pin' : 'Get notified when this pin is ripe'}
          >
            {watching ? '★ Watching' : '☆ Watch'}
          </button>
          {#if canEditPin}
            <!-- Status select reads as the current state ("Active ▾")
                 instead of a placeholder; selecting a different option
                 commits the change. The current value is excluded from
                 the option list so the user only sees alternatives. -->
            <select
              class="status-select"
              value={pendingStatus ?? ''}
              on:change={onStatusSelect}
              disabled={statusSaving}
              title="Pin status — click to change"
            >
              <option value="">{statusSaving ? 'Saving…' : statusLabel(pin.status)}</option>
              {#each STATUSES as s}
                {#if s !== pin.status}<option value={s}>{statusLabel(s)}</option>{/if}
              {/each}
            </select>
          {/if}
          {#if species?.is_forageable !== false}
            <a class="watch-btn link-btn" href={base + '/timeline'}>Year history →</a>
          {/if}
          {#if canEditPin}
            <button
              class="watch-btn"
              on:click={() => dispatch('requestMove', { pinId })}
              title="Click on the map to set a new location"
            >Move pin</button>
            <button
              class="watch-btn delete-btn"
              on:click={handleDeletePin}
              disabled={deletingPin}
              title="Delete this pin (cascades to its observations + photos + hazards)"
            >{deletingPin ? 'Deleting…' : '🗑 Delete'}</button>
          {/if}
        </div>
      {:else if species?.is_forageable !== false}
        <div class="watch-row">
          <a class="watch-btn link-btn" href={base + '/timeline'}>Year history →</a>
        </div>
      {/if}
      {#if windows.length === 0 && speciesHasWindowsElsewhere}
        <p class="no-regional-data muted">
          No regional harvest data for this area yet — windows shown on
          <a href={base + '/timeline'}>Year history</a> are from other regions and may not apply here.
        </p>
      {/if}
      {#if windows.length > 0}
        <div class="mini-timeline" title="Harvest window for this species. Edit on the Harvest windows page.">
          <div class="mini-months">
            {#each miniMonthTicks as t}
              <span class="mini-month" style={`left: ${miniPct(t.doy)}%`}>{t.label}</span>
            {/each}
          </div>
          <div class="mini-track">
            {#each sortedWindows as w}
              <div
                class="mini-bar"
                class:mini-bar-confirmed={w.is_confirmed}
                style={`left: ${miniPct(w.start_doy)}%; width: ${miniPct(w.end_doy) - miniPct(w.start_doy)}%; background: ${STAGE_COLORS[w.stage] ?? '#888'};`}
                title={`${w.stage}: DOY ${w.start_doy}–${w.end_doy}${w.is_confirmed ? ' · confirmed' : ''}${w.confidence ? ` · ${w.confidence}` : ''}`}
              >{#if w.is_confirmed}<span class="mini-confirmed-mark" title="Confirmed harvest window">✓</span>{/if}</div>
            {/each}
            <!-- Faded ticks for observations on OTHER pins of the same
                 species — gives context without competing visually. -->
            {#each otherPinTicks as t}
              <span
                class="mini-other"
                style={`left: ${miniPct(t.doy)}%; background: ${STAGE_COLORS[t.stage] ?? '#888'};`}
                title="Observation on another pin: {t.stage}"
              ></span>
            {/each}
            <!-- Bold ticks for THIS pin's own observations — most prominent. -->
            {#each thisPinTicks as t}
              <span
                class="mini-tick"
                style={`left: ${miniPct(t.doy)}%; background: ${STAGE_COLORS[t.stage] ?? '#888'};`}
                title="This pin: {t.stage}"
              ></span>
            {/each}
            {#if todayInRange}
              <div class="mini-today" style={`left: ${miniPct(todayDoy)}%`}></div>
            {/if}
          </div>
        </div>
      {/if}
      <div class="access-row">
        <span class="access-label">Access:</span>
        {#if pin.created_by === $profile?.id || $activeRegion?.role === 'admin'}
          <select
            value={pin.access_status ?? ''}
            on:change={onAccessChange}
            disabled={accessSaving}
            aria-label="Access status"
          >
            <option value="">— not set —</option>
            {#each ACCESS_STATUSES as a}
              <option value={a}>{ACCESS_EMOJI[a]} {ACCESS_LABELS[a]}</option>
            {/each}
          </select>
        {:else if pin.access_status}
          <span class="access-chip">
            {ACCESS_EMOJI[pin.access_status]} {ACCESS_LABELS[pin.access_status]}
          </span>
        {:else}
          <span class="muted">not set</span>
        {/if}
        {#if accessError}<span class="error">{accessError}</span>{/if}
      </div>
      {#if pin.notes}
        <p class="notes">{pin.notes}</p>
      {/if}

      {#if species && species.is_forageable === false}
        <div class="about-species manage-species">
          <div class="about-head">
            <strong>Management — not for foraging</strong>
            <a class="more-link" href={base + '/species/' + species.id}>More →</a>
          </div>
          <div class="about-body manage-body">
            {#if species.image_url}
              <a class="about-thumb" href={base + '/species/' + species.id} title="Open species page">
                <img src={species.image_url} alt={species.common_name} loading="lazy" />
              </a>
            {/if}
            <div class="about-detail">
              {#if species.identification_notes}
                <div class="about-row manage-row">
                  <span class="about-label">Identify:</span>
                  <p class="manage-text">{species.identification_notes}</p>
                </div>
              {/if}
              {#if species.management_notes}
                <div class="about-row manage-row">
                  <span class="about-label">Manage:</span>
                  <p class="manage-text">{species.management_notes}</p>
                </div>
              {/if}
              {#if species.usage_notes}
                <div class="about-row manage-row">
                  <span class="about-label">Why it matters:</span>
                  <p class="manage-text">{species.usage_notes}</p>
                </div>
              {/if}
            </div>
          </div>
        </div>
      {:else if species && (species.image_url || species.preparation_methods?.length || species.usage_notes || species.harvest_tips || species.toxicity_notes || species.safety_notes)}
        <div class="about-species">
          <div class="about-head">
            <strong>About this species</strong>
            <a class="more-link" href={base + '/species/' + species.id}>More →</a>
          </div>
          <div class="about-body">
            {#if species.image_url}
              <a class="about-thumb" href={base + '/species/' + species.id} title="Open species page">
                <img src={species.image_url} alt={species.common_name} loading="lazy" />
              </a>
            {/if}
            <div class="about-detail">
              {#if species.forage_parts?.length}
                <div class="about-row">
                  <span class="about-label">Edible:</span>
                  <span class="about-chips">
                    {#each species.forage_parts as part}
                      <span class="about-chip">{part.replace(/_/g, ' ')}</span>
                    {/each}
                  </span>
                </div>
              {/if}
              {#if species.preparation_methods?.length}
                <div class="about-row">
                  <span class="about-label">Uses:</span>
                  <span class="about-chips">
                    {#each species.preparation_methods as m}
                      <span class="about-chip about-chip-method">{m.replace(/_/g, ' ')}</span>
                    {/each}
                  </span>
                </div>
              {/if}
              {#if species.safety_notes}
                <p class="about-safety">{species.safety_notes}</p>
              {/if}
            </div>
          </div>
        </div>
      {/if}
    </section>

    {#if flagCounts}
      <section class="community-flags">
        <div class="section-header">
          <h3>Community signals</h3>
          {#if pin.visibility !== 'public'}
            <span class="muted">Public-pin curation</span>
          {/if}
        </div>
        <p class="flag-explainer muted">
          Foragers can flag this pin if they find it gone, mislabeled, or not worth the trip.
          A few independent flags hide it from the default map.
        </p>
        <div class="flag-grid">
          {#each FLAG_ORDER as t}
            {@const count = flagCounts.byType[t]}
            {@const mine = flagCounts.mine.has(t)}
            <button
              class="flag-chip"
              class:active={mine}
              disabled={!$session || flagBusy === t}
              on:click={() => toggleFlag(t)}
              title={$session ? (mine ? 'Click to remove your flag' : 'Click to flag') : 'Sign in to flag'}
            >
              <span class="flag-label">{FLAG_LABELS[t]}</span>
              {#if count > 0}
                <span class="flag-count">{count}</span>
              {/if}
              {#if mine}
                <span class="flag-mine" aria-label="Your flag">✓</span>
              {/if}
            </button>
          {/each}
        </div>
        {#if flagError}
          <p class="error">{flagError}</p>
        {/if}
      </section>
    {/if}

    <section class="observations">
      <div class="section-header">
        <h3>Observations</h3>
        {#if $session}
          <button on:click={() => (formOpen = !formOpen)}>
            {formOpen ? 'Cancel' : 'Log observation'}
          </button>
        {/if}
      </div>
      {#if formOpen}
        <form class="obs-form" on:submit|preventDefault={submitObservation}>
          <fieldset class="date-precision">
            <legend>Date observed</legend>
            <div class="ymd-row">
              <select bind:value={formMonth} required>
                {#each MONTH_NAMES as m, i}
                  <option value={i + 1}>{m}</option>
                {/each}
              </select>
              <select bind:value={formDay} required>
                {#each dayOptions as d}<option value={d}>{d}</option>{/each}
              </select>
              <select bind:value={formYear} required>
                {#each YEAR_OPTIONS as y}<option value={y}>{y}</option>{/each}
              </select>
            </div>
          </fieldset>
          <label>
            Stage
            <select bind:value={formStage} required>
              {#each STAGES as s}<option value={s}>{s}</option>{/each}
            </select>
          </label>
          <label>
            Quality
            <div class="rating">
              <button
                type="button"
                class="zero"
                class:active={formQuality === 0}
                on:click={() => (formQuality = formQuality === 0 ? null : 0)}
                aria-label="No harvest"
              >🚫 No harvest</button>
              {#each [1, 2, 3, 4, 5] as n}
                <button type="button" class="star"
                        class:active={formQuality !== null && formQuality > 0 && formQuality >= n}
                        on:click={() => (formQuality = formQuality === n ? null : n)}
                        aria-label="{n} star">★</button>
              {/each}
              {#if formQuality !== null}
                <button type="button" class="clear" on:click={() => (formQuality = null)}>clear</button>
              {/if}
            </div>
          </label>
          <label>
            Notes (optional)
            <textarea rows="3" bind:value={formNotes} placeholder="Tartness, abundance, …"></textarea>
          </label>
          <fieldset class="obs-vis">
            <legend>Visibility</legend>
            <label class="vis-opt">
              <input type="radio" bind:group={formVisibility} value="shared" />
              <span>Shared</span>
            </label>
            <label class="vis-opt">
              <input type="radio" bind:group={formVisibility} value="private" />
              <span>🔒 Private (only you)</span>
            </label>
          </fieldset>
          {#if errorMessage}<p class="error">{errorMessage}</p>{/if}
          <button type="submit" disabled={formSubmitting}>
            {formSubmitting ? 'Saving…' : 'Save observation'}
          </button>
        </form>
      {/if}
      {#if observations.length === 0}
        <p class="hint">No observations yet.</p>
      {:else}
        {#each years as yr}
          {@const yearObs = byYear.get(yr) ?? []}
          <h4 class="year">{yr}</h4>
          <ul class="obs-list">
            {#each yearObs as o}
              {@const obsPhotos = photosByObs.get(o.id) ?? []}
              <li>
                <span class="stage" style="background: {stageColor(o.stage)}">{o.stage}</span>
                <span class="date">{fmtObservation(o)}</span>
                <span class="by" title={o.user_username ? '@' + o.user_username : ''}>by {profileLabel({ username: o.user_username, display_name: o.user_display_name })}</span>
                {#if o.visibility === 'private'}
                  <span class="vis-tag" title="Only you can see this observation">🔒</span>
                {/if}
                {#if o.quality_rating === 0}
                  <span class="no-harvest">🚫 no harvest</span>
                {:else if o.quality_rating}
                  <span class="quality">{'★'.repeat(o.quality_rating)}</span>
                {/if}
                <button
                  class="obs-add-photo"
                  on:click={() => { pendingUploadObsId = o.id; fileInput?.click(); }}
                  disabled={uploading}
                  aria-label="Add photo to this observation"
                  title="Add photo"
                >📷</button>
                <button class="obs-delete" on:click={() => deleteObservation(o)} aria-label="Delete observation">×</button>
                {#if o.quality_notes}<p class="obs-notes">{o.quality_notes}</p>{/if}
                {#if obsPhotos.length > 0}
                  <div class="obs-photos">
                    {#each obsPhotos as p}
                      <button class="obs-thumb" on:click={() => openLightbox(p)} aria-label="Open photo">
                        {#if thumbUrls.get(p.thumbnail_path)}
                          <img src={thumbUrls.get(p.thumbnail_path)} alt={p.caption ?? 'Photo'} loading="lazy" />
                        {:else}
                          <span class="thumb-loading">…</span>
                        {/if}
                      </button>
                    {/each}
                  </div>
                {/if}
              </li>
            {/each}
          </ul>
        {/each}
      {/if}
    </section>

    <section class="hazards">
      <div class="section-header">
        <h3>Hazards &amp; access</h3>
        {#if $session}
          <button on:click={() => (showHazardForm = !showHazardForm)}>
            {showHazardForm ? 'Cancel' : 'Add'}
          </button>
        {/if}
      </div>
      {#if showHazardForm}
        <form class="haz-form" on:submit|preventDefault={addHazard}>
          <label>
            Type
            <select bind:value={hazardType}>
              {#each HAZARD_TYPES as t}
                <option value={t}>{HAZARD_EMOJI[t]} {HAZARD_LABELS[t]}</option>
              {/each}
            </select>
          </label>
          <label>
            Notes (optional)
            <input type="text" bind:value={hazardNotes} placeholder="e.g. concentrated near south side" />
          </label>
          <button type="submit" disabled={hazardSubmitting}>
            {hazardSubmitting ? 'Saving…' : 'Save hazard'}
          </button>
        </form>
      {/if}
      {#if hazards.length === 0}
        <p class="hint">No hazards or access notes.</p>
      {:else}
        <ul class="hazard-chips">
          {#each hazards as h}
            <li>
              <span class="chip">
                {HAZARD_EMOJI[h.hazard_type]} {HAZARD_LABELS[h.hazard_type]}
                {#if h.notes}<span class="muted"> — {h.notes}</span>{/if}
                <button class="x" on:click={() => deleteHazard(h)} aria-label="Remove">×</button>
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="photos">
      <div class="section-header">
        <h3>Photos</h3>
        {#if $session}
          <div class="upload-controls">
            <label class="upload-license-inline">
              License
              <select bind:value={uploadLicense} disabled={uploading}>
                {#each PHOTO_LICENSE_OPTIONS as o}
                  <option value={o.value}>{o.label}</option>
                {/each}
              </select>
              <button
                type="button"
                class="license-help"
                on:click|stopPropagation={() => (showLicenseHelp = !showLicenseHelp)}
                aria-label="Help with license choices"
                aria-expanded={showLicenseHelp}
              >?</button>
            </label>
            <button
              class="add-photo-btn"
              on:click={() => { pendingUploadObsId = null; fileInput?.click(); }}
              disabled={uploading}
            >
              {uploading ? 'Uploading…' : 'Add photo'}
            </button>
          </div>
          <input type="file" accept="image/*" capture="environment" bind:this={fileInput}
                 on:change={handleFileChange} style="display: none" />
        {/if}
      </div>
      {#if $session && showLicenseHelp}
        <div class="license-help-panel" role="note">
          <p><strong>CC BY-SA 4.0</strong> — share-alike. Anyone can use it; derivatives must use the same license. Default, in the foraging-commons spirit.</p>
          <p><strong>CC BY 4.0</strong> — attribution only. Anyone can use it (including commercially) with credit. No share-alike requirement.</p>
          <p><strong>CC BY-NC-SA 4.0</strong> — non-commercial share-alike. Free for non-commercial use; derivatives must use the same license.</p>
          <p><strong>CC0</strong> — public domain. No rights reserved, no attribution required.</p>
          <p><strong>All rights reserved</strong> — only you (and Forager, to display the photo on the pin) may use it.</p>
        </div>
      {/if}
      {#if uploadError}<p class="error">{uploadError}</p>{/if}
      {#if loosePhotos.length === 0}
        <p class="hint">{photos.length === 0 ? 'No photos yet.' : 'All photos are attached to observations.'}</p>
      {:else}
        <div class="thumb-grid">
          {#each loosePhotos as p}
            <button class="thumb" on:click={() => openLightbox(p)} aria-label="Open photo">
              {#if thumbUrls.get(p.thumbnail_path)}
                <img src={thumbUrls.get(p.thumbnail_path)} alt={p.caption ?? 'Photo'} loading="lazy" />
              {:else}
                <span class="thumb-loading">…</span>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </section>

    <section class="source">
      <h3>Reference</h3>
      <ul class="meta">
        <li><strong>ID:</strong> <code>{shortId}</code> <span class="muted">share to identify this pin</span></li>
        {#if zoneCode}
          <li><strong>Climate zone:</strong> USDA {zoneCode}</li>
        {/if}
        {#if pin.import_source}
          <li>
            <strong>Source:</strong> {pin.import_source}
            {#if pin.import_external_id} · <code>{pin.import_external_id}</code>{/if}
          </li>
          {#if accession}
            <li><strong>Accession:</strong> <code>{accession}</code></li>
          {/if}
        {:else}
          <li class="muted">Manually added</li>
        {/if}
        {#if pin.created_at}
          <li class="muted">Pin created {fmtDate(pin.created_at)}</li>
        {/if}
      </ul>
    </section>
  {/if}
</div>

{#if lightboxPhoto}
  <div class="lightbox" on:click|self={closeLightbox}
       on:keydown|self={(e) => e.key === 'Escape' && closeLightbox()} role="presentation">
    <button class="lightbox-close" on:click={closeLightbox} aria-label="Close">×</button>
    <button
      class="lightbox-delete"
      on:click={deleteLightboxPhoto}
      disabled={deletingPhotoId === lightboxPhoto.id}
      aria-label="Delete photo"
    >{deletingPhotoId === lightboxPhoto.id ? '…' : 'Delete'}</button>
    {#if fullUrls.get(lightboxPhoto.storage_path)}
      <img src={fullUrls.get(lightboxPhoto.storage_path)} alt={lightboxPhoto.caption ?? 'Photo'} />
    {:else}
      <p>Loading…</p>
    {/if}
    <div class="lightbox-credit" aria-live="polite">{photoCreditLine(lightboxPhoto)}</div>
  </div>
{/if}

<style>
  /* Generous side padding so every section has breathing room from the
     panel edge. The :where() bumps specificity in case any parent
     :global rule competes with this. */
  :where(.content) { padding: 0.6rem 1.1rem 2rem 1.2rem; font-size: 0.9rem; box-sizing: border-box; }
  .hint { color: #6b7a6b; font-size: 0.85rem; margin: 0.25rem 0; }
  .error { color: #b03030; font-size: 0.85rem; margin: 0.25rem 0; }
  .muted { color: #8a948a; }
  section { margin-bottom: 0.85rem; }
  h2 { margin: 0; color: #1f2a1f; font-size: 1rem; line-height: 1.25; }
  .sub {
    margin: 0.1rem 0 0.4rem;
    font-size: 0.8rem;
    color: #4a554a;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: baseline;
  }
  .sub em { font-style: italic; }
  .loc-row {
    margin: 0.1rem 0 0.2rem;
    font-size: 0.8rem;
    color: #6b7a6b;
    display: flex;
    gap: 0.4rem;
    align-items: baseline;
  }
  .loc-row .loc {
    font-style: italic;
    font-variant-numeric: tabular-nums;
  }
  ul.meta { list-style: none; padding: 0; margin: 0; font-size: 0.85rem; color: #4a554a; }
  ul.meta li { margin-bottom: 0.15rem; line-height: 1.3; }
  .notes { background: #f5f8f5; padding: 0.5rem 0.7rem; border-radius: 0.35rem; margin: 0.4rem 0 0; color: #1f2a1f; font-size: 0.85rem; }

  .about-species {
    margin-top: 0.6rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid #e1e8e1;
    border-radius: 0.35rem;
    background: #fbfdfa;
    font-size: 0.85rem;
  }
  .about-species.manage-species {
    background: #faf0e8;
    border-color: #d8a880;
  }
  .manage-species .about-head strong { color: #8a3a14; }
  .manage-row {
    grid-template-columns: 1fr;
    gap: 0.15rem;
  }
  .manage-row .about-label { color: #5e3920; font-weight: 600; }
  .manage-text {
    margin: 0;
    color: #1f2a1f;
    line-height: 1.4;
  }
  .manage-body { flex-direction: column; }
  .about-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.25rem; }
  .about-head strong { color: #3a5a3a; font-weight: 600; }
  .about-head .more-link { color: #3a5a3a; font-size: 0.8rem; text-decoration: none; }
  .about-head .more-link:hover { text-decoration: underline; }
  /* Two-column body when an image exists, single-column otherwise.
     Thumb is fixed-width and floats left; detail flexes to fill. */
  .about-body { display: flex; gap: 0.6rem; align-items: flex-start; }
  .about-thumb {
    flex-shrink: 0;
    width: 5rem;
    height: 5rem;
    border-radius: 0.3rem;
    overflow: hidden;
    background: #ebefeb;
    display: block;
  }
  .about-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .about-detail { flex: 1; min-width: 0; }
  .about-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.35rem; margin: 0.18rem 0; }
  .about-label { color: #6b7a6b; font-size: 0.78rem; }
  .about-chips { display: inline-flex; flex-wrap: wrap; gap: 0.25rem; }
  .about-chip {
    background: #eef3ed;
    border: 1px solid #d4ddd2;
    color: #1f2a1f;
    padding: 0.05rem 0.4rem;
    border-radius: 0.45rem;
    font-size: 0.78rem;
  }
  .about-chip-method { background: #fff4e3; border-color: #e8d3a6; }
  .about-safety {
    margin: 0.35rem 0 0;
    color: #7a3a3a;
    font-size: 0.8rem;
  }

  /* Mini harvest-window timeline shown in the pin summary. Compact —
   *  just bars + month letters + today marker; clicking the /windows
   *  page is where editing happens. */
  .mini-timeline {
    margin: 0.5rem 0 0.4rem;
    padding: 0.3rem 0.4rem;
    background: #fafcf6;
    border: 1px solid #e1e8e1;
    border-radius: 0.3rem;
  }
  .mini-months {
    position: relative;
    height: 0.85rem;
    font-size: 0.62rem;
    color: #6b7a6b;
  }
  .mini-month {
    position: absolute;
    transform: translateX(-50%);
    line-height: 1;
  }
  .mini-track {
    position: relative;
    height: 0.7rem;
    background: #ebefeb;
    border-radius: 0.2rem;
  }
  .mini-bar {
    position: absolute;
    top: 0;
    bottom: 0;
    border-radius: 1px;
  }
  /* Confirmed windows (is_confirmed=true; user-verified via
     confirm-species.cjs). Subtle dark outline + check mark — needs
     to read as "vetted" without overpowering the stage color. */
  .mini-bar-confirmed {
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.55);
  }
  .mini-confirmed-mark {
    position: absolute;
    right: 1px;
    top: 50%;
    transform: translateY(-50%);
    color: white;
    font-size: 0.6rem;
    line-height: 1;
    text-shadow: 0 0 1px rgba(0, 0, 0, 0.7);
    pointer-events: none;
  }
  /* Other pins' observations — smaller and lower-contrast than this
     pin's ticks. A thin white halo via box-shadow keeps them visible
     against same-color bars (e.g., a 'ripe' tick on a 'ripe' bar
     would otherwise vanish). */
  .mini-other {
    position: absolute;
    top: 50%;
    width: 0.36rem;
    height: 0.36rem;
    transform: translate(-50%, -50%) rotate(45deg);
    opacity: 0.7;
    border-radius: 1px;
    box-shadow: 0 0 0 0.5px rgba(255, 255, 255, 0.9), 0 0 0 1px rgba(0, 0, 0, 0.35);
    pointer-events: none;
  }
  /* This pin's own observations — bold, white-ringed, larger so they
     pop against bars and against any other-pin ticks at the same DOY. */
  .mini-tick {
    position: absolute;
    top: 50%;
    width: 0.55rem;
    height: 0.55rem;
    transform: translate(-50%, -50%) rotate(45deg);
    border: 1.5px solid white;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.55);
    box-sizing: border-box;
    pointer-events: none;
  }
  .mini-today {
    position: absolute;
    top: -0.18rem;
    bottom: -0.18rem;
    width: 1.5px;
    background: #b03030;
    border-radius: 1px;
    pointer-events: none;
  }

  /* Title row + status chip */
  .title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    /* Reserve room on the right for the panel's floating × / ↗ action
     * buttons (rendered by the parent +page.svelte at top: 0.4rem,
     * right: 0.4rem). Without this padding the visibility chip
     * ("🌐 public" etc.) wraps under or behind the buttons. */
    padding-right: 4.5rem;
  }
  .status-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.12rem 0.55rem;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-radius: 1rem;
    border: 1px solid transparent;
    white-space: nowrap;
  }
  .status-chip.status-active             { background: #e1f1de; color: #2a4a2a; border-color: #b9d8b3; }
  .status-chip.status-gone               { background: #ececec; color: #555;    border-color: #c7c7c7; }
  .status-chip.status-inaccessible       { background: #fde6da; color: #7a3414; border-color: #f0c2a4; }
  .status-chip.status-not_good           { background: #f5e8c4; color: #6a4a14; border-color: #e0c98a; }
  .status-chip.status-needs_verification { background: #ecdcef; color: #6a3a78; border-color: #d3b9d8; }
  /* Legacy: existing 'dormant' rows are migrated to 'active' but
     keep this rule for any that slip through. */
  .status-chip.status-dormant            { background: #f5e8c4; color: #6a4a14; border-color: #e0c98a; }

  .ripe-dot { font-size: 0.85em; }

  /* Visibility chip in the title row — clickable for the owner. */
  .vis-chip {
    display: inline-flex;
    align-items: center;
    padding: 0.12rem 0.5rem;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-radius: 1rem;
    border: 1px solid transparent;
    white-space: nowrap;
  }
  .vis-chip.vis-private { background: #e9e3f0; color: #4a2466; border-color: #c5b3da; }
  .vis-chip.vis-shared  { background: #eef2ee; color: #4a554a; border-color: #c7d0c7; }
  .vis-chip.vis-public  { background: #e3eff5; color: #1a4a66; border-color: #a8cde0; }
  button.vis-chip { cursor: pointer; }
  button.vis-chip:focus-visible { outline: 2px solid #3a5a3a; outline-offset: 1px; }

  /* City-set harvest policy banner (migration 29). One per pin when
     the source city has actively set a non-default policy. */
  .harvest-policy {
    margin: 0.5rem 0 0.75rem;
    padding: 0.55rem 0.75rem;
    border-radius: 0.4rem;
    border: 1px solid;
    font-size: 0.85rem;
  }
  .harvest-policy .hp-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
  }
  .harvest-policy .hp-icon { font-size: 1rem; line-height: 1; }
  .harvest-policy .hp-note {
    margin: 0.35rem 0 0;
    font-weight: 400;
    font-size: 0.82rem;
    line-height: 1.4;
  }
  .harvest-policy-encouraged {
    background: #e6f3e0; border-color: #8cc26a; color: #2d4d20;
  }
  .harvest-policy-personal_use_ok {
    background: #e3eff5; border-color: #a8cde0; color: #1a4a66;
  }
  .harvest-policy-discouraged {
    background: #fcf3df; border-color: #d6b95c; color: #6a4f15;
  }
  .harvest-policy-prohibited {
    background: #f8e0e0; border-color: #c46060; color: #6a1f1f;
  }

  /* 🔒 inline tag on private observation rows */
  .vis-tag {
    display: inline-block;
    font-size: 0.78rem;
    color: #6b7a6b;
    margin-left: 0.15rem;
  }

  /* Observation form visibility fieldset */
  .obs-vis {
    border: 1px solid #d0d8d0;
    border-radius: 0.4rem;
    padding: 0.4rem 0.65rem 0.5rem;
    margin: 0.3rem 0 0.5rem;
  }
  .obs-vis legend {
    padding: 0 0.4rem;
    font-size: 0.78rem;
    color: #4a554a;
  }
  .obs-vis .vis-opt {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.2rem;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .obs-vis input { margin: 0; }

  .status-edit-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0.15rem 0 0.4rem;
    font-size: 0.78rem;
  }
  .status-edit-row select { font-size: 0.78rem; padding: 0.15rem 0.35rem; }
  .access-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 0.35rem 0 0;
    font-size: 0.82rem;
    color: #4a554a;
  }
  .access-row select { font-size: 0.78rem; padding: 0.15rem 0.35rem; }
  .access-label { color: #6b7a6b; }
  .access-chip {
    background: #f5f8f5;
    border: 1px solid #d4ddd2;
    color: #1f2a1f;
    padding: 0.05rem 0.45rem;
    border-radius: 0.45rem;
  }
  .watch-row {
    margin: 0.35rem 0;
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    align-items: center;
  }
  /* Status select sized to match the surrounding watch-btn pills
     so the row reads as one cluster of related controls. */
  .watch-row .status-select {
    padding: 0.2rem 0.5rem;
    font-size: 0.82rem;
    border: 1px solid #c7d0c7;
    border-radius: 0.3rem;
    background: white;
    color: #3a5a3a;
    cursor: pointer;
  }
  .watch-btn {
    background: white;
    border: 1px solid #c7d0c7;
    color: #3a5a3a;
    padding: 0.2rem 0.6rem;
    border-radius: 0.3rem;
    cursor: pointer;
    font-size: 0.82rem;
    text-decoration: none;
    display: inline-block;
  }
  .watch-btn:hover { background: #f0f5ef; }
  .watch-btn.active {
    background: #fff4e3;
    border-color: #e8d3a6;
    color: #7a4a10;
  }
  .watch-btn.link-btn { background: white; }
  .watch-btn.delete-btn {
    background: #fbf0e8;
    border-color: #d8a880;
    color: #8a3a14;
  }
  .watch-btn.delete-btn:hover { background: #f4dec5; }
  .watch-btn.delete-btn:disabled { opacity: 0.55; cursor: not-allowed; }

  /* Community signals (Layer 1 community curation). Authed users
     can flag a public pin as gone, mislabeled, etc. Active state
     shows the user has already flagged that type and a click will
     remove it. */
  .community-flags { margin-top: 1rem; }
  .flag-explainer {
    margin: 0 0 0.5rem;
    font-size: 0.78rem;
    line-height: 1.4;
  }
  .flag-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .flag-chip {
    background: white;
    border: 1px solid #c7d0c7;
    color: #3a5a3a;
    padding: 0.25rem 0.5rem;
    border-radius: 0.3rem;
    cursor: pointer;
    font-size: 0.78rem;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    flex: 1 1 auto;
    justify-content: center;
    white-space: nowrap;
  }
  .flag-chip:hover:not(:disabled) { background: #f0f5ef; }
  .flag-chip:disabled { cursor: default; opacity: 0.6; }
  .flag-chip.active {
    background: #fff4e3;
    border-color: #e8d3a6;
    color: #7a4a10;
  }
  .flag-label { font-weight: 500; }
  .flag-count {
    background: #e1e8e1;
    color: #3a5a3a;
    padding: 0.05rem 0.35rem;
    border-radius: 999px;
    font-size: 0.72rem;
    min-width: 1.1rem;
    text-align: center;
  }
  .flag-chip.active .flag-count {
    background: #f5cc8b;
    color: #7a4a10;
  }
  .flag-mine { color: #7a4a10; font-size: 0.78rem; }
  .no-regional-data {
    margin: 0.5rem 0;
    padding: 0.5rem 0.7rem;
    background: #fcf6e8;
    border: 1px solid #e8d3a6;
    border-radius: 0.3rem;
    font-size: 0.82rem;
    line-height: 1.4;
  }
  .no-regional-data a { color: #7a4a10; }

  .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.4rem; }
  .section-header h3 {
    margin: 0;
    color: #3a5a3a;
    font-size: 0.74rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .obs-form, .haz-form {
    border: 1px solid #d0d8d0; border-radius: 0.4rem; padding: 0.75rem; margin-bottom: 0.75rem;
    background: #fafcf6; display: flex; flex-direction: column; gap: 0.45rem;
  }
  label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.8rem; color: #4a554a; }
  select, textarea, input[type='text'] {
    padding: 0.5rem 0.75rem; font-size: 0.95rem; border: 1px solid #c7d0c7;
    border-radius: 0.4rem; font-family: inherit;
  }
  .rating { display: flex; gap: 0.25rem; align-items: center; }
  .star { background: transparent; border: 0; font-size: 1.5rem; color: #d0d8d0; cursor: pointer; padding: 0; }
  .star.active { color: #d57100; }
  .clear {
    background: transparent; border: 0; margin-left: 0.5rem; font-size: 0.8rem;
    color: #6b7a6b; cursor: pointer; text-decoration: underline;
  }
  button[type='submit'] {
    background: #3a5a3a; color: white; border: 0; padding: 0.5rem 0.9rem;
    border-radius: 0.4rem; cursor: pointer; font-size: 0.85rem;
  }
  .section-header button {
    background: #3a5a3a; color: white; border: 0;
    padding: 0.28rem 0.6rem;
    min-height: 1.85rem; /* still tappable on touch */
    border-radius: 0.3rem;
    cursor: pointer;
    font-size: 0.78rem;
    line-height: 1.1;
  }
  button[type='submit']:disabled, .section-header button:disabled { opacity: 0.6; cursor: not-allowed; }

  /* License + Add photo sit on the same row of the section header
   * so it's visually obvious the dropdown affects the next upload.
   * Wraps cleanly on narrow screens. */
  .upload-controls {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .upload-license-inline {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.78rem;
    color: #4a554a;
  }
  .upload-license-inline select {
    padding: 0.2rem 0.4rem;
    border: 1px solid #c7d0c7;
    border-radius: 0.25rem;
    background: white;
    font-size: 0.78rem;
    color: #1f2a1f;
  }
  .add-photo-btn {
    /* Inherits .section-header button styling but explicitly named
     * so it doesn't get confused with the license help button below. */
  }
  .license-help {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.05rem;
    height: 1.05rem;
    border-radius: 50%;
    background: #e6ede6;
    color: #4a554a;
    font-size: 0.7rem;
    font-weight: 600;
    cursor: pointer;
    user-select: none;
    border: 0;
    padding: 0;
    line-height: 1;
  }
  .license-help:hover { background: #d8e2d8; }
  .license-help[aria-expanded="true"] {
    background: #3a5a3a;
    color: white;
  }
  .license-help-panel {
    background: #fbfdfa;
    border: 1px solid #d0d8d0;
    border-radius: 0.35rem;
    padding: 0.5rem 0.7rem;
    margin: 0.4rem 0 0.6rem;
    font-size: 0.8rem;
    color: #1f2a1f;
    line-height: 1.4;
  }
  .license-help-panel p { margin: 0 0 0.35rem; }
  .license-help-panel p:last-child { margin: 0; }
  .license-help-panel strong { color: #3a5a3a; }
  /* Slightly larger touch targets on small screens. */
  @media (max-width: 640px) {
    .section-header button {
      min-height: 2.1rem;
      padding: 0.35rem 0.7rem;
    }
  }

  .year { margin: 0.65rem 0 0.2rem; color: #6b7a6b; font-size: 0.7rem;
          font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
  ul.obs-list { list-style: none; padding: 0; margin: 0; }
  ul.obs-list li {
    padding: 0.35rem 0; border-bottom: 1px solid #ebefeb;
    display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center;
    font-size: 0.85rem;
  }
  .stage { color: white; padding: 0.15rem 0.6rem; border-radius: 1rem; font-size: 0.75rem; font-weight: 600; }
  .date { color: #4a554a; font-size: 0.9rem; }
  .quality { color: #d57100; font-size: 0.85rem; }
  .no-harvest {
    color: #6b7a6b;
    font-size: 0.78rem;
    font-style: italic;
  }
  .rating button.zero {
    background: transparent;
    border: 1px solid #c7d0c7;
    color: #6b7a6b;
    font-size: 0.78rem;
    padding: 0.2rem 0.55rem;
    border-radius: 1rem;
    cursor: pointer;
  }
  .rating button.zero.active {
    background: #6b7a6b;
    color: white;
    border-color: #6b7a6b;
  }
  .obs-notes { flex-basis: 100%; margin: 0; color: #4a554a; font-size: 0.85rem; padding-left: 0.5rem; }
  .by { font-size: 0.78rem; color: #6b7a6b; }
  .obs-delete {
    background: transparent; border: 0; color: #b03030; cursor: pointer;
    font-size: 1.05rem; padding: 0.2rem 0.4rem; line-height: 1;
    min-height: 1.6rem; min-width: 1.6rem;
  }
  .obs-add-photo {
    background: transparent; border: 0; cursor: pointer;
    font-size: 1rem; padding: 0.2rem 0.4rem; line-height: 1;
    margin-left: auto;
    min-height: 1.6rem; min-width: 1.6rem;
  }
  .obs-add-photo:disabled { opacity: 0.4; cursor: default; }
  .obs-photos {
    flex-basis: 100%;
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin-top: 0.3rem;
    padding-left: 0.5rem;
  }
  .obs-thumb {
    width: 3rem;
    height: 3rem;
    padding: 0;
    border: 1px solid #d0d8d0;
    border-radius: 0.25rem;
    background: #ebefeb;
    cursor: pointer;
    overflow: hidden;
  }
  .obs-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  @media (max-width: 640px) {
    .obs-delete, .obs-add-photo { min-height: 2rem; min-width: 2rem; padding: 0.35rem 0.55rem; }
    .obs-thumb { width: 3.5rem; height: 3.5rem; }
  }

  fieldset.date-precision {
    border: 1px solid #d0d8d0;
    border-radius: 0.4rem;
    padding: 0.5rem 0.75rem 0.6rem;
    margin: 0;
  }
  fieldset.date-precision legend {
    padding: 0 0.4rem;
    font-size: 0.8rem;
    color: #4a554a;
  }
  .ymd-row {
    display: flex;
    gap: 0.4rem;
  }
  .ymd-row select {
    flex: 1;
  }
  .obs-delete:hover { color: #ff5050; }

  .source code {
    background: #ebefeb;
    padding: 0.1rem 0.4rem;
    border-radius: 0.25rem;
    font-size: 0.85em;
    color: #1f2a1f;
  }

  .source {
    border-top: 1px solid #ebefeb;
    padding-top: 0.5rem;
    margin-top: 0.75rem;
  }
  .source h3 {
    margin: 0 0 0.35rem;
    color: #8a948a;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .source ul.meta { font-size: 0.78rem; }

  button.inline {
    padding: 0.2rem 0.55rem; font-size: 0.78rem;
    background: #3a5a3a; color: white; border: 0;
    border-radius: 0.3rem; cursor: pointer;
  }

  .hazard-chips { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .chip {
    display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.3rem 0.6rem;
    background: #fce8c4; border-radius: 1rem; font-size: 0.85rem; color: #5a4014;
  }
  .chip .x {
    background: transparent; border: 0; color: #5a4014; cursor: pointer;
    font-size: 1rem; padding: 0 0 0 0.3rem; line-height: 1;
  }

  .thumb-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 0.4rem; margin-top: 0.5rem;
  }
  .thumb {
    aspect-ratio: 1; border: 0; padding: 0; background: #ebefeb; border-radius: 0.25rem;
    overflow: hidden; cursor: pointer; display: flex; align-items: center; justify-content: center;
  }
  .thumb img { width: 100%; height: 100%; object-fit: cover; }
  .thumb-loading { color: #8a948a; }

  .lightbox {
    position: fixed; inset: 0; background: rgba(0, 0, 0, 0.92); z-index: 2000;
    display: flex; align-items: center; justify-content: center; padding: 1rem;
  }
  .lightbox img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .lightbox-close {
    position: absolute; top: 0.75rem; right: 1rem; background: transparent;
    border: 0; color: white; font-size: 2rem; cursor: pointer;
  }
  .lightbox-delete {
    position: absolute; top: 1rem; left: 1rem;
    background: rgba(176, 48, 48, 0.85);
    color: white;
    border: 0;
    padding: 0.4rem 0.8rem;
    border-radius: 0.3rem;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .lightbox-delete:hover { background: rgba(176, 48, 48, 1); }
  .lightbox-delete:disabled { opacity: 0.6; cursor: default; }
  .lightbox-credit {
    position: absolute;
    bottom: 1rem;
    left: 50%;
    transform: translateX(-50%);
    color: rgba(255, 255, 255, 0.85);
    font-size: 0.8rem;
    background: rgba(0, 0, 0, 0.45);
    padding: 0.3rem 0.65rem;
    border-radius: 0.3rem;
    pointer-events: none;
    max-width: 90vw;
    text-align: center;
  }
</style>
