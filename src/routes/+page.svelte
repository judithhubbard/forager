<script lang="ts">
  import { goto } from '$app/navigation';
  import { activeRegion, regionsLoading, myRegions } from '$lib/stores/activeRegion';
  import { signOut } from '$lib/services/authService';
  import { session } from '$lib/stores/auth';
  import { listByRegion, type PinEffective } from '$lib/services/pinService';
  import { listAll as listSpecies, type Species } from '$lib/services/speciesService';
  import Map from '$lib/components/Map.svelte';
  import DropPinModal from '$lib/components/DropPinModal.svelte';
  import PinDetailContent from '$lib/components/PinDetailContent.svelte';

  let pins: PinEffective[] = [];
  let pinsLoading = false;
  let showDropPin = false;
  let dropPinLng: number | null = null;
  let dropPinLat: number | null = null;

  let species: Species[] = [];
  let filterSpeciesId: string | null = null;
  let filterStatus: 'active' | 'all' = 'all';
  let showLegend = true;

  let selectedPinId: string | null = null;

  type Cat = 'fruit' | 'nut' | 'mushroom' | 'greens' | 'other' | 'unknown';
  type CatMap = Record<string, Cat>;

  function buildCategoryMap(speciesList: Species[]): CatMap {
    const m: CatMap = {};
    for (const s of speciesList) {
      const parts = s.forage_parts ?? [];
      let cat: Cat = 'other';
      if (parts.includes('mushroom')) cat = 'mushroom';
      else if (parts.includes('nut')) cat = 'nut';
      else if (parts.includes('fruit')) cat = 'fruit';
      else if (parts.includes('leaf') || parts.includes('shoot') || parts.includes('bulb')) cat = 'greens';
      m[s.id] = cat;
    }
    return m;
  }

  $: categoryBySpecies = buildCategoryMap(species);
  $: categoryOf = (p: PinEffective): Cat =>
    p.species_id ? categoryBySpecies[p.species_id] ?? 'unknown' : 'unknown';

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
    selectedPinId = e.detail.pinId;
  }

  function closePanel() {
    selectedPinId = null;
  }

  function onPanelStatusChanged() {
    // A status change in the open pin should refresh the map.
    if ($activeRegion) loadAll($activeRegion.id);
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

  <Map
    pins={filteredPins}
    {categoryOf}
    on:pinClick={handlePinClick}
    on:mapTap={handleMapTap}
  />

  {#if showLegend}
    <div class="legend">
      <div class="legend-header">
        <strong>Legend</strong>
        <button class="legend-toggle" on:click={() => (showLegend = false)} aria-label="Hide legend">−</button>
      </div>
      <ul>
        <li><span class="dot" style="background:#c14a3a"></span> Fruit</li>
        <li><span class="dot" style="background:#7a5230"></span> Nut</li>
        <li><span class="dot" style="background:#8a4ea0"></span> Mushroom</li>
        <li><span class="dot" style="background:#6ba040"></span> Greens (ramps, asparagus, mint)</li>
        <li><span class="dot" style="background:#5a7a3a"></span> Other (root, spice, bark)</li>
        <li><span class="dot ring" style="background:#c14a3a; outline-color:#d57100"></span> Ripe now (any color)</li>
        <li><span class="dot faded" style="background:#c14a3a"></span> Gone / dormant (faded)</li>
      </ul>
    </div>
  {:else}
    <button class="legend-show" on:click={() => (showLegend = true)}>Legend</button>
  {/if}
  <button class="fab" on:click={openFab} aria-label="Drop a pin at my location">+</button>
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

{#if selectedPinId}
  <aside class="pin-panel" role="dialog" aria-label="Pin detail">
    <header class="panel-header">
      <h2>Pin</h2>
      <div class="panel-actions">
        <a class="link" href={`/pins/${selectedPinId}`} title="Open in full page">↗</a>
        <button class="close" on:click={closePanel} aria-label="Close">×</button>
      </div>
    </header>
    <PinDetailContent pinId={selectedPinId} on:statusChanged={onPanelStatusChanged} />
  </aside>
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

  /* Pin detail side panel */
  .pin-panel {
    position: fixed;
    top: 100px; /* below header (56) + filter bar (~44) */
    right: 0;
    bottom: 0;
    width: min(28rem, 100%);
    background: white;
    box-shadow: -4px 0 12px rgba(0, 0, 0, 0.15);
    z-index: 700;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  @media (max-width: 640px) {
    .pin-panel {
      top: auto;
      height: 70vh;
    }
  }
  .panel-header {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem 0.5rem 1rem;
    background: #fafcf6;
    border-bottom: 1px solid #e1e8e1;
  }
  .panel-header h2 {
    margin: 0;
    font-size: 1rem;
    color: #3a5a3a;
  }
  .panel-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .panel-actions .link {
    font-size: 1.05rem;
    text-decoration: none;
    color: #3a5a3a;
    padding: 0.2rem 0.4rem;
  }
  .panel-actions .close {
    background: transparent;
    border: 0;
    font-size: 1.5rem;
    color: #6b7a6b;
    cursor: pointer;
    line-height: 1;
    padding: 0 0.25rem;
  }
  .pin-panel :global(.content) {
    flex: 1;
    overflow-y: auto;
  }

  /* Legend */
  .legend {
    position: fixed;
    bottom: 1rem;
    left: 1rem;
    z-index: 600;
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid #d0d8d0;
    border-radius: 0.4rem;
    padding: 0.5rem 0.75rem;
    font-size: 0.8rem;
    color: #1f2a1f;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
    max-width: 14rem;
  }
  .legend-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.4rem;
  }
  .legend-toggle {
    background: transparent;
    border: 0;
    font-size: 1rem;
    cursor: pointer;
    color: #6b7a6b;
    padding: 0 0.25rem;
    line-height: 1;
  }
  .legend ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .legend .dot {
    display: inline-block;
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 50%;
    margin-right: 0.4rem;
    vertical-align: middle;
  }
  .legend .dot.ring {
    outline: 2px solid;
    outline-offset: 1px;
  }
  .legend .dot.faded {
    opacity: 0.4;
  }
  .legend-show {
    position: fixed;
    bottom: 1rem;
    left: 1rem;
    z-index: 600;
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid #d0d8d0;
    border-radius: 0.4rem;
    padding: 0.4rem 0.75rem;
    font-size: 0.8rem;
    color: #3a5a3a;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  }
</style>
