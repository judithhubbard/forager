<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
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
    groupByYear,
    STAGES,
    type Observation,
    type Stage
  } from '$lib/services/observationService';
  import {
    listByPin as listPhotos,
    signUrls,
    upload as uploadPhoto,
    capturePhotoLocation,
    type Photo
  } from '$lib/services/photoService';

  $: pinId = $page.params.id as string;

  let pin: PinEffective | null = null;
  let species: Species | null = null;
  let observations: Observation[] = [];
  let allSpecies: Species[] = [];
  let photos: Photo[] = [];
  let thumbUrls = new Map<string, string>();
  let fullUrls = new Map<string, string>();
  let loading = true;
  let errorMessage = '';

  // Photo upload state
  let fileInput: HTMLInputElement;
  let uploading = false;
  let uploadError = '';

  // Lightbox
  let lightboxPhoto: Photo | null = null;

  // Hazards
  let hazards: Hazard[] = [];
  let showHazardForm = false;
  let hazardType: HazardType = 'poison_ivy';
  let hazardNotes = '';
  let hazardSubmitting = false;

  // Status edit
  let pendingStatus: PinStatus | null = null;
  let statusSaving = false;
  const STATUSES: PinStatus[] = ['active', 'gone', 'dormant', 'needs_verification'];

  // Observation form state.
  let formOpen = false;
  let formStage: Stage = 'ripe';
  let formQuality: number | null = null;
  let formNotes = '';
  let formSubmitting = false;

  $: byYear = groupByYear(observations);
  $: years = [...byYear.keys()].sort((a, b) => b - a);

  onMount(load);

  async function load() {
    loading = true;
    try {
      [pin, allSpecies] = await Promise.all([getEffective(pinId), listSpecies()]);
      if (pin?.species_id) {
        species = allSpecies.find((s) => s.id === pin?.species_id) ?? null;
      }
      observations = await listByPin(pinId);
      [hazards] = await Promise.all([listHazards(pinId)]);
      await loadPhotos();
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
      await createHazard({
        pinId,
        hazardType,
        notes: hazardNotes.trim() || null
      });
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
      await createObservation({
        pinId,
        stage: formStage,
        qualityRating: formQuality,
        qualityNotes: formNotes.trim() || null
      });
      formOpen = false;
      formNotes = '';
      formQuality = null;
      observations = await listByPin(pinId);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Save failed.';
    } finally {
      formSubmitting = false;
    }
  }

  function fmtDate(s: string): string {
    return new Date(s).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function stageColor(s: Stage): string {
    switch (s) {
      case 'flowering':
        return '#d691b3';
      case 'green':
        return '#789a4a';
      case 'ripening':
        return '#c79a3c';
      case 'ripe':
        return '#d57100';
      case 'past':
        return '#7a6a5a';
      case 'bare':
        return '#a0a0a0';
      default:
        return '#9090a0';
    }
  }
</script>

<header>
  <button class="back" on:click={() => goto('/')}>← Back</button>
  <h1>Pin detail</h1>
</header>

<main>
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
        {#if pin.import_source}
          <li class="muted">Imported from {pin.import_source}</li>
        {/if}
      </ul>
      {#if pin.notes}
        <p class="notes">{pin.notes}</p>
      {/if}
    </section>

    <section class="hazards">
      <div class="section-header">
        <h3>Hazards</h3>
        <button on:click={() => (showHazardForm = !showHazardForm)}>
          {showHazardForm ? 'Cancel' : 'Add hazard'}
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
            <input
              type="text"
              bind:value={hazardNotes}
              placeholder="e.g. concentrated near the south side"
            />
          </label>
          <button type="submit" disabled={hazardSubmitting}>
            {hazardSubmitting ? 'Saving…' : 'Save hazard'}
          </button>
        </form>
      {/if}

      {#if hazards.length === 0}
        <p class="hint">No hazards reported.</p>
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
        <input
          type="file"
          accept="image/*"
          capture="environment"
          bind:this={fileInput}
          on:change={handleFileChange}
          style="display: none"
        />
      </div>
      {#if uploadError}
        <p class="error">{uploadError}</p>
      {/if}
      {#if photos.length === 0}
        <p class="hint">No photos yet.</p>
      {:else}
        <div class="thumb-grid">
          {#each photos as p}
            <button
              class="thumb"
              on:click={() => openLightbox(p)}
              aria-label="Open photo"
            >
              {#if thumbUrls.get(p.thumbnail_path)}
                <img
                  src={thumbUrls.get(p.thumbnail_path)}
                  alt={p.caption ?? 'Photo'}
                  loading="lazy"
                />
              {:else}
                <span class="thumb-loading">…</span>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </section>

    <section class="observations">
      <div class="section-header">
        <h3>Observations</h3>
        <button on:click={() => (formOpen = !formOpen)}>
          {formOpen ? 'Cancel' : 'Log observation'}
        </button>
      </div>

      {#if formOpen}
        <form class="obs-form" on:submit|preventDefault={submitObservation}>
          <label>
            Stage
            <select bind:value={formStage} required>
              {#each STAGES as s}
                <option value={s}>{s}</option>
              {/each}
            </select>
          </label>

          <label>
            Quality (1–5, optional)
            <div class="rating">
              {#each [1, 2, 3, 4, 5] as n}
                <button
                  type="button"
                  class="star"
                  class:active={formQuality !== null && formQuality >= n}
                  on:click={() => (formQuality = formQuality === n ? null : n)}
                  aria-label="{n} star"
                >
                  ★
                </button>
              {/each}
              {#if formQuality !== null}
                <button type="button" class="clear" on:click={() => (formQuality = null)}
                  >clear</button
                >
              {/if}
            </div>
          </label>

          <label>
            Notes (optional)
            <textarea rows="3" bind:value={formNotes} placeholder="Tartness, abundance, …"
            ></textarea>
          </label>

          {#if errorMessage}
            <p class="error">{errorMessage}</p>
          {/if}

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
                <span class="date">{fmtDate(o.observed_at)}</span>
                {#if o.quality_rating}
                  <span class="quality">{'★'.repeat(o.quality_rating)}</span>
                {/if}
                {#if o.quality_notes}
                  <p class="obs-notes">{o.quality_notes}</p>
                {/if}
              </li>
            {/each}
          </ul>
        {/each}
      {/if}
    </section>
  {/if}
</main>

{#if lightboxPhoto}
  <div
    class="lightbox"
    on:click|self={closeLightbox}
    on:keydown|self={(e) => e.key === 'Escape' && closeLightbox()}
    role="presentation"
  >
    <button class="lightbox-close" on:click={closeLightbox} aria-label="Close">×</button>
    {#if fullUrls.get(lightboxPhoto.storage_path)}
      <img
        src={fullUrls.get(lightboxPhoto.storage_path)}
        alt={lightboxPhoto.caption ?? 'Photo'}
      />
    {:else}
      <p>Loading…</p>
    {/if}
  </div>
{/if}

<style>
  header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.5rem 1rem;
    background: white;
    border-bottom: 1px solid #e1e8e1;
    height: 56px;
    box-sizing: border-box;
  }
  header h1 {
    margin: 0;
    font-size: 1.05rem;
    color: #3a5a3a;
  }
  .back {
    background: transparent;
    border: 0;
    color: #3a5a3a;
    font-size: 0.9rem;
    cursor: pointer;
  }
  main {
    padding: 1.5rem 1.25rem;
    max-width: 36rem;
    margin: 0 auto;
  }
  .hint {
    color: #6b7a6b;
  }
  .error {
    color: #b03030;
    font-size: 0.9rem;
  }
  .muted {
    color: #8a948a;
  }
  section {
    margin-bottom: 2rem;
  }
  h2 {
    margin: 0 0 0.25rem;
    color: #1f2a1f;
  }
  .sci {
    margin: 0 0 1rem;
    font-size: 0.9rem;
    color: #4a554a;
  }
  ul.meta {
    list-style: none;
    padding: 0;
    margin: 0 0 1rem;
    font-size: 0.9rem;
    color: #4a554a;
  }
  ul.meta li {
    margin-bottom: 0.25rem;
  }
  .ripe {
    color: #d57100;
    font-weight: 600;
  }
  .notes {
    background: #f5f8f5;
    padding: 0.75rem 1rem;
    border-radius: 0.4rem;
    margin: 0;
    color: #1f2a1f;
    font-size: 0.95rem;
  }
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }
  .section-header h3 {
    margin: 0;
    color: #3a5a3a;
  }
  .obs-form {
    border: 1px solid #d0d8d0;
    border-radius: 0.4rem;
    padding: 1rem;
    margin-bottom: 1.5rem;
    background: #fafcf6;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.85rem;
    color: #4a554a;
  }
  select,
  textarea {
    padding: 0.5rem 0.75rem;
    font-size: 0.95rem;
    border: 1px solid #c7d0c7;
    border-radius: 0.4rem;
    font-family: inherit;
  }
  .rating {
    display: flex;
    gap: 0.25rem;
    align-items: center;
  }
  .star {
    background: transparent;
    border: 0;
    font-size: 1.5rem;
    color: #d0d8d0;
    cursor: pointer;
    padding: 0;
  }
  .star.active {
    color: #d57100;
  }
  .clear {
    background: transparent;
    border: 0;
    margin-left: 0.5rem;
    font-size: 0.8rem;
    color: #6b7a6b;
    cursor: pointer;
    text-decoration: underline;
  }
  button[type='submit'],
  .section-header button {
    background: #3a5a3a;
    color: white;
    border: 0;
    padding: 0.5rem 1rem;
    border-radius: 0.4rem;
    cursor: pointer;
    font-size: 0.9rem;
  }
  button[type='submit']:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .year {
    margin: 1.25rem 0 0.5rem;
    color: #6b7a6b;
    font-size: 0.85rem;
    font-weight: 500;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  ul.obs-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  ul.obs-list li {
    padding: 0.6rem 0;
    border-bottom: 1px solid #ebefeb;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }
  .stage {
    color: white;
    padding: 0.15rem 0.6rem;
    border-radius: 1rem;
    font-size: 0.75rem;
    font-weight: 600;
  }
  .date {
    color: #4a554a;
    font-size: 0.9rem;
  }
  .quality {
    color: #d57100;
    font-size: 0.85rem;
  }
  .obs-notes {
    flex-basis: 100%;
    margin: 0;
    color: #4a554a;
    font-size: 0.85rem;
    padding-left: 0.5rem;
  }

  /* Status edit inline */
  .status-edit {
    margin-left: 0.5rem;
    display: inline-flex;
    gap: 0.4rem;
    align-items: center;
  }
  .status-edit select {
    padding: 0.2rem 0.4rem;
    font-size: 0.85rem;
  }
  button.inline {
    padding: 0.25rem 0.6rem;
    font-size: 0.85rem;
  }

  /* Hazards */
  .haz-form {
    border: 1px solid #d0d8d0;
    border-radius: 0.4rem;
    padding: 0.85rem;
    margin-bottom: 1rem;
    background: #fafcf6;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .hazard-chips {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.3rem 0.6rem;
    background: #fce8c4;
    border-radius: 1rem;
    font-size: 0.85rem;
    color: #5a4014;
  }
  .chip .x {
    background: transparent;
    border: 0;
    color: #5a4014;
    cursor: pointer;
    font-size: 1rem;
    padding: 0 0 0 0.3rem;
    line-height: 1;
  }

  /* Photos */
  .thumb-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 0.4rem;
    margin-top: 0.5rem;
  }
  .thumb {
    aspect-ratio: 1;
    border: 0;
    padding: 0;
    background: #ebefeb;
    border-radius: 0.25rem;
    overflow: hidden;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .thumb-loading {
    color: #8a948a;
  }

  /* Lightbox */
  .lightbox {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.92);
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }
  .lightbox img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  .lightbox-close {
    position: absolute;
    top: 0.75rem;
    right: 1rem;
    background: transparent;
    border: 0;
    color: white;
    font-size: 2rem;
    cursor: pointer;
  }
</style>
