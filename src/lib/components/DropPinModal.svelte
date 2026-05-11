<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { listAll, search, type Species } from '$lib/services/speciesService';
  import { create as createPin, type Visibility } from '$lib/services/pinService';
  import { create as createObservation, STAGES, type Stage as ObsStage } from '$lib/services/observationService';
  import { activeRegion } from '$lib/stores/activeRegion';

  export let regionId: string;
  /** If provided (e.g. from a map tap), skip GPS capture entirely. */
  export let initialLng: number | null = null;
  export let initialLat: number | null = null;

  const dispatch = createEventDispatcher<{ close: void; saved: { id: string } }>();

  type FormStage = 'capturing' | 'form' | 'saving' | 'error';

  let stage: FormStage = initialLng != null && initialLat != null ? 'form' : 'capturing';
  let errorMessage = '';

  // Location capture
  let lng: number | null = initialLng;
  let lat: number | null = initialLat;
  let accuracy: number | null = null;

  // Form fields
  let species: Species[] = [];
  let speciesQuery = '';
  let speciesId: string | null = null;
  let notes = '';
  // Default visibility comes from the active region's preference. The
  // user can flip per-pin without changing the region default.
  let visibility: Visibility = ($activeRegion?.default_pin_visibility as Visibility) ?? 'shared';

  // Inline observation. Most foragers know the stage when they drop
  // the pin (they're standing in front of the plant) so save them the
  // extra round-trip of pin -> save -> reopen -> log observation. If
  // they don't want to add one, leave the toggle off; pin saves alone.
  let logObservation = false;
  let obsStage: ObsStage = 'ripe';
  let obsQuality: number | null = null;

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
        displayName: null,
        notes: notes.trim() || null,
        visibility
      });
      // Optional inline observation. The pin already wrote, so a
      // failure here is logged but doesn't roll back the pin —
      // user can add it manually from the pin detail panel.
      if (logObservation) {
        try {
          await createObservation({
            pinId: id,
            stage: obsStage,
            qualityRating: obsQuality,
            visibility: visibility === 'private' ? 'private' : 'shared'
          });
        } catch (obsErr) {
          console.error('[DropPinModal] inline observation failed (pin saved):', obsErr);
        }
      }
      dispatch('saved', { id });
    } catch (err) {
      // Supabase PostgrestError is a plain object, not an Error
      // instance — pull `.message` regardless of class. Without this
      // the user sees the literal "Save failed." and we lose the
      // actual reason (RLS rejection, JWT expired, constraint, etc).
      console.error('[DropPinModal] save failed:', err);
      let message = 'Save failed.';
      if (err && typeof err === 'object') {
        const e = err as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
        if (typeof e.message === 'string' && e.message) message = e.message;
        const extras = [e.code, e.details, e.hint].filter(
          (x): x is string => typeof x === 'string' && !!x
        );
        if (extras.length) message += ` (${extras.join(' · ')})`;
      } else if (typeof err === 'string') {
        message = err;
      }
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

      <!-- Inline observation: most foragers know the stage at the
           moment they drop the pin, so save them the round-trip of
           pin -> save -> reopen -> log. -->
      <fieldset class="observe">
        <legend>
          <label class="obs-toggle">
            <input type="checkbox" bind:checked={logObservation} />
            <span>Also log an observation right now</span>
          </label>
        </legend>
        {#if logObservation}
          <label class="obs-field">
            <span>Stage</span>
            <select bind:value={obsStage}>
              {#each STAGES as s}<option value={s}>{s}</option>{/each}
            </select>
          </label>
          <label class="obs-field">
            <span>Quality (optional)</span>
            <div class="stars">
              {#each [1, 2, 3, 4, 5] as n}
                <button
                  type="button"
                  class="star"
                  class:on={obsQuality !== null && n <= obsQuality}
                  on:click={() => (obsQuality = obsQuality === n ? null : n)}
                  aria-label={`${n} star${n > 1 ? 's' : ''}`}
                >★</button>
              {/each}
              {#if obsQuality !== null}
                <button type="button" class="clear-rating" on:click={() => (obsQuality = null)}>clear</button>
              {/if}
            </div>
          </label>
        {/if}
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
    word-break: break-word;
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
  .observe {
    border: 1px solid #d0d8d0;
    border-radius: 0.4rem;
    padding: 0.4rem 0.75rem 0.7rem;
    margin: 0 0 0.85rem;
  }
  .observe legend {
    padding: 0 0.3rem;
  }
  .obs-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0;
    font-size: 0.88rem;
    cursor: pointer;
    color: #2c3a2c;
  }
  .obs-toggle input { margin: 0; }
  .obs-field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin: 0.5rem 0 0;
    font-size: 0.85rem;
  }
  .obs-field span { color: #4a554a; flex-shrink: 0; }
  .obs-field select {
    padding: 0.4rem 0.55rem;
    font-size: 0.9rem;
    border: 1px solid #c7d0c7;
    border-radius: 0.35rem;
  }
  .stars {
    display: inline-flex;
    align-items: center;
    gap: 0.05rem;
  }
  .star {
    background: transparent;
    border: 0;
    color: #d0d4d0;
    font-size: 1.25rem;
    padding: 0 0.1rem;
    cursor: pointer;
    line-height: 1;
  }
  .star.on { color: #d4a017; }
  .star:hover { color: #b8901a; }
  .clear-rating {
    background: transparent;
    border: 0;
    color: #8a948a;
    font-size: 0.72rem;
    margin-left: 0.4rem;
    cursor: pointer;
    text-decoration: underline;
  }
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
