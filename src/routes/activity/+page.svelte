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
      // Bumped from 100 → 500 since filters now let users narrow
      // a long history. Still capped to keep the page snappy.
      observations = await listRecentInRegion(regionId, 500);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Failed to load activity.';
    } finally {
      loading = false;
    }
  }

  /** Filters. Each is single-select; '' = no filter. */
  let speciesFilter = '';
  let authorFilter = '';

  /** Distinct species + author lists derived from the loaded set so
   *  the dropdowns only offer values that are actually present.
   *  Re-derived every load. */
  $: availableSpecies = (() => {
    const seen = new Map<string, string>();
    for (const o of observations) {
      if (!o.species_id) continue;
      const label = o.species_common_name ?? '(unknown)';
      if (!seen.has(o.species_id)) seen.set(o.species_id, label);
    }
    return Array.from(seen.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  })();
  $: availableAuthors = (() => {
    const seen = new Map<string, string>();
    for (const o of observations) {
      if (!o.user_id) continue;
      const label = profileLabel({
        username: o.user_username,
        display_name: o.user_display_name
      });
      if (!seen.has(o.user_id)) seen.set(o.user_id, label);
    }
    return Array.from(seen.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  })();

  $: filteredObs = observations.filter((o) => {
    if (speciesFilter && o.species_id !== speciesFilter) return false;
    if (authorFilter && o.user_id !== authorFilter) return false;
    return true;
  });

  /** Group observations by month-year (newest first), using
   *  observed_at if present else created_at. listRecentInRegion
   *  returns date-descending so a single in-order pass groups
   *  correctly. */
  $: groupedObs = (() => {
    const groups: { label: string; rows: ObservationWithPin[] }[] = [];
    for (const o of filteredObs) {
      const iso = o.observed_at ?? o.created_at;
      if (!iso) continue;
      const d = new Date(iso);
      const label = d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long'
      });
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.rows.push(o);
      else groups.push({ label, rows: [o] });
    }
    return groups;
  })();

  function fmtDate(s: string): string {
    return new Date(s).toLocaleDateString(undefined, {
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
    <div class="filters">
      <label>
        Species:
        <select bind:value={speciesFilter}>
          <option value="">— any —</option>
          {#each availableSpecies as s}
            <option value={s.id}>{s.label}</option>
          {/each}
        </select>
      </label>
      <label>
        Author:
        <select bind:value={authorFilter}>
          <option value="">— anyone —</option>
          {#each availableAuthors as a}
            <option value={a.id}>{a.label}</option>
          {/each}
        </select>
      </label>
      {#if speciesFilter || authorFilter}
        <button class="clear-filters" on:click={() => { speciesFilter = ''; authorFilter = ''; }}>
          Clear
        </button>
      {/if}
    </div>
    {#if filteredObs.length === 0}
      <p class="hint">No observations match those filters.</p>
    {:else}
      {#each groupedObs as g, i}
        <details class="group" open={i === 0}>
          <summary class="group-label">
            <span class="group-name">{g.label}</span>
            <span class="group-count">{g.rows.length}</span>
          </summary>
          <ul class="feed">
            {#each g.rows as o}
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
        </details>
      {/each}
    {/if}
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

  /* Filter row sits above the grouped feed. Wraps onto a second
     line on phones rather than scrolling horizontally. */
  .filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.65rem;
    margin-bottom: 0.5rem;
    font-size: 0.85rem;
    color: #4a554a;
  }
  .filters label { display: inline-flex; align-items: center; gap: 0.35rem; }
  .filters select {
    padding: 0.2rem 0.45rem;
    font-size: 0.85rem;
    border: 1px solid #c7d0c7;
    border-radius: 0.3rem;
    background: white;
    max-width: 14rem;
  }
  .clear-filters {
    background: white;
    border: 1px solid #c7d0c7;
    color: #3a5a3a;
    border-radius: 0.3rem;
    padding: 0.2rem 0.55rem;
    font-size: 0.78rem;
    cursor: pointer;
  }
  .clear-filters:hover { background: #f0f5ef; }

  /* Month-year groups (collapsible). Newest opens by default;
     older months collapse so a long history doesn't dominate
     the page. Same shape as the /tracks page. */
  .group { margin: 0.4rem 0; }
  .group-label {
    cursor: pointer;
    list-style: none;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.45rem 0.5rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: #3a5a3a;
    background: #f5f8f5;
    border: 1px solid #e1e8e1;
    border-radius: 0.35rem;
    user-select: none;
  }
  .group-label::-webkit-details-marker { display: none; }
  .group-label::before {
    content: '▸';
    color: #3a5a3a;
    font-size: 1.1rem;
    line-height: 1;
    width: 1.1rem;
    text-align: center;
    transition: transform 0.15s;
  }
  .group[open] > .group-label::before { transform: rotate(90deg); }
  .group-name { flex: 1; }
  .group-count {
    color: #6b7a6b;
    font-weight: 500;
    font-size: 0.78rem;
  }

  ul.feed {
    list-style: none;
    padding: 0;
    margin: 0.4rem 0 0;
  }
  ul.feed li {
    border-bottom: 1px solid #ebefeb;
  }
  ul.feed li:last-child { border-bottom: 0; }
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
