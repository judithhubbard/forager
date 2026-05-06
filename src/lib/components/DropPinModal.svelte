<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { listAll, search, type Species } from '$lib/services/speciesService';
  import { create as createPin, type Visibility } from '$lib/services/pinService';
  import { activeRegion } from '$lib/stores/activeRegion';

  export let regionId: string;
  /** If provided (e.g. from a map tap), skip GPS capture entirely. */
  export let initialLng: number | null = null;
  export let initialLat: number | null = null;

  const dispatch = createEventDispatcher<{ close: void; saved: { id: string } }>();

  type Stage = 'capturing' | 'form' | 'saving' | 'error';

  let stage: Stage = initialLng != null && initialLat != null ? 'form' : 'capturing';
  let errorMessage = '';

  // Location capture
  let lng: number | null = initialLng;
  let lat: number | null = initialLat;
  let accuracy: number | null = null;

  // Form fields
  let species: Species[] = [];
  let speciesQuery = '';
  let speciesId: string | null = null;
  let displayName = '';
  let notes = '';
  // Default visibility comes from the active region's preference. The
  // user can flip per-pin without changing the region default.
  let visibility: Visibility = ($activeRegion?.default_pin_visibility as Visibility) ?? 'shared';

  $: filtered = search(species, speciesQuery).slice(0, 10);

  onMount(async () => {
    species = await listAll();
    if (stage === 'capturing') captureGps();
  });

  function captureGps() {
    stage = 'capturing';
    if (!navigator.geolocation) {
      errorMessage = 'This browser does not support GPS. Pin drop requires location.';
      stage = 'error';
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        lng = pos.coords.longitude;
        lat = pos.coords.latitude;
        accuracy = pos.coords.accuracy;
        stage = 'form';
      },
      (err) => {
        errorMessage = `Could not get GPS: ${err.message}. Tap-to-set on map will be added in a later phase.`;
        stage = 'error';
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }

  function selectSpecies(s: Species) {
    speciesId = s.id;
    speciesQuery = s.common_name;
  }

  async function save() {
    if (!speciesId) {
      errorMessage = 'Pick a species first.';
      return;
    }
    if (lng == null || lat == null) {
      errorMessage = 'Missing GPS.';
      return;
    }
    stage = 'saving';
    try {
      const id = await createPin({
        regionId,
        speciesId,
        lng,
        lat,
        locationAccuracyM: accuracy ? Math.round(accuracy) : null,
        displayName: displayName.trim() || null,
        notes: notes.trim() || null,
        visibility
      });
      dispatch('saved', { id });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed.';
      errorMessage = message;
      stage = 'error';
    }
  }
</script>

<div
  class="overlay"
  on:click|self={() => dispatch('close')}
  on:keydown|self={(e) => e.key === 'Escape' && dispatch('close')}
  role="presentation"
>
  <div class="card" role="dialog" aria-modal="true" aria-label="Drop a pin">
    <header>
      <h2>Drop a pin</h2>
      <button class="close" on:click={() => dispatch('close')} aria-label="Close">×</button>
    </header>

    {#if stage === 'capturing'}
      <p class="hint">Getting your location…</p>
    {:else if stage === 'error'}
      <p class="error">{errorMessage}</p>
      <div class="actions">
        <button on:click={captureGps}>Try again</button>
        <button class="secondary" on:click={() => dispatch('close')}>Cancel</button>
      </div>
    {:else}
      <p class="hint">
        At {lat?.toFixed(5)}, {lng?.toFixed(5)}
        {#if accuracy} — accuracy ±{Math.round(accuracy)}m{/if}
      </p>

      <label>
        Species
        <input
          type="text"
          placeholder="Type to search…"
          bind:value={speciesQuery}
          on:input={() => (speciesId = null)}
        />
      </label>

      {#if speciesQuery && !speciesId}
        <ul class="suggestions">
          {#each filtered as s}
            <li>
              <button type="button" on:click={() => selectSpecies(s)}>
                <strong>{s.common_name}</strong>
                <em>{s.scientific_name}</em>
              </button>
            </li>
          {:else}
            <li class="empty">No species match.</li>
          {/each}
        </ul>
      {/if}

      <label>
        Name (optional)
        <input
          type="text"
          placeholder="e.g. 'big serviceberry by the gate'"
          bind:value={displayName}
        />
      </label>

      <label>
        Notes (optional)
        <textarea rows="3" bind:value={notes} placeholder="Quality, access notes, …"
        ></textarea>
      </label>

      <fieldset class="visibility">
        <legend>Who can see this pin?</legend>
        <label class="vis-opt">
          <input type="radio" bind:group={visibility} value="shared" />
          <span><strong>Shared</strong> — everyone in this region</span>
        </label>
        <label class="vis-opt">
          <input type="radio" bind:group={visibility} value="private" />
          <span><strong>Private</strong> 🔒 — only you</span>
        </label>
      </fieldset>

      {#if errorMessage}
        <p class="error">{errorMessage}</p>
      {/if}

      <div class="actions">
        <button on:click={save} disabled={!speciesId || stage === 'saving'}>
          {stage === 'saving' ? 'Saving…' : 'Save pin'}
        </button>
        <button class="secondary" on:click={() => dispatch('close')}>Cancel</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }
  .card {
    background: white;
    border-radius: 0.5rem;
    width: 100%;
    max-width: 26rem;
    padding: 1.25rem;
    max-height: 90vh;
    overflow-y: auto;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
  }
  h2 {
    margin: 0;
    color: #3a5a3a;
    font-size: 1.05rem;
  }
  .close {
    background: transparent;
    border: 0;
    font-size: 1.5rem;
    cursor: pointer;
    color: #6b7a6b;
  }
  .hint {
    color: #6b7a6b;
    font-size: 0.85rem;
    margin: 0 0 1rem;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    margin-bottom: 0.85rem;
    font-size: 0.85rem;
    color: #4a554a;
  }
  input,
  textarea {
    padding: 0.55rem 0.75rem;
    font-size: 0.95rem;
    border: 1px solid #c7d0c7;
    border-radius: 0.4rem;
    font-family: inherit;
  }
  textarea {
    resize: vertical;
  }
  .suggestions {
    list-style: none;
    margin: 0 0 0.85rem;
    padding: 0;
    border: 1px solid #d0d8d0;
    border-radius: 0.4rem;
    max-height: 12rem;
    overflow-y: auto;
  }
  .suggestions li button {
    width: 100%;
    text-align: left;
    background: white;
    border: 0;
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    font-size: 0.9rem;
    border-bottom: 1px solid #ebefeb;
  }
  .suggestions li:last-child button {
    border-bottom: 0;
  }
  .suggestions li button:hover {
    background: #f5f8f5;
  }
  .suggestions strong {
    color: #1f2a1f;
  }
  .suggestions em {
    color: #6b7a6b;
    font-style: italic;
    font-size: 0.8rem;
  }
  .empty {
    padding: 0.5rem 0.75rem;
    color: #8a948a;
    font-size: 0.85rem;
  }
  .error {
    color: #b03030;
    font-size: 0.9rem;
    margin: 0 0 0.75rem;
  }
  .visibility {
    border: 1px solid #d0d8d0;
    border-radius: 0.4rem;
    padding: 0.5rem 0.75rem 0.6rem;
    margin: 0 0 0.85rem;
  }
  .visibility legend {
    padding: 0 0.4rem;
    font-size: 0.8rem;
    color: #4a554a;
  }
  .vis-opt {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    margin-top: 0.25rem;
    font-size: 0.88rem;
    cursor: pointer;
  }
  .vis-opt input { margin: 0; }
  .actions {
    display: flex;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }
  button {
    padding: 0.6rem 1rem;
    font-size: 0.95rem;
    background: #3a5a3a;
    color: white;
    border: 0;
    border-radius: 0.4rem;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  button.secondary {
    background: transparent;
    color: #3a5a3a;
    border: 1px solid #3a5a3a;
  }
</style>
