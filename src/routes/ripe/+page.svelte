<script lang="ts">
  import { onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { activeRegion } from '$lib/stores/activeRegion';
  import {
    listRipeNow,
    haversineMeters,
    type PinEffective
  } from '$lib/services/pinService';
  import { listAll as listSpecies, type Species } from '$lib/services/speciesService';

  let pins: PinEffective[] = [];
  let allSpecies: Species[] = [];
  let speciesById = new Map<string, Species>();
  let loading = true;
  let errorMessage = '';

  // User location for distance sort (best-effort, not required).
  let userLng: number | null = null;
  let userLat: number | null = null;
  let watchId: number | null = null;

  $: if ($activeRegion) load($activeRegion.id);

  $: speciesById = new Map(allSpecies.map((s) => [s.id, s]));

  $: sortedPins =
    userLng != null && userLat != null
      ? [...pins].sort(
          (a, b) =>
            distanceToUser(a) - distanceToUser(b)
        )
      : pins;

  function distanceToUser(p: PinEffective): number {
    if (p.lng == null || p.lat == null || userLng == null || userLat == null) return Infinity;
    return haversineMeters({ lng: userLng, lat: userLat }, { lng: p.lng, lat: p.lat });
  }

  function fmtDistance(m: number): string {
    if (!isFinite(m)) return '';
    if (m < 1000) return `${Math.round(m)} m`;
    return `${(m / 1000).toFixed(1)} km`;
  }

  async function load(regionId: string) {
    loading = true;
    errorMessage = '';
    try {
      [pins, allSpecies] = await Promise.all([listRipeNow(regionId), listSpecies()]);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Failed to load.';
    } finally {
      loading = false;
    }

    if (navigator.geolocation && watchId == null) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          userLng = pos.coords.longitude;
          userLat = pos.coords.latitude;
        },
        () => undefined,
        { enableHighAccuracy: false, maximumAge: 60_000 }
      );
    }
  }

  onDestroy(() => {
    if (watchId != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId);
    }
  });
</script>

<header>
  <button class="back" on:click={() => goto('/')}>← Back</button>
  <h1>Ripe now</h1>
</header>

<main>
  {#if loading}
    <p class="hint">Loading…</p>
  {:else if errorMessage}
    <p class="error">{errorMessage}</p>
  {:else if sortedPins.length === 0}
    <p class="hint">
      Nothing is in its ripe window in this region right now. Check the
      <a href="/activity">Activity</a> feed or wait a few weeks.
    </p>
  {:else}
    {#if userLng == null || userLat == null}
      <p class="hint small">
        Allow location to see distances to each pin and sort by closest.
      </p>
    {/if}
    <ul class="ripe-list">
      {#each sortedPins as p}
        <li>
          <a class="row" href={`/pins/${p.id}`}>
            <span class="dot" aria-hidden="true">●</span>
            <div class="body">
              <p class="primary">
                <strong>{p.display_name ?? speciesById.get(p.species_id ?? '')?.common_name ?? 'Unnamed'}</strong>
                {#if p.species_id && speciesById.get(p.species_id)}
                  <span class="muted">
                    — {speciesById.get(p.species_id)?.common_name}
                  </span>
                {/if}
              </p>
              <p class="secondary">
                {#if userLng != null && userLat != null}
                  <span>{fmtDistance(distanceToUser(p))}</span>
                {/if}
                {#if p.last_observed_at}
                  <span class="muted">
                    Last seen {new Date(p.last_observed_at).toLocaleDateString()}
                  </span>
                {/if}
              </p>
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
    color: #d57100;
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
  .hint.small { font-size: 0.85rem; margin-bottom: 1rem; }
  .error { color: #b03030; }
  .muted { color: #8a948a; }

  ul.ripe-list { list-style: none; padding: 0; margin: 0; }
  ul.ripe-list li { border-bottom: 1px solid #ebefeb; }
  a.row {
    display: flex;
    gap: 0.75rem;
    padding: 0.85rem 0.25rem;
    text-decoration: none;
    color: inherit;
    align-items: center;
  }
  a.row:hover { background: #fff8ee; }
  .dot {
    color: #d57100;
    font-size: 1.5rem;
    line-height: 1;
  }
  .body { flex: 1; min-width: 0; }
  .primary { margin: 0 0 0.15rem; font-size: 0.95rem; color: #1f2a1f; }
  .secondary {
    margin: 0;
    font-size: 0.85rem;
    color: #6b7a6b;
    display: flex;
    gap: 0.6rem;
    align-items: center;
  }
</style>
