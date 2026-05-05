<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import {
    getEffective,
    updateStatus,
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
    type Stage,
    type ObservationPrecision
  } from '$lib/services/observationService';
  import {
    listByPin as listPhotos,
    signUrls,
    upload as uploadPhoto,
    capturePhotoLocation,
    type Photo
  } from '$lib/services/photoService';

  export let pinId: string;

  const dispatch = createEventDispatcher<{ statusChanged: void }>();

  let pin: PinEffective | null = null;
  let species: Species | null = null;
  let observations: Observation[] = [];
  let allSpecies: Species[] = [];
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
  // needs_verification is set automatically by the 4-year auto-degrade rule;
  // not a manual choice. active = exists; gone = removed; dormant = unproductive.
  const STATUSES: PinStatus[] = ['active', 'gone', 'dormant'];

  let formOpen = false;
  let formStage: Stage = 'ripe';
  let formQuality: number | null = null;
  let formNotes = '';
  let formDate: string = todayIso();
  let formPrecision: ObservationPrecision = 'day';
  // For year/month precision modes:
  const NOW = new Date();
  let formYear: number = NOW.getFullYear();
  let formMonth: number = NOW.getMonth() + 1; // 1-12
  let formSubmitting = false;

  // Short shareable id (first 8 chars of UUID) for talking about the pin.
  $: shortId = pinId ? pinId.slice(0, 8) : '';

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

  // Reload whenever pinId changes (for use as a reusable panel component).
  let lastLoadedId: string | null = null;
  $: if (pinId && pinId !== lastLoadedId) {
    lastLoadedId = pinId;
    load();
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

  async function handleFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !pin || pin.lng == null || pin.lat == null) return;
    uploading = true;
    uploadError = '';
    try {
      const loc = await capturePhotoLocation({
        lng: pin.lng,
        lat: pin.lat,
        accuracyM: pin.location_accuracy_m
      });
      await uploadPhoto({
        pinId,
        file,
        capturedLat: loc.lat,
        capturedLng: loc.lng,
        capturedAccuracyM: loc.accuracyM
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

  async function submitObservation() {
    formSubmitting = true;
    errorMessage = '';
    try {
      // Build the timestamp from whichever precision the user chose.
      let observedAt: Date;
      if (formPrecision === 'day') {
        observedAt = new Date(formDate + 'T12:00:00');
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
        observedPrecision: formPrecision
      });
      formOpen = false;
      formNotes = '';
      formQuality = null;
      formDate = todayIso();
      formPrecision = 'day';
      observations = await listByPin(pinId);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Save failed.';
    } finally {
      formSubmitting = false;
    }
  }

  /** Open the observation form pre-filled to 'ripe' so the user can rate
   *  the harvest 1-5 stars and pick a date (incl. a past year). Submitting
   *  the form is what actually verifies. */
  function startVerifyHarvest() {
    formStage = 'ripe';
    formQuality = null;
    formNotes = '';
    formDate = todayIso();
    formOpen = true;
  }

  async function deleteObservation(o: Observation) {
    if (!confirm('Delete this observation?')) return;
    try {
      await removeObservation(o.id);
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
</script>

<div class="content">
  {#if loading}
    <p class="hint">Loading…</p>
  {:else if !pin}
    <p class="error">Pin not found.</p>
  {:else}
    <section class="summary">
      <h2>{pin.display_name ?? species?.common_name ?? 'Unnamed'}</h2>
      {#if species}
        <p class="sci">
          <em>{species.scientific_name}</em>
          <span class="muted">• {species.common_name}</span>
        </p>
      {/if}
      <p class="tree-id">
        <strong>Tree ID:</strong>
        <code>{shortId}</code>
        <span class="muted">share this code to identify the pin</span>
      </p>
      <ul class="meta">
        <li>
          <strong>Status:</strong>
          {pin.effective_status}
          {#if pin.effective_status !== pin.status}
            <span class="muted">(stored: {pin.status})</span>
          {/if}
          <span class="status-edit">
            <select bind:value={pendingStatus}>
              <option value={null}>change…</option>
              {#each STATUSES as s}
                {#if s !== pin.status}
                  <option value={s}>{s}</option>
                {/if}
              {/each}
            </select>
            {#if pendingStatus}
              <button class="inline" on:click={saveStatus} disabled={statusSaving}>
                {statusSaving ? 'Saving…' : `Set ${pendingStatus}`}
              </button>
            {/if}
          </span>
        </li>
        <li>
          <strong>Location:</strong>
          {pin.lat?.toFixed(5)}, {pin.lng?.toFixed(5)}
          {#if pin.location_accuracy_m}
            <span class="muted">±{pin.location_accuracy_m}m</span>
          {/if}
        </li>
        {#if pin.is_ripe_now}
          <li class="ripe">🍒 In ripe window today</li>
        {/if}
      </ul>
      {#if pin.notes}
        <p class="notes">{pin.notes}</p>
      {/if}
    </section>

    <section class="observations">
      <div class="section-header">
        <h3>Observations</h3>
        <div class="header-actions">
          <button class="verify" on:click={startVerifyHarvest}>
            ✓ Verify harvest
          </button>
          <button on:click={() => (formOpen = !formOpen)}>
            {formOpen ? 'Cancel' : 'Log observation'}
          </button>
        </div>
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
              <input type="date" bind:value={formDate} max={todayIso()} required />
            {:else if formPrecision === 'month'}
              <div class="ym-row">
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
            Quality (1–5)
            <div class="rating">
              {#each [1, 2, 3, 4, 5] as n}
                <button type="button" class="star"
                        class:active={formQuality !== null && formQuality >= n}
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
          <h4 class="year">{yr}</h4>
          <ul class="obs-list">
            {#each byYear.get(yr) ?? [] as o}
              <li>
                <span class="stage" style="background: {stageColor(o.stage)}">{o.stage}</span>
                <span class="date">{fmtObservation(o)}</span>
                {#if o.quality_rating}<span class="quality">{'★'.repeat(o.quality_rating)}</span>{/if}
                <button class="obs-delete" on:click={() => deleteObservation(o)} aria-label="Delete observation">×</button>
                {#if o.quality_notes}<p class="obs-notes">{o.quality_notes}</p>{/if}
              </li>
            {/each}
          </ul>
        {/each}
      {/if}
    </section>

    <section class="hazards">
      <div class="section-header">
        <h3>Hazards &amp; access</h3>
        <button on:click={() => (showHazardForm = !showHazardForm)}>
          {showHazardForm ? 'Cancel' : 'Add'}
        </button>
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
        <button on:click={() => fileInput?.click()} disabled={uploading}>
          {uploading ? 'Uploading…' : 'Add photo'}
        </button>
        <input type="file" accept="image/*" capture="environment" bind:this={fileInput}
               on:change={handleFileChange} style="display: none" />
      </div>
      {#if uploadError}<p class="error">{uploadError}</p>{/if}
      {#if photos.length === 0}
        <p class="hint">No photos yet.</p>
      {:else}
        <div class="thumb-grid">
          {#each photos as p}
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
        <li>
          <strong>Tree ID:</strong> <code>{shortId}</code>
        </li>
        {#if pin.import_source}
          <li>
            <strong>Source:</strong>
            {pin.import_source}
            {#if pin.import_external_id}
              <span class="muted">·</span> external id: <code>{pin.import_external_id}</code>
            {/if}
          </li>
          {#if accession}
            <li>
              <strong>Accession:</strong> <code>{accession}</code>
            </li>
          {/if}
        {:else}
          <li class="muted">Manually added.</li>
        {/if}
        {#if pin.created_at}
          <li class="muted">Pin created {fmtDate(pin.created_at)}.</li>
        {/if}
      </ul>
    </section>
  {/if}
</div>

{#if lightboxPhoto}
  <div class="lightbox" on:click|self={closeLightbox}
       on:keydown|self={(e) => e.key === 'Escape' && closeLightbox()} role="presentation">
    <button class="lightbox-close" on:click={closeLightbox} aria-label="Close">×</button>
    {#if fullUrls.get(lightboxPhoto.storage_path)}
      <img src={fullUrls.get(lightboxPhoto.storage_path)} alt={lightboxPhoto.caption ?? 'Photo'} />
    {:else}
      <p>Loading…</p>
    {/if}
  </div>
{/if}

<style>
  .content { padding: 1rem 1.25rem 3rem; }
  .hint { color: #6b7a6b; }
  .error { color: #b03030; font-size: 0.9rem; }
  .muted { color: #8a948a; }
  section { margin-bottom: 1.75rem; }
  h2 { margin: 0 0 0.25rem; color: #1f2a1f; }
  .sci { margin: 0 0 1rem; font-size: 0.9rem; color: #4a554a; }
  ul.meta { list-style: none; padding: 0; margin: 0 0 1rem; font-size: 0.9rem; color: #4a554a; }
  ul.meta li { margin-bottom: 0.25rem; }
  .ripe { color: #d57100; font-weight: 600; }
  .notes { background: #f5f8f5; padding: 0.75rem 1rem; border-radius: 0.4rem; margin: 0; color: #1f2a1f; font-size: 0.95rem; }

  .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
  .section-header h3 { margin: 0; color: #3a5a3a; }

  .obs-form, .haz-form {
    border: 1px solid #d0d8d0; border-radius: 0.4rem; padding: 1rem; margin-bottom: 1.25rem;
    background: #fafcf6; display: flex; flex-direction: column; gap: 0.6rem;
  }
  label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.85rem; color: #4a554a; }
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
  button[type='submit'], .section-header button {
    background: #3a5a3a; color: white; border: 0; padding: 0.5rem 1rem;
    border-radius: 0.4rem; cursor: pointer; font-size: 0.9rem;
  }
  button[type='submit']:disabled, .section-header button:disabled { opacity: 0.6; cursor: not-allowed; }
  .header-actions { display: flex; gap: 0.5rem; }
  .verify {
    background: #d57100;
    color: white;
  }

  .year { margin: 1.25rem 0 0.5rem; color: #6b7a6b; font-size: 0.85rem;
          font-weight: 500; letter-spacing: 0.05em; text-transform: uppercase; }
  ul.obs-list { list-style: none; padding: 0; margin: 0; }
  ul.obs-list li {
    padding: 0.6rem 0; border-bottom: 1px solid #ebefeb;
    display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center;
  }
  .stage { color: white; padding: 0.15rem 0.6rem; border-radius: 1rem; font-size: 0.75rem; font-weight: 600; }
  .date { color: #4a554a; font-size: 0.9rem; }
  .quality { color: #d57100; font-size: 0.85rem; }
  .obs-notes { flex-basis: 100%; margin: 0; color: #4a554a; font-size: 0.85rem; padding-left: 0.5rem; }
  .obs-delete {
    background: transparent; border: 0; color: #b03030; cursor: pointer;
    font-size: 1.1rem; padding: 0 0.25rem; line-height: 1; margin-left: auto;
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
  .ym-row {
    display: flex;
    gap: 0.4rem;
  }
  .ym-row select {
    flex: 1;
  }
  .obs-delete:hover { color: #ff5050; }

  .tree-id {
    margin: 0.5rem 0 1rem;
    font-size: 0.85rem;
    color: #4a554a;
  }
  .tree-id code, .source code {
    background: #ebefeb;
    padding: 0.1rem 0.4rem;
    border-radius: 0.25rem;
    font-size: 0.85em;
    color: #1f2a1f;
  }

  .source {
    border-top: 1px solid #ebefeb;
    padding-top: 1rem;
    margin-top: 2rem;
  }
  .source h3 {
    margin: 0 0 0.6rem;
    color: #6b7a6b;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .status-edit { margin-left: 0.5rem; display: inline-flex; gap: 0.4rem; align-items: center; }
  .status-edit select { padding: 0.2rem 0.4rem; font-size: 0.85rem; }
  button.inline { padding: 0.25rem 0.6rem; font-size: 0.85rem; }

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
</style>
