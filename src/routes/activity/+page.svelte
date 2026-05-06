<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$lib/utils/nav';
  import { base } from '$app/paths';
  import { activeRegion } from '$lib/stores/activeRegion';
  import {
    listRecentInRegion,
    type ObservationWithPin,
    type Stage
  } from '$lib/services/observationService';
  import { profileLabel } from '$lib/services/profileService';

  let observations: ObservationWithPin[] = [];
  let loading = true;
  let errorMessage = '';

  $: if ($activeRegion) load($activeRegion.id);

  async function load(regionId: string) {
    loading = true;
    errorMessage = '';
    try {
      observations = await listRecentInRegion(regionId, 100);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Failed to load activity.';
    } finally {
      loading = false;
    }
  }

  function fmtDate(s: string): string {
    return new Date(s).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function stageColor(s: Stage | null): string {
    if (!s) return '#9090a0';
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

<header>
  <button class="back" on:click={() => goto('/')}>← Back</button>
  <h1>Recent observations</h1>
</header>

<main>
  {#if loading}
    <p class="hint">Loading…</p>
  {:else if errorMessage}
    <p class="error">{errorMessage}</p>
  {:else if observations.length === 0}
    <p class="hint">
      No observations yet. Open a pin from the map and tap "Log observation."
    </p>
  {:else}
    <ul class="feed">
      {#each observations as o}
        <li>
          <a class="row" href={`${base}/pins/${o.pin_id}`}>
            <span class="stage" style="background: {stageColor(o.stage)}">{o.stage}</span>
            <div class="body">
              <p class="primary">
                <strong>{o.pin_display_name ?? o.species_common_name ?? 'Unnamed pin'}</strong>
                {#if o.species_common_name && o.pin_display_name}
                  <span class="muted">— {o.species_common_name}</span>
                {/if}
              </p>
              <p class="secondary">
                <span class="date">{fmtDate(o.observed_at ?? o.created_at ?? '')}</span>
                <span class="by">by {profileLabel({ username: o.user_username, display_name: o.user_display_name })}</span>
                {#if o.visibility === 'private'}
                  <span class="vis-tag" title="Only you can see this observation">🔒</span>
                {/if}
                {#if o.quality_rating}
                  <span class="quality">{'★'.repeat(o.quality_rating)}</span>
                {/if}
              </p>
              {#if o.quality_notes}
                <p class="notes">{o.quality_notes}</p>
              {/if}
            </div>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</main>

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
    padding: 1rem 1.25rem 3rem;
    max-width: 36rem;
    margin: 0 auto;
  }
  .hint, .error { color: #6b7a6b; }
  .error { color: #b03030; }
  .muted { color: #8a948a; font-weight: 400; }

  ul.feed {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  ul.feed li {
    border-bottom: 1px solid #ebefeb;
  }
  a.row {
    display: flex;
    gap: 0.75rem;
    padding: 0.75rem 0.25rem;
    text-decoration: none;
    color: inherit;
  }
  a.row:hover {
    background: #f5f8f5;
  }
  .stage {
    color: white;
    padding: 0.15rem 0.6rem;
    border-radius: 1rem;
    font-size: 0.75rem;
    font-weight: 600;
    align-self: flex-start;
    flex-shrink: 0;
    margin-top: 0.2rem;
  }
  .body {
    flex: 1;
    min-width: 0;
  }
  .primary {
    margin: 0 0 0.15rem;
    font-size: 0.95rem;
    color: #1f2a1f;
  }
  .secondary {
    margin: 0;
    font-size: 0.85rem;
    color: #6b7a6b;
    display: flex;
    gap: 0.6rem;
    align-items: center;
  }
  .quality { color: #d57100; }
  .by { color: #6b7a6b; }
  .vis-tag { color: #6b7a6b; font-size: 0.85em; }
  .notes {
    margin: 0.3rem 0 0;
    font-size: 0.85rem;
    color: #4a554a;
    font-style: italic;
  }
</style>
