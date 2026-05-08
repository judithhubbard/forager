<script lang="ts">
  import { onDestroy } from 'svelte';
  import { goto } from '$lib/utils/nav';
  import { base } from '$app/paths';
  import { activeRegion } from '$lib/stores/activeRegion';
  import {
    listRipeNow,
    haversineMeters,
    type PinEffective
  } from '$lib/services/pinService';
  import { listAll as listSpecies, type Species } from '$lib/services/speciesService';
  import { panelSelection } from '$lib/stores/panelSelection';

  let pins: PinEffective[] = [];
  let allSpecies: Species[] = [];
  let speciesById = new Map<string, Species>();
  let loading = true;
  let errorMessage = '';

  // User location for distance-to-nearest-pin sort.
  let userLng: number | null = null;
  let userLat: number | null = null;
  let watchId: number | null = null;

  $: if ($activeRegion) load($activeRegion.id);
  $: speciesById = new Map(allSpecies.map((s) => [s.id, s]));

  /** Group pins by species_id, summarizing per species. Pins with
   *  no species_id (free-typed pins) get bucketed under the
   *  display_name as a single anonymous group. */
  $: groups = (() => {
    const out = new Map<
      string,
      {
        speciesId: string | null;
        species: Species | null;
        displayName: string;
        forageParts: string[];
        pinCount: number;
        nearestDistance: number;
        nearestPinId: string;
      }
    >();
    for (const p of pins) {
      // v_pin_effective always returns a valid id; defensive guard
      // for the type system.
      const pinId = p.id ?? '';
      if (!pinId) continue;
      const key = p.species_id ?? `__free:${p.display_name ?? 'Unnamed'}`;
      const sp = p.species_id ? speciesById.get(p.species_id) ?? null : null;
      const dist = distanceToUser(p);
      const existing = out.get(key);
      if (existing) {
        existing.pinCount += 1;
        if (dist < existing.nearestDistance) {
          existing.nearestDistance = dist;
          existing.nearestPinId = pinId;
        }
      } else {
        out.set(key, {
          speciesId: p.species_id ?? null,
          species: sp,
          displayName:
            sp?.common_name ?? p.display_name ?? 'Unnamed',
          forageParts: (sp?.forage_parts ?? []) as string[],
          pinCount: 1,
          nearestDistance: dist,
          nearestPinId: pinId
        });
      }
    }
    return Array.from(out.values()).sort((a, b) => {
      // Sort by nearest distance when location available, else by
      // pin count desc.
      if (userLng != null && userLat != null) {
        return a.nearestDistance - b.nearestDistance;
      }
      return b.pinCount - a.pinCount;
    });
  })();

  function distanceToUser(p: PinEffective): number {
    if (p.lng == null || p.lat == null || userLng == null || userLat == null) return Infinity;
    return haversineMeters(
      { lng: userLng, lat: userLat },
      { lng: p.lng, lat: p.lat }
    );
  }

  function fmtDistance(m: number): string {
    if (!isFinite(m)) return '';
    if (m < 1000) return `${Math.round(m)} m`;
    return `${(m / 1000).toFixed(1)} km`;
  }

  function fmtParts(parts: string[]): string {
    if (parts.length === 0) return '';
    // Replace internal labels with friendly ones.
    const labels: Record<string, string> = {
      fruit: 'fruit',
      flower: 'flowers',
      leaf: 'leaves',
      shoot: 'shoots',
      bark: 'bark',
      sap: 'sap',
      seed: 'seeds',
      nut: 'nuts',
      bulb: 'bulbs',
      stem: 'stems',
      root: 'roots',
      mushroom: 'fruiting body'
    };
    return parts.map((p) => labels[p] ?? p).join(', ');
  }

  function showOnMap(speciesId: string | null) {
    if (speciesId) {
      panelSelection.set(new Set([speciesId]));
    }
    goto('/');
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
  {:else if groups.length === 0}
    <p class="hint">
      Nothing is in its ripe window in this region right now. Check the
      <a href={base + '/activity'}>Activity</a> feed or wait a few weeks.
    </p>
  {:else}
    {#if userLng == null || userLat == null}
      <p class="hint small">
        Allow location to see distances and sort by closest.
      </p>
    {/if}
    <ul class="species-list">
      {#each groups as g}
        <li>
          <div class="row">
            <span class="dot" aria-hidden="true">●</span>
            <a class="body" href={g.speciesId ? `${base}/species/${g.speciesId}` : `${base}/pins/${g.nearestPinId}`}>
              <p class="primary">
                <strong>{g.displayName}</strong>
                <span class="count">·&nbsp;{g.pinCount} {g.pinCount === 1 ? 'pin' : 'pins'}</span>
              </p>
              <p class="secondary">
                {#if g.forageParts.length > 0}
                  <span>edible: {fmtParts(g.forageParts)}</span>
                {/if}
                {#if userLng != null && userLat != null && isFinite(g.nearestDistance)}
                  <span class="muted">{fmtDistance(g.nearestDistance)} to nearest</span>
                {/if}
              </p>
            </a>
            {#if g.speciesId}
              <button class="map-btn" on:click={() => showOnMap(g.speciesId)} title="Filter map to this species">
                Show on map
              </button>
            {/if}
          </div>
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

  ul.species-list { list-style: none; padding: 0; margin: 0; }
  ul.species-list li { border-bottom: 1px solid #ebefeb; }
  .row {
    display: flex;
    gap: 0.75rem;
    padding: 0.85rem 0.25rem;
    align-items: center;
  }
  .row:hover { background: #fff8ee; }
  .dot {
    color: #d57100;
    font-size: 1.5rem;
    line-height: 1;
  }
  a.body {
    flex: 1;
    min-width: 0;
    text-decoration: none;
    color: inherit;
  }
  .primary {
    margin: 0 0 0.15rem;
    font-size: 0.95rem;
    color: #1f2a1f;
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    align-items: baseline;
  }
  .count { color: #6b7a6b; font-size: 0.85rem; font-weight: normal; }
  .secondary {
    margin: 0;
    font-size: 0.85rem;
    color: #6b7a6b;
    display: flex;
    gap: 0.6rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .map-btn {
    background: white;
    border: 1px solid #d57100;
    color: #d57100;
    border-radius: 4px;
    padding: 0.35rem 0.6rem;
    font-size: 0.8rem;
    cursor: pointer;
    white-space: nowrap;
  }
  .map-btn:hover { background: #fff4e3; }
</style>
