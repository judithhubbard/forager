<script lang="ts">
  // Calibration viewer — review per-(species, climate-zone) harvest windows
  // across data sources (current AI-propagated DB content vs Layer 2 regional
  // guides vs eventually Layer 1 NPN empirical). Helps spot gaps,
  // disagreements, and provenance per cell.
  //
  // Two visual layers per zone row:
  //   - gray bar: current species_fruiting_windows DB content (AI-derived)
  //   - orange bar: Layer 2 regional guide bracket
  //   - (Layer 1 peak markers will land here when NPN ingestion runs)
  //
  // Keyboard: ← → arrows step through species. / focuses search.

  import { onMount } from 'svelte';
  import { goto } from '$lib/utils/nav';
  import { supabase } from '$lib/supabase';
  import { activeRegion } from '$lib/stores/activeRegion';
  import regionalWindowsJson from '$lib/data/regional-windows.json';

  type Stage = 'flowering' | 'green' | 'ripening' | 'ripe' | 'past' | 'bare' | 'unknown';

  interface SpeciesRow {
    id: string;
    common_name: string;
    scientific_name: string;
  }

  interface ZoneRow {
    id: string;
    code: string;
    name: string;
  }

  interface DBWindow {
    species_id: string;
    climate_zone_id: string;
    stage: Stage;
    start_doy: number | null;
    end_doy: number | null;
    peak_doy: number | null;
    confidence: string | null;
    notes: string | null;
  }

  interface JsonWindow {
    ripe?: { start_doy: number; end_doy: number; notes?: string };
    flowering?: { start_doy: number; end_doy: number; notes?: string };
    notes?: string;
  }

  interface JsonRegion {
    zone_codes: string[];
    lat: number;
    lng: number;
    source: string;
    source_url: string;
    license_note: string;
    windows: Record<string, JsonWindow>;
  }

  $: isAdmin = $activeRegion?.role === 'admin';

  let species: SpeciesRow[] = [];
  let zones: ZoneRow[] = [];
  let dbWindows: DBWindow[] = [];
  let loaded = false;
  let errorMsg = '';

  // Currently-selected species (id)
  let currentSpeciesId: string | null = null;
  let searchTerm = '';
  let searchInput: HTMLInputElement;

  const regionalData = regionalWindowsJson as { regions: Record<string, JsonRegion> };

  /** Map JSON region name → record. Sorted by coldest min zone first
   *  (matches the per-zone order on screen). */
  $: regionsByName = regionalData.regions;

  onMount(async () => {
    try {
      const [speciesRes, zonesRes, windowsRes] = await Promise.all([
        supabase.from('species').select('id, common_name, scientific_name').order('common_name'),
        supabase.from('climate_zones').select('id, code, name').order('code'),
        supabase
          .from('species_fruiting_windows')
          .select('species_id, climate_zone_id, stage, start_doy, end_doy, peak_doy, confidence, notes')
      ]);
      if (speciesRes.error) throw speciesRes.error;
      if (zonesRes.error) throw zonesRes.error;
      if (windowsRes.error) throw windowsRes.error;
      species = (speciesRes.data ?? []) as SpeciesRow[];
      zones = (zonesRes.data ?? []) as ZoneRow[];
      // Cast via unknown — generated types don't yet include confidence/peak_doy
      // columns that mig #46 added.
      dbWindows = (windowsRes.data ?? []) as unknown as DBWindow[];

      // Default to first species with data, otherwise first species.
      const speciesWithData = new Set(dbWindows.map((w) => w.species_id));
      currentSpeciesId =
        species.find((s) => speciesWithData.has(s.id))?.id ?? species[0]?.id ?? null;
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Failed to load.';
    } finally {
      loaded = true;
    }
  });

  // Filtered species list for the search box.
  $: filteredSpecies = !searchTerm
    ? species
    : species.filter((s) => {
        const t = searchTerm.toLowerCase();
        return (
          s.common_name?.toLowerCase().includes(t) ||
          s.scientific_name?.toLowerCase().includes(t)
        );
      });

  $: currentSpecies = species.find((s) => s.id === currentSpeciesId) ?? null;

  /** Climate-zone code natural sort: 3a < 3b < 4a < … < 11b. */
  function zoneSortKey(code: string): number {
    const m = code.match(/^(\d+)([ab]?)$/);
    if (!m) return 99;
    const num = parseInt(m[1], 10);
    const sub = m[2] === 'b' ? 0.5 : 0;
    return num + sub;
  }

  $: sortedZones = [...zones].sort((a, b) => zoneSortKey(a.code) - zoneSortKey(b.code));

  /** For the current species, group DB windows by zone id, by stage. */
  $: dbBySpeciesZone = (() => {
    const out = new Map<string, Map<string, DBWindow>>();
    if (!currentSpeciesId) return out;
    for (const w of dbWindows) {
      if (w.species_id !== currentSpeciesId) continue;
      const inner = out.get(w.climate_zone_id) ?? new Map<string, DBWindow>();
      inner.set(w.stage, w);
      out.set(w.climate_zone_id, inner);
    }
    return out;
  })();

  /** For the current species, find regions in the JSON that match each zone.
   *  Returns Map<climate_zone_code, Array<{regionName, jsonRegion, jsonWindow}>>. */
  $: regionsByZoneCode = (() => {
    const out = new Map<string, Array<{ regionName: string; region: JsonRegion; window: JsonWindow }>>();
    if (!currentSpecies) return out;
    const sciName = currentSpecies.scientific_name;
    for (const [regionName, region] of Object.entries(regionsByName)) {
      const w = region.windows[sciName];
      if (!w) continue;
      for (const code of region.zone_codes) {
        const arr = out.get(code) ?? [];
        arr.push({ regionName, region, window: w });
        out.set(code, arr);
      }
    }
    return out;
  })();

  /** Zones that have ANY data (DB or JSON) for this species. */
  $: zonesWithData = sortedZones.filter((z) => {
    const hasDb = dbBySpeciesZone.has(z.id);
    const hasJson = regionsByZoneCode.has(z.code);
    return hasDb || hasJson;
  });

  let showEmptyZones = false;
  $: visibleZones = showEmptyZones ? sortedZones : zonesWithData;

  function pickSpecies(id: string) {
    currentSpeciesId = id;
    searchTerm = '';
  }

  function step(delta: number) {
    if (!currentSpeciesId) return;
    const idx = species.findIndex((s) => s.id === currentSpeciesId);
    const next = species[(idx + delta + species.length) % species.length];
    if (next) currentSpeciesId = next.id;
  }

  function onKey(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (e.key === 'ArrowRight') {
      step(1);
      e.preventDefault();
    } else if (e.key === 'ArrowLeft') {
      step(-1);
      e.preventDefault();
    } else if (e.key === '/') {
      e.preventDefault();
      searchInput?.focus();
    }
  }

  // --- SVG geometry ---
  // Year axis: 0 → 365 maps to xPad → xPad+plotW.
  const xPad = 28;
  const plotW = 720;
  const ROW_H = 22;
  const STAGE_H = 6;
  const TIMELINE_H = 56;
  const totalW = xPad + plotW + 16;

  function doyX(doy: number): number {
    return xPad + (doy / 365) * plotW;
  }

  // Month tick positions: DOY for first of each month (non-leap).
  const MONTH_STARTS = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
  const MONTH_LABELS = ['J','F','M','A','M','J','J','A','S','O','N','D'];

  /** Color per stage so the bars are distinguishable. */
  function stageColor(stage: Stage): string {
    switch (stage) {
      case 'flowering': return '#d199e3';
      case 'green':     return '#85c285';
      case 'ripening':  return '#e8b04a';
      case 'ripe':      return '#c84545';
      case 'past':      return '#7a7a7a';
      default:          return '#bbb';
    }
  }

  /** Honest labels for the two `confidence` values currently in the DB.
   *  Neither is real human curation — both originate from AI-seeded
   *  `data/species/ithaca.json` (5b) plus heuristic propagation
   *  (frost-offset shifts to other zones, or literal copy to 6a). */
  function confidenceLabel(c: string | null | undefined): string {
    if (c === 'curated') return 'AI-seeded (Ithaca 5b)';
    if (c === 'frost_offset') return 'frost-shifted';
    return c ?? '';
  }
  function confidenceTitle(c: string | null | undefined): string {
    if (c === 'curated') return 'Provenance: data/species/ithaca.json — AI-generated in an earlier session, not verified against a primary source. Zone 6a values are literal copies of 5b.';
    if (c === 'frost_offset') return 'Provenance: heuristic shift of the 5b values by per-zone frost-date offset (migration #47). Inherits 5b uncertainty.';
    return '';
  }
