<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { base } from '$app/paths';
  import {
    getEffective,
    updateStatus,
    updateVisibility,
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
  import { listAll as listSpecies, type Species } from '$lib/services/speciesService';
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
  import { activeRegion } from '$lib/stores/activeRegion';
  import { settings } from '$lib/stores/settings';
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

  type WindowRow = { stage: string; start_doy: number; end_doy: number };

  /** Earthy palette, must match the /windows page so this mini-timeline
   *  reads consistently. */
  const STAGE_COLORS: Record<string, string> = {
    flowering: '#9b7fb2',
    green: '#6b9442',
    ripening: '#b87a2f',
    ripe: '#8e2828',
    past: '#7a7368'
  };
  const STAGE_ORDER = ['flowering', 'green', 'ripening', 'ripe', 'past'];

  export let pinId: string;

  const dispatch = createEventDispatcher<{
    statusChanged: void;
    requestMove: { pinId: string };
  }>();

  let pin: PinEffective | null = null;
  let species: Species | null = null;
  let observations: ObservationWithUser[] = [];
  let allSpecies: Species[] = [];
  let windows: WindowRow[] = [];

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
  let formPrecision: ObservationPrecision = 'day';
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

  async function load() {
    loading = true;
    errorMessage = '';
    pin = null;
    species = null;
    observations = [];
    hazards = [];
    photos = [];
    thumbUrls = new Map();
    fullUrls = new Map();
    try {
      const [pinResult, speciesResult, obsResult, hazResult] = await Promise.all([
        getEffective(pinId),
        listSpecies(),
        listByPin(pinId),
        listHazards(pinId)
      ]);
      pin = pinResult;
      allSpecies = speciesResult;
      observations = obsResult;
      hazards = hazResult;
      if (pin?.species_id) {
        species = allSpecies.find((s) => s.id === pin?.species_id) ?? null;
      }
      // Fetch the species' fruiting windows for this pin's region so the
      // mini-timeline in the summary can show when this plant flowers /
      // ripens. Also fetch observations from OTHER pins of the same
      // species in the region so they can show as faded ticks alongside
      // this pin's own (more prominent) observations.
      if (pin?.species_id && pin?.region_id) {
        const [winRes, otherObsRes] = await Promise.all([
          supabase
            .from('species_fruiting_windows')
            .select('stage, start_doy, end_doy')
            .eq('species_id', pin.species_id)
            .eq('region_id', pin.region_id),
          supabase
            .from('v_observation_with_pin')
            .select('stage, observed_at, pin_id')
            .eq('species_id', pin.species_id)
            .eq('pin_region_id', pin.region_id)
            .neq('pin_id', pin.id)
        ]);
        windows = winRes.data ?? [];
        otherSpeciesObs = (otherObsRes.data ?? []) as OtherObs[];
      } else {
        windows = [];
        otherSpeciesObs = [];
      }
      loadPhotos();
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Failed to load pin.';
    } finally {
      loading = false;
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

  async function loadPhotos() {
    photos = await listPhotos(pinId);
    if (photos.length === 0) {
      thumbUrls = new Map();
      return;
    }
    const paths = photos.map((p) => p.thumbnail_path);
    thumbUrls = await signUrls(paths, 3600);
  }

  /** Holds the observation_id that the next file-input change should attach
   *  the uploaded photo to. Set right before triggering fileInput.click(). */
  let pendingUploadObsId: string | null = null;

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
        license: $settings.defaultPhotoLicense
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
      // Build the timestamp from whichever precision the user chose.
      let observedAt: Date;
      if (formPrecision === 'day') {
        observedAt = new Date(formYear, formMonth - 1, formDay, 12, 0, 0);
      } else if (formPrecision === 'month') {
        observedAt = new Date(formYear, formMonth - 1, 1, 12, 0, 0);
      } else {
        observedAt = new Date(formYear, 0, 1, 12, 0, 0);
      }
      await createObservation({
        pinId,
        stage: formStage,
        qualityRating: formQuality,
        qualityNotes: formNotes.trim() || null,
        observedAt,
        observedPrecision: formPrecision,
        visibility: formVisibility
      });
      formOpen = false;
      formNotes = '';
      formQuality = null;
      formYear = NOW.getFullYear();
      formMonth = NOW.getMonth() + 1;
      formDay = NOW.getDate();
      formPrecision = 'day';
      observations = await listByPin(pinId);
      // Refresh the pin so is_ripe_now / has_ripe_observation_* update,
      // then notify the parent to refetch its filtered pins.
      pin = await getEffective(pinId);
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
      observations = await listByPin(pinId);
      pin = await getEffective(pinId);
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
          {#if pin.is_ripe_now}<span class="ripe-dot" title="In ripe window">🍒</span>{/if}
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
      {#if species}
        <p class="sub">
          <em>{species.scientific_name}</em>
          {#if showCommonNameBelow}<span class="muted"> · {species.common_name}</span>{/if}
          <span class="loc">
            {pin.lat?.toFixed(5)}, {pin.lng?.toFixed(5)}
            {#if pin.location_accuracy_m}<span class="muted">±{pin.location_accuracy_m}m</span>{/if}
          </span>
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
          <a class="watch-btn link-btn" href={base + '/timeline'}>Year history →</a>
        </div>
      {:else}
        <div class="watch-row">
          <a class="watch-btn link-btn" href={base + '/timeline'}>Year history →</a>
        </div>
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
                style={`left: ${miniPct(w.start_doy)}%; width: ${miniPct(w.end_doy) - miniPct(w.start_doy)}%; background: ${STAGE_COLORS[w.stage] ?? '#888'};`}
                title="{w.stage}: DOY {w.start_doy}–{w.end_doy}"
              ></div>
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
      {#if $session}
        <div class="status-edit-row">
          <select bind:value={pendingStatus}>
            <option value={null}>change status…</option>
            {#each STATUSES as s}
              {#if s !== pin.status}<option value={s}>{statusLabel(s)}</option>{/if}
            {/each}
          </select>
          {#if pendingStatus}
            <button class="inline" on:click={saveStatus} disabled={statusSaving}>
              {statusSaving ? '…' : `Set ${statusLabel(pendingStatus)}`}
            </button>
          {/if}
          {#if pin.created_by === $profile?.id || $activeRegion?.role === 'admin'}
            <button
              class="inline"
              on:click={() => dispatch('requestMove', { pinId })}
              title="Click on the map to set a new location"
            >Move pin</button>
          {/if}
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

      {#if species && (species.preparation_methods?.length || species.usage_notes || species.harvest_tips || species.toxicity_notes || species.safety_notes)}
        <div class="about-species">
          <div class="about-head">
            <strong>About this species</strong>
            <a class="more-link" href={base + '/species/' + species.id}>More →</a>
          </div>
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
      {/if}
    </section>

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
            <div class="precision-tabs">
              {#each [['day','Day/Month/Year'], ['month','Month/Year'], ['year','Year']] as [k, label]}
                <label class="precision-tab" class:active={formPrecision === k}>
                  <input type="radio" bind:group={formPrecision} value={k} />
                  {label}
                </label>
              {/each}
            </div>
            {#if formPrecision === 'day'}
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
            {:else if formPrecision === 'month'}
              <div class="ymd-row">
                <select bind:value={formMonth} required>
                  {#each MONTH_NAMES as m, i}
                    <option value={i + 1}>{m}</option>
                  {/each}
                </select>
                <select bind:value={formYear} required>
                  {#each YEAR_OPTIONS as y}<option value={y}>{y}</option>{/each}
                </select>
              </div>
            {:else}
              <select bind:value={formYear} required>
                {#each YEAR_OPTIONS as y}<option value={y}>{y}</option>{/each}
              </select>
            {/if}
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
          <button on:click={() => { pendingUploadObsId = null; fileInput?.click(); }} disabled={uploading}>
            {uploading ? 'Uploading…' : 'Add photo'}
          </button>
          <input type="file" accept="image/*" capture="environment" bind:this={fileInput}
                 on:change={handleFileChange} style="display: none" />
        {/if}
      </div>
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
  .sub .loc {
    margin-left: auto;
    font-style: italic;
    color: #6b7a6b;
    white-space: nowrap;
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
  .about-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.25rem; }
  .about-head strong { color: #3a5a3a; font-weight: 600; }
  .about-head .more-link { color: #3a5a3a; font-size: 0.8rem; text-decoration: none; }
  .about-head .more-link:hover { text-decoration: underline; }
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
  .watch-row { margin: 0.35rem 0; display: flex; gap: 0.4rem; flex-wrap: wrap; }
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
  .precision-tabs {
    display: flex;
    gap: 0.4rem;
    margin-bottom: 0.55rem;
    flex-wrap: wrap;
  }
  .precision-tab {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.78rem;
    color: #4a554a;
    padding: 0.18rem 0.5rem;
    border: 1px solid #c7d0c7;
    border-radius: 1rem;
    cursor: pointer;
  }
  .precision-tab input { display: none; }
  .precision-tab.active {
    background: #3a5a3a;
    color: white;
    border-color: #3a5a3a;
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
