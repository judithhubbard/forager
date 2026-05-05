<script lang="ts">
  import { goto } from '$app/navigation';
  import { activeRegion, regionsLoading, myRegions } from '$lib/stores/activeRegion';
  import { signOut } from '$lib/services/authService';
  import { session } from '$lib/stores/auth';
  import { listByRegion, type PinEffective } from '$lib/services/pinService';
  import { listAll as listSpecies, type Species } from '$lib/services/speciesService';
  import Map from '$lib/components/Map.svelte';
  import DropPinModal from '$lib/components/DropPinModal.svelte';

  let pins: PinEffective[] = [];
  let pinsLoading = false;
  let showDropPin = false;
  let dropPinLng: number | null = null;
  let dropPinLat: number | null = null;

  let species: Species[] = [];
  let filterSpeciesId: string | null = null;
  let filterStatus: 'active' | 'all' = 'active'; // hide gone/dormant by default

  $: filteredPins = pins.filter((p) => {
    if (filterSpeciesId && p.species_id !== filterSpeciesId) return false;
    if (filterStatus === 'active' && p.effective_status !== 'active') return false;
    return true;
  });

  // Sort species by common name; only include species that have at least
  // one pin in the active region for compactness.
  $: speciesInRegion = (() => {
    const ids = new Set(pins.map((p) => p.species_id).filter(Boolean));
    return species
      .filter((s) => ids.has(s.id))
      .sort((a, b) => a.common_name.localeCompare(b.common_name));
  })();

  $: if (!$regionsLoading && $session && $myRegions.length === 0) {
    goto('/no-regions', { replaceState: true });
  }

  // Reload pins + species when active region changes.
  $: if ($activeRegion) loadAll($activeRegion.id);

  async function loadAll(regionId: string) {
    pinsLoading = true;
    try {
      [pins, species] = await Promise.all([listByRegion(regionId), listSpecies()]);
    } catch (err) {
      console.error('[+page] loadAll error', err);
      pins = [];
      species = [];
    } finally {
      pinsLoading = false;
    }
  }

  async function handleSignOut() {
    await signOut();
    goto('/login', { replaceState: true });
  }

  function handlePinClick(e: CustomEvent<{ pinId: string }>) {
    goto(`/pins/${e.detail.pinId}`);
  }

  function handleMapTap(e: CustomEvent<{ lng: number; lat: number }>) {
    dropPinLng = e.detail.lng;
    dropPinLat = e.detail.lat;
    showDropPin = true;
  }

  function openFab() {
    dropPinLng = null;
    dropPinLat = null;
    showDropPin = true;
  }

  function handlePinSaved(_e: CustomEvent<{ id: string }>) {
    showDropPin = false;
    dropPinLng = null;
    dropPinLat = null;
    if ($activeRegion) loadAll($activeRegion.id);
  }

  function handleClose() {
    showDropPin = false;
    dropPinLng = null;
    dropPinLat = null;
  }
</script>

<header>
  <h1>Forager</h1>
  <div class="meta">
    {#if $activeRegion}
      <span class="region">{$activeRegion.name}</span>
    {/if}
    {#if pinsLoading}
      <span class="hint">Loading pins…</span>
    {:else if $activeRegion}
      <span class="hint">
        {filteredPins.length}{filteredPins.length !== pins.length ? `/${pins.length}` : ''} pins
      </span>
    {/if}
    <a class="link ripe-link" href="/ripe">Ripe now</a>
    <a class="link" href="/activity">Activity</a>
    <button class="signout" on:click={handleSignOut}>Sign out</button>
  </div>
</header>

{#if $activeRegion}
  <div class="filterbar">
    <label>
      Species:
      <select bind:value={filterSpeciesId}>
        <option value={null}>All ({speciesInRegion.length})</option>
        {#each speciesInRegion as s}
          <option value={s.id}>
            {s.common_name}
            ({pins.filter((p) => p.species_id === s.id).length})
          </option>
        {/each}
      </select>
    </label>
    <label>
      Show:
      <select bind:value={filterStatus}>
        <option value="active">Active only</option>
        <option value="all">All (incl. gone/dormant)</option>
      </select>
    </label>
  </div>

  <Map pins={filteredPins} on:pinClick={handlePinClick} on:mapTap={handleMapTap} />
  <button class="fab" on:click={openFab} aria-label="Drop a pin at my location">+</button>
  <p class="hint-banner">Tap an empty area on the map to drop a pin there.</p>
{:else if $regionsLoading}
  <main class="loading"><p>Loading…</p></main>
{/if}

{#if showDropPin && $activeRegion}
  <DropPinModal
    regionId={$activeRegion.id}
    initialLng={dropPinLng}
    initialLat={dropPinLat}
    on:close={handleClose}
    on:saved={handlePinSaved}
  />
{/if}

<style>
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
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
  .meta {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.85rem;
  }
  .region {
    color: #4a554a;
    padding: 0.2rem 0.6rem;
    background: #eaf2ea;
    border-radius: 1rem;
  }
  .hint {
    color: #6b7a6b;
  }
  .signout, .link {
    background: transparent;
    color: #6b7a6b;
    border: 0;
    cursor: pointer;
    text-decoration: underline;
    font-size: 0.85rem;
  }
  .link {
    color: #3a5a3a;
  }
  .ripe-link {
    color: #d57100;
    font-weight: 600;
  }
  main.loading {
    padding: 2rem;
    color: #6b7a6b;
  }
  .fab {
    position: fixed;
    bottom: 1.25rem;
    right: 1.25rem;
    width: 3.5rem;
    height: 3.5rem;
    border-radius: 50%;
    border: 0;
    background: #3a5a3a;
    color: white;
    font-size: 2rem;
    line-height: 1;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    cursor: pointer;
    z-index: 600;
  }
  .fab:active {
    background: #2a4a2a;
  }
  .hint-banner {
    position: fixed;
    bottom: 1.5rem;
    left: 1rem;
    margin: 0;
    padding: 0.4rem 0.75rem;
    background: rgba(255, 255, 255, 0.92);
    border-radius: 0.4rem;
    font-size: 0.8rem;
    color: #4a554a;
    z-index: 500;
    pointer-events: none;
  }
  .filterbar {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    padding: 0.5rem 1rem;
    background: #f5f8f5;
    border-bottom: 1px solid #e1e8e1;
    font-size: 0.85rem;
    color: #4a554a;
  }
  .filterbar label {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .filterbar select {
    padding: 0.25rem 0.5rem;
    font-size: 0.85rem;
    border: 1px solid #c7d0c7;
    border-radius: 0.3rem;
    background: white;
    max-width: 16rem;
  }
</style>
