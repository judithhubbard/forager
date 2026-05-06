<script lang="ts">
  import { goto } from '$lib/utils/nav';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { activeRegion, regionsLoading, myRegions } from '$lib/stores/activeRegion';
  import { session } from '$lib/stores/auth';
  import { listByRegion, type PinEffective } from '$lib/services/pinService';
  import { listAll as listSpecies, type Species } from '$lib/services/speciesService';
  import Map from '$lib/components/Map.svelte';
  import DropPinModal from '$lib/components/DropPinModal.svelte';
  import PinDetailContent from '$lib/components/PinDetailContent.svelte';
  import ToolsMenu from '$lib/components/ToolsMenu.svelte';

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
  type SpeciesTab = 'all' | 'fruit' | 'nut' | 'mushroom' | 'other';
  let speciesTab: SpeciesTab = 'all';
  const SPECIES_TABS: { k: SpeciesTab; label: string }[] = [
    { k: 'all',      label: 'All' },
    { k: 'fruit',    label: 'Fruit' },
    { k: 'nut',      label: 'Nut' },
    { k: 'mushroom', label: 'Mushroom' },
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
    Morus: 'Mulberry',
    Prunus: 'Cherry / Plum',
    Ribes: 'Currant',
    Rubus: 'Bramble',
    Sambucus: 'Elderberry',
    Vaccinium: 'Blueberry',
    Elaeagnus: 'Autumn olive',
    Vitis: 'Grape',
    // Mushrooms collapsed into one bucket.
    Cantharellus: 'Mushroom',
    Morchella: 'Mushroom',
    // Misc edibles collapsed into "Other".
    Allium: 'Other',
    Asparagus: 'Other',
    Mentha: 'Other'
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

  // Temporary symbol-style picker so the user can compare options live.
  // Pick one and we'll bake it in as the default; remove the picker.
  let symbolStyle: 'circle' | 'shape' | 'letter' | 'emoji' = 'circle';

  let selectedPinId: string | null = null;

  type Cat = 'fruit' | 'nut' | 'mushroom' | 'other' | 'unknown';
  type CatMap = Record<string, Cat>;

  function buildCategoryMap(speciesList: Species[]): CatMap {
    const m: CatMap = {};
    for (const s of speciesList) {
      const parts = s.forage_parts ?? [];
      let cat: Cat = 'other';
      if (parts.includes('mushroom')) cat = 'mushroom';
      else if (parts.includes('nut')) cat = 'nut';
      else if (parts.includes('fruit')) cat = 'fruit';
      // everything else (leaf, shoot, bulb, root, spice, bark, …) → 'other'
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

  /** Which legend rows are worth showing — only categories actually
   *  present in the visible pin set, plus ripe/possibly indicators only
   *  if any pin currently has them, plus the gone/dormant row only when
   *  the user is showing all statuses. */
  $: legendShows = (() => {
    const cats = { fruit: false, nut: false, mushroom: false, other: false };
    let ripe = false, possibly = false, gone = false;
    for (const p of filteredPins) {
      const cat = p.species_id ? categoryBySpecies[p.species_id] : null;
      if (cat === 'fruit') cats.fruit = true;
      else if (cat === 'nut') cats.nut = true;
      else if (cat === 'mushroom') cats.mushroom = true;
      else cats.other = true;
      if (p.is_ripe_strict) ripe = true;
      else if (p.is_ripe_now) possibly = true;
      if (p.effective_status === 'gone' || p.effective_status === 'dormant') gone = true;
    }
    return {
      fruit: cats.fruit,
      nut: cats.nut,
      mushroom: cats.mushroom,
      other: cats.other,
      ripe,
      possibly,
      // Gone/dormant only shows when the user is actually viewing them.
      gone: gone && filterStatus === 'all'
    };
  })();

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

  // Deep-link: /?pin=ID opens that pin's detail panel on load. Used by
  // the harvest-windows drill-down to "Open pin" → land here.
  $: {
    const want = $page.url.searchParams.get('pin');
    if (want && want !== selectedPinId) selectedPinId = want;
  }

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

  /** Open the drop-pin modal with no preset coordinates — DropPinModal
   *  starts in 'capturing' mode and uses GPS. Used by the desktop "+"
   *  button since right-click works but isn't very discoverable. */
  function handleNewPinClick() {
    dropPinLng = null;
    dropPinLat = null;
    showDropPin = true;
  }
</script>

<header>
  <h1>Forager</h1>
  {#if $activeRegion}
    <span class="region-badge">{$activeRegion.name}</span>
  {/if}
  <div class="meta">
    {#if pinsLoading}
      <span class="hint">Loading…</span>
    {/if}
    <a class="link ripe-link" href={base + '/ripe'}>Ripe now</a>
    <ToolsMenu />
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
                      class:other={categoryBySpecies[s.id] === 'other'}></span>
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
    <!-- Temporary symbol-style picker. Will be removed once a style is chosen. -->
    <label>
      Symbols:
      <select bind:value={symbolStyle}>
        <option value="circle">● Circles (current)</option>
        <option value="shape">●■▲◆ Shapes per category</option>
        <option value="letter">F/N/M/O letters</option>
        <option value="emoji">🍒🌰🍄🌿 Emoji</option>
      </select>
    </label>
  </div>

  <Map
    pins={filteredPins}
    {categoryOf}
    {labelOf}
    {symbolStyle}
    hideLocate={!!selectedPinId}
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
          {#if legendShows.fruit}<li><span class="dot" style="background:#c14a3a"></span> Fruit</li>{/if}
          {#if legendShows.nut}<li><span class="dot" style="background:#7a5230"></span> Nut</li>{/if}
          {#if legendShows.mushroom}<li><span class="dot" style="background:#8a4ea0"></span> Mushroom</li>{/if}
          {#if legendShows.other}<li><span class="dot" style="background:#6ba040"></span> Other</li>{/if}
          {#if legendShows.ripe}<li><span class="ring1"></span> Ripe</li>{/if}
          {#if legendShows.possibly}<li><span class="ring2"></span> Possibly ripe</li>{/if}
          {#if legendShows.gone}<li><span class="dot faded" style="background:#c14a3a"></span> Gone / dormant</li>{/if}
        </ul>
      </div>
    {:else}
      <button class="legend-show" on:click={() => (showLegend = true)}>Legend</button>
    {/if}
  {/if}
{:else if $regionsLoading}
  <main class="loading"><p>Loading…</p></main>
{/if}

{#if $activeRegion && !selectedPinId}
  <button
    class="new-pin-fab"
    on:click={handleNewPinClick}
    aria-label="New pin"
    title="Add a new pin"
  >+</button>
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
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }
  header h1::before {
    content: '';
    display: inline-block;
    width: 1.8rem;
    height: 1.8rem;
    /* The silhouette runs to the very edge of the PNG, so 'contain' would
       show it touching the icon border. Shrink the image to ~72% of the
       container so the matching teal background forms a visible frame
       around the figure on all four sides. */
    background-color: #356b66;
    background-image: url('/icon.png');
    background-size: 72%;
    background-position: center;
    background-repeat: no-repeat;
    border-radius: 0.3rem;
    flex-shrink: 0;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.85rem;
    margin-left: auto;
  }
  /* Active region sits next to the title, in a small bordered chip. */
  .region-badge {
    padding: 0.15rem 0.55rem;
    border: 1px solid #c7d0c7;
    background: #f5f8f5;
    border-radius: 0.35rem;
    font-size: 0.78rem;
    color: #3a5a3a;
    line-height: 1.2;
  }
  /* Floating "+" pin button — desktop only. On touch devices the
     long-press gesture takes its place, so we hide it via the
     coarse-pointer media query to avoid clutter on phones. */
  .new-pin-fab {
    position: fixed;
    bottom: 1.25rem;
    right: 1.25rem;
    width: 3.25rem;
    height: 3.25rem;
    border-radius: 50%;
    border: 0;
    background: #3a5a3a;
    color: white;
    font-size: 2rem;
    line-height: 1;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    cursor: pointer;
    z-index: 600;
    display: none;
  }
  .new-pin-fab:active { background: #2a4a2a; }
  @media (pointer: fine) {
    .new-pin-fab { display: inline-flex; align-items: center; justify-content: center; }
  }
  .hint {
    color: #6b7a6b;
  }
  .link {
    background: transparent;
    color: #3a5a3a;
    border: 0;
    cursor: pointer;
    text-decoration: underline;
    font-size: 0.85rem;
  }
  .ripe-link {
    color: #d57100;
    font-weight: 600;
  }

  main.loading {
    padding: 2rem;
    color: #6b7a6b;
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
  .cat-dot.other { background: #6ba040; }

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
    /* Keep filters on a single row on phones (was wrapping to two). */
    .filterbar {
      flex-wrap: nowrap;
      gap: 0.5rem;
      padding: 0.4rem 0.6rem;
      font-size: 0.78rem;
    }
    .filterbar select {
      max-width: none;
      flex: 1;
      min-width: 0;
      font-size: 0.78rem;
      padding: 0.2rem 0.35rem;
    }
    .filterbar label {
      flex: 1 1 auto;
      min-width: 0;
    }
    .species-toggle { font-size: 0.78rem; padding: 0.2rem 0.5rem; }
    /* Tighter, smaller legend on mobile so it stops dominating the map. */
    .legend {
      bottom: 0.5rem;
      left: 0.5rem;
      padding: 0.35rem 0.55rem;
      font-size: 0.72rem;
      max-width: 9.5rem;
    }
    .legend ul { gap: 0.18rem; }
    .legend .dot { width: 0.6rem; height: 0.6rem; margin-right: 0.3rem; }
    .legend .ring1, .legend .ring2 {
      width: 0.7rem; height: 0.7rem; margin-right: 0.3rem;
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
  .legend .dot.faded { opacity: 0.4; }
  .legend .ring1, .legend .ring2 {
    display: inline-block;
    width: 0.95rem; height: 0.95rem;
    margin-right: 0.4rem;
    vertical-align: middle;
    background: #c14a3a;
    border-radius: 50%;
    border: 1.5px solid white;
  }
  /* Ripe: bold solid double-ring (matches the map's strict-ripe pin). */
  .legend .ring1 {
    box-shadow:
      0 0 0 2.2px #d57100,
      0 0 0 3.4px white,
      0 0 0 4.4px rgba(213, 113, 0, 0.65);
  }
  /* Possibly ripe: a single faint dashed halo (matches the map). */
  .legend .ring2 {
    outline: 1.5px dashed #d57100;
    outline-offset: 1.5px;
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
