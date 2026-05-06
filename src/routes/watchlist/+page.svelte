<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$lib/utils/nav';
  import { base } from '$app/paths';
  import {
    listMine,
    unwatch,
    type WatchlistRow
  } from '$lib/services/watchlistService';
  import { listAll as listSpecies, type Species } from '$lib/services/speciesService';
  import { getEffective, type PinEffective } from '$lib/services/pinService';

  let rows: WatchlistRow[] = [];
  let speciesById: Record<string, Species> = {};
  let pinById: Record<string, PinEffective> = {};
  let loading = true;
  let error = '';

  onMount(async () => {
    try {
      const list = await listMine();
      rows = list;
      const allSpecies = await listSpecies();
      speciesById = Object.fromEntries(allSpecies.map((s) => [s.id, s]));
      // Fetch each watched pin individually — small N (most users
      // watch ≤ 20 things), no point in batching.
      const pinIds = list.map((r) => r.pin_id).filter((x): x is string => !!x);
      const pinResults = await Promise.all(pinIds.map((id) => getEffective(id)));
      pinById = Object.fromEntries(
        pinResults.filter((p): p is PinEffective => !!p).map((p) => [p.id!, p])
      );
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not load watchlist.';
    } finally {
      loading = false;
    }
  });

  async function remove(id: string) {
    if (!confirm('Stop watching this?')) return;
    try {
      await unwatch(id);
      rows = rows.filter((r) => r.id !== id);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not remove.';
    }
  }

  function back() {
    if (history.length > 1) history.back();
    else goto('/');
  }
</script>

<header>
  <button class="back" on:click={back} aria-label="Back">← Back</button>
  <h1>My watchlist</h1>
</header>

<main>
  {#if loading}
    <p class="hint">Loading…</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else if rows.length === 0}
    <p class="hint">
      You aren't watching anything yet. Open a pin or species and tap
      "Watch" to be notified when it's ripe.
    </p>
  {:else}
    <ul class="rows">
      {#each rows as r}
        {#if r.species_id && speciesById[r.species_id]}
          {@const s = speciesById[r.species_id]}
          <li class="row">
            <div class="meta">
              <a href={base + '/species/' + s.id}>
                <strong>{s.common_name}</strong>
                <span class="sci">{s.scientific_name}</span>
              </a>
              <p class="kind">Any pin of this species</p>
            </div>
            <button class="rm" on:click={() => remove(r.id)} aria-label="Stop watching">×</button>
          </li>
        {:else if r.pin_id && pinById[r.pin_id]}
          {@const p = pinById[r.pin_id]}
          <li class="row">
            <div class="meta">
              <a href={base + '/pins/' + p.id}>
                <strong>{p.display_name ?? speciesById[p.species_id ?? '']?.common_name ?? 'Pin'}</strong>
              </a>
              <p class="kind">Specific pin</p>
            </div>
            <button class="rm" on:click={() => remove(r.id)} aria-label="Stop watching">×</button>
          </li>
        {/if}
      {/each}
    </ul>
  {/if}
</main>

<style>
  header { display: flex; align-items: center; gap: 1rem; padding: 0.5rem 1rem; background: white; border-bottom: 1px solid #e1e8e1; height: 56px; box-sizing: border-box; }
  header h1 { margin: 0; font-size: 1.05rem; color: #3a5a3a; }
  .back { background: transparent; border: 0; color: #3a5a3a; font-size: 0.9rem; cursor: pointer; }
  main { padding: 1.25rem 1rem 3rem; max-width: 36rem; margin: 0 auto; }
  .hint { color: #6b7a6b; }
  .error { color: #b03030; }
  .rows { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.65rem 0.85rem;
    background: white;
    border: 1px solid #e1e8e1;
    border-radius: 0.4rem;
  }
  .meta a { color: #1f2a1f; text-decoration: none; }
  .meta a:hover strong { text-decoration: underline; }
  .meta strong { color: #1f2a1f; font-weight: 600; }
  .meta .sci { font-style: italic; color: #6b7a6b; margin-left: 0.4rem; }
  .meta .kind { margin: 0.15rem 0 0; font-size: 0.8rem; color: #6b7a6b; }
  .rm {
    background: transparent;
    border: 1px solid #d6c0c0;
    color: #b03030;
    width: 2rem;
    height: 2rem;
    border-radius: 0.3rem;
    font-size: 1.1rem;
    cursor: pointer;
  }
  .rm:hover { background: #fdf2f2; }
</style>
