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
  /** Species filter:
   *   null     → no filter, show all species
   *   Set([…]) → show only listed species (empty set = show none) */
  let selectedSpeciesIds: Set<string> | null = null;
  let speciesPanelOpen = false;
  /** Tab in the species panel — filters which species are LISTED (not which
   *  are selected). Selection persists across tab switches. */
  type SpeciesTab = 'all' | 'fruit' | 'nut' | 'mushroom' | 'greens' | 'other';
  let speciesTab: SpeciesTab = 'all';
  const SPECIES_TABS: { k: SpeciesTab; label: string }[] = [
    { k: 'all',      label: 'All' },
    { k: 'fruit',    label: 'Fruit' },
    { k: 'nut',      label: 'Nut' },
    { k: 'mushroom', label: 'Mushroom' },
    { k: 'greens',   label: 'Greens' },
    { k: 'other',    label: 'Other' }
  ];

  /** Friendly group label per genus. Falls back to the genus itself if not
   *  in the mapping. Drives the indented sub-list in the species panel.
   *  Apple + Pear share a group; Almond is split out from the rest of
   *  Prunus because foragers treat it differently from cherries / plums. */
  const GROUP_LABELS: Record<string, string> = {
    Amelanchier: 'Serviceberry',
    Asimina: 'Pawpaw',
    Carya: 'Hickory',
    Castanea: 'Chestnut',
    Cornus: 'Cornelian cherry',
    Corylus: 'Hazelnut',
    Diospyros: 'Persimmon',
    Juglans: 'Walnut',
    Malus: 'Apple / Pear',
    Pyrus: 'Apple / Pear',
    Mentha: 'Mint',
    Morus: 'Mulberry',
    Prunus: 'Cherry / Plum',
    Ribes: 'Currant',
    Rubus: 'Bramble',
    Sambucus: 'Elderberry',
    Vaccinium: 'Blueberry',
    Elaeagnus: 'Autumn olive',
    Allium: 'Ramps / wild leek',
    Asparagus: 'Asparagus',
    Vitis: 'Grape',
    Cantharellus: 'Chanterelle',
    Morchella: 'Morel'
  };
  function groupOf(s: Species): string {
    // Specific species overrides (almond split out from other Prunus).
    if (s.scientific_name === 'Prunus dulcis') return 'Almond';
    const genus = s.scientific_name.split(/\s+/)[0];
    return GROUP_LABELS[genus] ?? genus;
  }

  /** Group a flat species list by genus label, sorted alphabetically. */
  function groupSpecies(list: Species[]): [string, Species[]][] {
    const m: Record<string, Species[]> = {};
    for (const s of list) {
      const g = groupOf(s);
      if (!m[g]) m[g] = [];
      m[g].push(s);
    }
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]));
  }

  $: filteredSpeciesList = speciesInRegion.filter(
    (s) => speciesTab === 'all' || (categoryBySpecies[s.id] ?? 'other') === speciesTab
  );
  $: groupedSpecies = groupSpecies(filteredSpeciesList);
  let filterStatus:
    | 'all'
    | 'active'
    | 'possibly_ripe'
    | 'confirmed_ripe'
    | 'confirmed_harvest'
    | 'best_2_plus'
    | 'best_3_plus'
    | 'best_4_plus' = 'active';
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

  $: speciesById = (() => {
    const m: Record<string, Species> = {};
    for (const s of species) m[s.id] = s;
    return m;
  })();

  function labelOf(p: PinEffective): string {
    const s = p.species_id ? speciesById[p.species_id] : null;
    const name = p.display_name ?? s?.common_name ?? '(unnamed pin)';
    const status =
      p.effective_status === 'active' ? '' : ` [${p.effective_status}]`;
    const ripe = p.is_ripe_now ? '  · 🍒 ripe now' : '';
    return `${name}${status}${ripe}`;
  }

  $: filteredPins = pins.filter((p) => {
    // Species filter
    if (selectedSpeciesIds !== null) {
      if (!p.species_id || !selectedSpeciesIds.has(p.species_id)) return false;
    }
    // Status filter — progressively narrower
    if (filterStatus === 'all') return true;

    // 'active' = exists, hasn't been marked gone/dormant/needs_verification.
    // Accessibility (out_of_reach, inaccessible, fenced, private_property) is
    // a hazard tag, not a status — those pins still count as active.
    const isActive = p.effective_status === 'active';
    if (!isActive) return false;
    if (filterStatus === 'active') return true;

    if (filterStatus === 'possibly_ripe') return p.is_ripe_now === true;
    if (filterStatus === 'confirmed_ripe') return p.has_ripe_observation_this_year === true;
    if (filterStatus === 'confirmed_harvest') return p.has_ripe_observation_ever === true;
    if (filterStatus === 'best_2_plus') return (p.best_harvest_quality ?? 0) >= 2;
    if (filterStatus === 'best_3_plus') return (p.best_harvest_quality ?? 0) >= 3;
    if (filterStatus === 'best_4_plus') return (p.best_harvest_quality ?? 0) >= 4;
    return true;
  });

  // Reactive function so checkboxes re-render when selectedSpeciesIds changes.
  $: isSelected = (id: string) =>
    selectedSpeciesIds === null || selectedSpeciesIds.has(id);

  function toggleSpecies(id: string) {
    let next: Set<string>;
    if (selectedSpeciesIds === null) {
      // Currently "all"; un-checking one means "all except this one".
      next = new Set(speciesInRegion.map((s) => s.id));
      next.delete(id);
    } else {
      next = new Set(selectedSpeciesIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
    }
    selectedSpeciesIds = next;
  }
  function clearSpecies() {
    // Explicit empty: show no species.
    selectedSpeciesIds = new Set();
  }
  function selectAllSpecies() {
    // Back to "all" (no filter).
    selectedSpeciesIds = null;
  }

  // Sort species by common name; only include species that have at least
  // one pin in the active region for compactness.
  // Order categories so the panel groups fruits, then nuts, then mushrooms,
  // then greens, then other. Within a category, sort by scientific name so
  // same-genus species cluster (all Amelanchier together, etc).
  const CATEGORY_ORDER: Record<string, number> = {
    fruit: 0, nut: 1, mushroom: 2, greens: 3, other: 4, unknown: 5
  };
  $: speciesInRegion = (() => {
    const ids = new Set(pins.map((p) => p.species_id).filter(Boolean));
    return species
      .filter((s) => ids.has(s.id))
      .sort((a, b) => {
        const ca = CATEGORY_ORDER[categoryBySpecies[a.id] ?? 'unknown'] ?? 9;
        const cb = CATEGORY_ORDER[categoryBySpecies[b.id] ?? 'unknown'] ?? 9;
        if (ca !== cb) return ca - cb;
        return a.scientific_name.localeCompare(b.scientific_name);
      });
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
    <div class="species-filter">
      <button
        class="species-toggle"
        on:click={() => (speciesPanelOpen = !speciesPanelOpen)}
      >
        Species:
        {#if selectedSpeciesIds === null}
          All ({speciesInRegion.length})
        {:else if selectedSpeciesIds.size === 0}
          None
        {:else}
          {selectedSpeciesIds.size} selected
        {/if}
        <span class="caret">{speciesPanelOpen ? '▴' : '▾'}</span>
      </button>

      {#if speciesPanelOpen}
        <div class="species-panel">
          <div class="species-panel-actions">
            <button on:click={selectAllSpecies}>Select all</button>
            <button on:click={clearSpecies}>Clear</button>
            <button on:click={() => (speciesPanelOpen = false)}>Done</button>
          </div>
          <div class="species-tabs" role="tablist">
            {#each SPECIES_TABS as tab}
              {@const count = speciesInRegion.filter(
                (s) => tab.k === 'all' || (categoryBySpecies[s.id] ?? 'other') === tab.k
              ).length}
              {#if tab.k === 'all' || count > 0}
                <button
                  class="species-tab"
                  class:active={speciesTab === tab.k}
                  on:click={() => (speciesTab = tab.k)}
                >
                  {tab.label} <span class="count">{count}</span>
                </button>
              {/if}
            {/each}
          </div>
          <ul class="species-list">
            {#each groupedSpecies as [groupName, list]}
              <li class="group-header">{groupName}</li>
              {#each list as s}
                <li class="indented">
                  <label>
                    <input
                      type="checkbox"
                      checked={isSelected(s.id)}
                      on:change={() => toggleSpecies(s.id)}
                    />
                    <span class="cat-dot" class:fruit={categoryBySpecies[s.id] === 'fruit'}
                      class:nut={categoryBySpecies[s.id] === 'nut'}
                      class:mushroom={categoryBySpecies[s.id] === 'mushroom'}
                      class:greens={categoryBySpecies[s.id] === 'greens'}></span>
                    {s.common_name}
                    <span class="count">({pins.filter((p) => p.species_id === s.id).length})</span>
                  </label>
                </li>
              {/each}
            {/each}
          </ul>
        </div>
      {/if}
    </div>
    <label>
      Show:
      <select bind:value={filterStatus}>
        <option value="all">All (incl. gone/dormant)</option>
        <option value="active">Active</option>
        <option value="possibly_ripe">Possibly ripe today</option>
        <option value="confirmed_ripe">Confirmed ripe this year</option>
        <option value="confirmed_harvest">Confirmed harvest history</option>
        <option value="best_2_plus">Best harvest ≥ 2★</option>
        <option value="best_3_plus">Best harvest ≥ 3★</option>
        <option value="best_4_plus">Best harvest ≥ 4★</option>
      </select>
    </label>
  </div>

  <Map
    pins={filteredPins}
    {categoryOf}
    {labelOf}
    on:pinClick={handlePinClick}
    on:mapTap={handleMapTap}
  />

  {#if !selectedPinId}
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
  {/if}
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

  /* Multi-select species filter */
  .species-filter {
    position: relative;
  }
  .species-toggle {
    padding: 0.3rem 0.7rem;
    font-size: 0.85rem;
    border: 1px solid #c7d0c7;
    border-radius: 0.3rem;
    background: white;
    color: #1f2a1f;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .caret {
    color: #6b7a6b;
    font-size: 0.7rem;
  }
  .species-panel {
    position: absolute;
    top: calc(100% + 0.25rem);
    left: 0;
    /* Above Leaflet's zoom controls (z-index ~1000). */
    z-index: 1100;
    background: white;
    border: 1px solid #d0d8d0;
    border-radius: 0.4rem;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15);
    width: 18rem;
    max-height: 70vh;
    display: flex;
    flex-direction: column;
  }
  .species-panel-actions {
    flex: 0 0 auto;
    display: flex;
    gap: 0.4rem;
    padding: 0.5rem;
    border-bottom: 1px solid #ebefeb;
  }
  .species-panel-actions button {
    padding: 0.3rem 0.6rem;
    font-size: 0.8rem;
    border: 1px solid #c7d0c7;
    border-radius: 0.3rem;
    background: white;
    cursor: pointer;
  }
  .species-tabs {
    flex: 0 0 auto;
    display: flex;
    gap: 0.15rem;
    padding: 0.35rem 0.4rem;
    border-bottom: 1px solid #ebefeb;
    overflow-x: auto;
  }
  .species-tab {
    padding: 0.25rem 0.55rem;
    font-size: 0.78rem;
    border: 0;
    background: transparent;
    color: #4a554a;
    cursor: pointer;
    border-radius: 0.3rem;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }
  .species-tab .count {
    color: #8a948a;
    margin-left: 0;
    font-size: 0.72rem;
  }
  .species-tab.active {
    background: #3a5a3a;
    color: white;
  }
  .species-tab.active .count {
    color: rgba(255,255,255,0.8);
  }
  .species-panel ul {
    list-style: none;
    margin: 0;
    padding: 0.15rem 0;
    overflow-y: auto;
  }
  .species-panel li {
    padding: 0 0.5rem;
  }
  .species-panel li.group-header {
    padding: 0.35rem 0.5rem 0.05rem;
    font-size: 0.74rem;
    font-weight: 600;
    color: #3a5a3a;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .species-panel li.group-header:first-child {
    padding-top: 0.1rem;
  }
  .species-panel li.indented {
    padding-left: 1.4rem;
  }
  .species-panel label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.82rem;
    line-height: 1.2;
    cursor: pointer;
    padding: 0.1rem 0.2rem;
    border-radius: 0.2rem;
  }
  .species-panel label:hover {
    background: #f5f8f5;
  }
  .species-panel .count {
    color: #8a948a;
    margin-left: auto;
    font-size: 0.75rem;
  }
  .species-panel input[type='checkbox'] {
    margin: 0;
    width: 0.85rem;
    height: 0.85rem;
  }
  .cat-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: #6b7a6b;
    flex: 0 0 auto;
  }
  .cat-dot.fruit { background: #c14a3a; }
  .cat-dot.nut { background: #7a5230; }
  .cat-dot.mushroom { background: #8a4ea0; }
  .cat-dot.greens { background: #6ba040; }

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