</script>

<svelte:window on:keydown={onKey} />

<header>
  <button class="back" on:click={() => goto('/')}>← Map</button>
  <h1>Calibration viewer</h1>
  <span class="hint">{species.length} species · {zones.length} zones · ↔ to step · / to search</span>
</header>

<main>
  {#if !loaded}
    <p class="muted">Loading…</p>
  {:else if errorMsg}
    <p class="error">{errorMsg}</p>
  {:else if !isAdmin}
    <p class="muted">Admin only.</p>
  {:else}
    <!-- Species selector: search box + prev/next -->
    <div class="picker">
      <button class="step" on:click={() => step(-1)} title="Previous species (←)">‹</button>
      <input
        bind:this={searchInput}
        bind:value={searchTerm}
        placeholder={currentSpecies ? `${currentSpecies.common_name} — ${currentSpecies.scientific_name}` : 'Search species…'}
        class="search"
      />
      <button class="step" on:click={() => step(1)} title="Next species (→)">›</button>
    </div>

    {#if searchTerm && filteredSpecies.length > 0}
      <div class="dropdown">
        {#each filteredSpecies.slice(0, 30) as s (s.id)}
          <button class="dropdown-item" on:click={() => pickSpecies(s.id)}>
            <span class="dd-common">{s.common_name}</span>
            <span class="dd-sci">{s.scientific_name}</span>
          </button>
        {/each}
        {#if filteredSpecies.length > 30}
          <div class="muted small">+{filteredSpecies.length - 30} more — narrow your search</div>
        {/if}
      </div>
    {/if}

    {#if currentSpecies}
      <div class="species-head">
        <h2>{currentSpecies.common_name}</h2>
        <div class="sci">{currentSpecies.scientific_name}</div>
      </div>

      <div class="legend">
        <span class="legend-item"><span class="swatch swatch-db"></span>Current DB (all AI-derived: Ithaca 5b seed + heuristic propagation)</span>
        <span class="legend-item"><span class="swatch swatch-guide"></span>Regional guide (Layer 2)</span>
        <span class="legend-item swatch-pending"><span class="swatch"></span>NPN peak (Layer 1) — pending</span>
        <label class="toggle">
          <input type="checkbox" bind:checked={showEmptyZones} />
          Show zones with no data
        </label>
      </div>

      {#if visibleZones.length === 0}
        <p class="muted">No data in any zone for this species. Toggle "Show zones with no data" to see the empty matrix.</p>
      {:else}
        <div class="rows">
          {#each visibleZones as z (z.id)}
            {@const dbStages = dbBySpeciesZone.get(z.id)}
            {@const jsonRegions = regionsByZoneCode.get(z.code) ?? []}
            <div class="zone-row">
              <div class="zone-label">
                <strong>{z.code}</strong>
                <span class="zone-name muted">{z.name.replace('USDA hardiness zone ', '')}</span>
              </div>
              <svg viewBox="0 0 {totalW} {TIMELINE_H}" width={totalW} height={TIMELINE_H} class="timeline">
                <!-- Month grid -->
                {#each MONTH_STARTS as doy, i}
                  <line x1={doyX(doy)} x2={doyX(doy)} y1={0} y2={TIMELINE_H - 12}
                        stroke="#e1e8e1" stroke-width="1" />
                  <text x={doyX(doy) + 2} y={TIMELINE_H - 2} class="axis-label">{MONTH_LABELS[i]}</text>
                {/each}
                <line x1={doyX(0)} x2={doyX(365)} y1={TIMELINE_H - 12} y2={TIMELINE_H - 12}
                      stroke="#c7d0c7" stroke-width="1" />

                <!-- DB layer (gray bars, top half) -->
                {#if dbStages}
                  {#each [...dbStages.values()] as w}
                    {#if w.start_doy != null && w.end_doy != null}
                      <rect
                        x={doyX(w.start_doy)}
                        y={6}
                        width={Math.max(2, doyX(w.end_doy) - doyX(w.start_doy))}
                        height={STAGE_H}
                        fill={stageColor(w.stage)}
                        opacity="0.55"
                      >
                        <title>DB · {w.stage} · DOY {w.start_doy}–{w.end_doy}{w.confidence ? ` · ${w.confidence}` : ''}</title>
                      </rect>
                      {#if w.peak_doy != null}
                        <circle cx={doyX(w.peak_doy)} cy={6 + STAGE_H / 2} r="3" fill="#1f2a1f">
                          <title>DB peak · DOY {w.peak_doy}</title>
                        </circle>
                      {/if}
                    {/if}
                  {/each}
                {/if}

                <!-- Layer 2 guide bars (orange, lower half) -->
                {#each jsonRegions as r, idx}
                  {#if r.window.ripe}
                    <rect
                      x={doyX(r.window.ripe.start_doy)}
                      y={6 + STAGE_H + 4 + idx * (STAGE_H + 2)}
                      width={Math.max(2, doyX(r.window.ripe.end_doy) - doyX(r.window.ripe.start_doy))}
                      height={STAGE_H}
                      fill="#e07b3a"
                      opacity="0.85"
                    >
                      <title>{r.regionName} · ripe · DOY {r.window.ripe.start_doy}–{r.window.ripe.end_doy} · {r.region.source}{r.window.ripe.notes ? '\n' + r.window.ripe.notes : ''}</title>
                    </rect>
                  {/if}
                {/each}
              </svg>
              <div class="row-meta">
                {#if jsonRegions.length > 0}
                  {#each jsonRegions as r}
                    <a class="src-pill" href={r.region.source_url} target="_blank" rel="noopener">
                      {r.regionName}
                    </a>
                  {/each}
                {/if}
                {#if dbStages && dbStages.size > 0}
                  {@const ripe = dbStages.get('ripe')}
                  {#if ripe?.confidence}
                    <span class="conf-pill conf-{ripe.confidence}" title={confidenceTitle(ripe.confidence)}>{confidenceLabel(ripe.confidence)}</span>
                  {/if}
                  {#if ripe?.notes}
                    <span class="note-pill" title={ripe.notes}>note</span>
                  {/if}
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  {/if}
</main>

<style>
  header {
    display: flex;
    align-items: baseline;
    gap: 1rem;
    padding: 0.5rem 1rem;
    background: white;
    border-bottom: 1px solid #e1e8e1;
  }
  header h1 { margin: 0; font-size: 1.05rem; color: #3a5a3a; }
  .back {
    background: transparent;
    border: 0;
    color: #3a5a3a;
    font-size: 0.9rem;
    cursor: pointer;
  }
  .hint { font-size: 0.78rem; color: #6b7a6b; margin-left: auto; }
  main {
    max-width: 60rem;
    margin: 0 auto;
    padding: 1rem 1.25rem 4rem;
    color: #1f2a1f;
  }
  .muted { color: #6b7a6b; }
  .small { font-size: 0.78rem; }
  .error { color: #b03030; }
  .picker {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    margin-bottom: 0.6rem;
  }
  .step {
    width: 2.4rem;
    height: 2.4rem;
    border-radius: 50%;
    border: 1px solid #c7d0c7;
    background: white;
    color: #3a5a3a;
    font-size: 1.2rem;
    cursor: pointer;
  }
  .step:hover { background: #f0f5ef; }
  .search {
    flex: 1;
    padding: 0.5rem 0.7rem;
    font-size: 0.95rem;
    border: 1px solid #c7d0c7;
    border-radius: 0.4rem;
  }
  .dropdown {
    position: relative;
    background: white;
    border: 1px solid #d0d8d0;
    border-radius: 0.4rem;
    box-shadow: 0 4px 14px rgba(0,0,0,0.12);
    margin-bottom: 1rem;
    max-height: 320px;
    overflow-y: auto;
  }
  .dropdown-item {
    display: flex;
    gap: 0.6rem;
    width: 100%;
    padding: 0.4rem 0.7rem;
    background: transparent;
    border: 0;
    text-align: left;
    cursor: pointer;
  }
  .dropdown-item:hover { background: #f0f5ef; }
  .dd-common { font-weight: 500; }
  .dd-sci { color: #6b7a6b; font-style: italic; }
  .species-head {
    margin: 0.6rem 0 0.4rem;
  }
  .species-head h2 { margin: 0; font-size: 1.4rem; }
  .sci { color: #6b7a6b; font-style: italic; font-size: 0.9rem; }
  .legend {
    display: flex;
    gap: 1.2rem;
    flex-wrap: wrap;
    align-items: center;
    margin: 0.8rem 0 0.8rem;
    font-size: 0.83rem;
    color: #4a554a;
  }
  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .swatch {
    width: 1rem;
    height: 0.5rem;
    border-radius: 0.15rem;
    display: inline-block;
  }
  .swatch-db { background: #c84545; opacity: 0.55; }
  .swatch-guide { background: #e07b3a; opacity: 0.85; }
  .swatch-pending .swatch { background: #c0c0c0; opacity: 0.4; }
  .swatch-pending { color: #8a948a; }
  .toggle { font-size: 0.83rem; color: #4a554a; cursor: pointer; }
  .toggle input { margin-right: 0.3rem; }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    background: white;
    border: 1px solid #d0d8d0;
    border-radius: 0.4rem;
    padding: 0.4rem;
  }
  /* Flex layout instead of grid: explicit widths on the side columns
     so the timeline always renders at the same width regardless of how
     many source pills land in the meta column. Without this, rows
     with more pills squeezed the timeline narrower and DOYs didn't
     line up across rows. */
  .zone-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.2rem 0.4rem;
    border-radius: 0.25rem;
  }
  .zone-row:hover { background: #f7faf6; }
  .zone-label {
    display: flex;
    flex-direction: column;
    line-height: 1.15;
    width: 6rem;
    flex-shrink: 0;
  }
  .zone-label strong { color: #1f2a1f; }
  .zone-name { font-size: 0.72rem; }
  .timeline {
    flex: 1;
    min-width: 0;
    height: auto;
  }
  :global(.timeline .axis-label) {
    fill: #8a948a;
    font-size: 9px;
    font-family: system-ui;
  }
  .row-meta {
    display: flex;
    gap: 0.3rem;
    align-items: center;
    flex-wrap: wrap;
    justify-content: flex-end;
    width: 12rem;
    flex-shrink: 0;
  }
  .src-pill {
    font-size: 0.72rem;
    padding: 0.1rem 0.4rem;
    border: 1px solid #e07b3a;
    color: #b85a1a;
    border-radius: 1rem;
    text-decoration: none;
    background: #fff5ec;
  }
  .src-pill:hover { background: #ffe8d0; }
  .conf-pill {
    font-size: 0.7rem;
    padding: 0.05rem 0.35rem;
    border-radius: 0.2rem;
    border: 1px solid;
    cursor: help;
  }
  /* Both DB confidence values today are AI-derived. Style them similarly
     muted to avoid implying that "curated" is human-validated. */
  .conf-curated { color: #6f5a10; border-color: #d8c890; background: #fbf6e8; }
  .conf-frost_offset { color: #5a6f6f; border-color: #b0c0c0; background: #f0f5f5; }

  .note-pill {
    font-size: 0.68rem;
    padding: 0.05rem 0.35rem;
    border-radius: 0.2rem;
    background: #fff;
    border: 1px dashed #c7d0c7;
    color: #6b7a6b;
    cursor: help;
  }
</style>
