<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { activeRegion } from '$lib/stores/activeRegion';
  import { listAll as listSpecies, type Species } from '$lib/services/speciesService';
  import { supabase } from '$lib/supabase';
  import ToolsMenu from '$lib/components/ToolsMenu.svelte';
  // Seeded reference values + citation, loaded at build time. Lives outside
  // src/ but inside the project root, so Vite's JSON import handles it.
  import seedFile from '../../../data/species/ithaca.json';

  type WindowRow = {
    id: string;
    species_id: string;
    region_id: string;
    stage: string;
    start_doy: number;
    end_doy: number;
  };

  type ObsRow = {
    id: string | null;
    species_id: string | null;
    stage: string | null;
    observed_at: string | null;
    pin_id: string | null;
    pin_display_name: string | null;
    quality_rating: number | null;
    quality_notes: string | null;
  };

  /** Hydrated tick used both in the page-level timeline and the focused
   *  per-species view. doy is computed once at load. */
  type ObsTick = {
    id: string;
    stage: string;
    doy: number;
    observed_at: string;
    pin_id: string | null;
    pin_display_name: string | null;
    quality_rating: number | null;
    quality_notes: string | null;
  };

  let species: Species[] = [];
  let windows: WindowRow[] = [];
  let observations: ObsRow[] = [];
  let loading = true;
  let saving = false;
  let errorMessage = '';

  /** Modal state: which window the user is editing, plus draft inputs. */
  let editing: WindowRow | null = null;
  let editStart = 0;
  let editEnd = 0;

  /** Per-species detail view. When set, a focused panel renders just
   *  this species' bars (taller, with stage labels) and observations as
   *  clickable points. */
  let focusedSpeciesId: string | null = null;
  let selectedObs: ObsTick | null = null;

  const STAGES = ['flowering', 'green', 'ripening', 'ripe', 'past'] as const;

  /** Build a lookup from scientific_name → { stage → {start_doy, end_doy} }
   *  for the seed reference values. The first range is taken if there are
   *  multiple. */
  const seedByScientific: Record<string, Record<string, { start_doy: number; end_doy: number }>> = (() => {
    const m: Record<string, Record<string, { start_doy: number; end_doy: number }>> = {};
    for (const w of seedFile.windows ?? []) {
      const stages: Record<string, { start_doy: number; end_doy: number }> = {};
      for (const [stage, ranges] of Object.entries(w.stages ?? {})) {
        const r = (ranges as { start_doy: number; end_doy: number }[])[0];
        if (r) stages[stage] = { start_doy: r.start_doy, end_doy: r.end_doy };
      }
      m[w.scientific_name] = stages;
    }
    return m;
  })();
  const seedCitation: string = seedFile.notes ?? '';

  $: speciesById = (() => {
    const m: Record<string, Species> = {};
    for (const s of species) m[s.id] = s;
    return m;
  })();

  $: windowsBySpecies = (() => {
    const m: Record<string, Record<string, WindowRow>> = {};
    for (const w of windows) {
      if (!m[w.species_id]) m[w.species_id] = {};
      m[w.species_id][w.stage] = w;
    }
    return m;
  })();

  onMount(load);

  async function load() {
    loading = true;
    errorMessage = '';
    try {
      species = await listSpecies();
      if ($activeRegion) {
        const [winRes, obsRes] = await Promise.all([
          supabase
            .from('species_fruiting_windows')
            .select('id, species_id, region_id, stage, start_doy, end_doy')
            .eq('region_id', $activeRegion.id),
          supabase
            .from('v_observation_with_pin')
            .select('id, species_id, stage, observed_at, pin_id, pin_display_name, quality_rating, quality_notes')
            .eq('pin_region_id', $activeRegion.id)
        ]);
        if (winRes.error) throw winRes.error;
        if (obsRes.error) throw obsRes.error;
        windows = winRes.data ?? [];
        observations = obsRes.data ?? [];
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Failed to load.';
    } finally {
      loading = false;
    }
  }

  /** species_id → array of ObsTick (rich enough to drive both the small
   *  ticks on the overview and the clickable points in the per-species
   *  drill-down). Drops 'bare'/'unknown' stages and invalid dates. */
  $: obsBySpecies = (() => {
    const m: Record<string, ObsTick[]> = {};
    for (const o of observations) {
      if (!o.id || !o.species_id || !o.stage || !o.observed_at) continue;
      if (o.stage === 'bare' || o.stage === 'unknown') continue;
      const doy = dateToDoy(o.observed_at);
      if (!Number.isFinite(doy)) continue;
      if (!m[o.species_id]) m[o.species_id] = [];
      m[o.species_id].push({
        id: o.id,
        stage: o.stage,
        doy,
        observed_at: o.observed_at,
        pin_id: o.pin_id,
        pin_display_name: o.pin_display_name,
        quality_rating: o.quality_rating,
        quality_notes: o.quality_notes
      });
    }
    return m;
  })();

  function doyToDate(doy: number): string {
    const d = new Date(2024, 0, doy);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function todayDoy(): number {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    return Math.floor((now.getTime() - start.getTime()) / 86_400_000);
  }

  /** Convert a Date (or ISO string) into a 1-365 DOY, in the user's local
   *  time. Returns NaN for invalid dates so callers can skip them. */
  function dateToDoy(d: Date | string): number {
    const dt = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(dt.getTime())) return NaN;
    const start = new Date(dt.getFullYear(), 0, 0);
    return Math.floor((dt.getTime() - start.getTime()) / 86_400_000);
  }

  /** Auto-trim the timeline to a window that hugs the data — earliest
   *  flowering to latest "past" — with two weeks of padding on each side.
   *  Falls back to a full year if no windows are loaded. Months outside
   *  this range are not labeled. */
  $: timelineRange = (() => {
    if (windows.length === 0) return { start: 1, end: 365, span: 364 };
    let lo = 365, hi = 1;
    for (const w of windows) {
      if (w.start_doy < lo) lo = w.start_doy;
      if (w.end_doy > hi) hi = w.end_doy;
    }
    const start = Math.max(1, lo - 14);
    const end = Math.min(365, hi + 14);
    return { start, end, span: Math.max(1, end - start) };
  })();
  $: doyToPct = (doy: number) =>
    ((doy - timelineRange.start) / timelineRange.span) * 100;
  $: todayPct = doyToPct(todayDoy());
  $: todayInRange =
    todayDoy() >= timelineRange.start && todayDoy() <= timelineRange.end;

  /** Earthy, naturalistic palette: lilac (blossom) → leaf green → amber
   *  → berry red → warm grey. Avoids the pink/mustard/orange triad of
   *  the first iteration. */
  const STAGE_COLORS: Record<string, string> = {
    flowering: '#9b7fb2',
    green: '#6b9442',
    ripening: '#b87a2f',
    ripe: '#8e2828',
    past: '#7a7368'
  };
  // First-of-month DOYs and short labels. Filtered down to those that
  // fall inside the trimmed range.
  const ALL_MONTH_TICKS = [
    { label: 'Jan', doy: 1 },   { label: 'Feb', doy: 32 },
    { label: 'Mar', doy: 60 },  { label: 'Apr', doy: 91 },
    { label: 'May', doy: 121 }, { label: 'Jun', doy: 152 },
    { label: 'Jul', doy: 182 }, { label: 'Aug', doy: 213 },
    { label: 'Sep', doy: 244 }, { label: 'Oct', doy: 274 },
    { label: 'Nov', doy: 305 }, { label: 'Dec', doy: 335 }
  ];
  $: monthTicks = ALL_MONTH_TICKS.filter(
    (t) => t.doy >= timelineRange.start && t.doy <= timelineRange.end
  );

  /** Same grouping the main map uses, so the order on this page matches
   *  the species panel there. Apple+Pear share a group; almond split out
   *  from other Prunus. All mushrooms collapse into one "Mushroom" bucket;
   *  ramps / asparagus / mint collapse into "Other". */
  const GROUP_LABELS: Record<string, string> = {
    Amelanchier: 'Serviceberry', Asimina: 'Pawpaw', Carya: 'Hickory',
    Castanea: 'Chestnut', Cornus: 'Cornelian cherry', Corylus: 'Hazelnut',
    Diospyros: 'Persimmon', Juglans: 'Walnut', Malus: 'Apple / Pear',
    Pyrus: 'Apple / Pear', Morus: 'Mulberry',
    Prunus: 'Cherry / Plum', Ribes: 'Currant', Rubus: 'Bramble',
    Sambucus: 'Elderberry', Vaccinium: 'Blueberry',
    Elaeagnus: 'Autumn olive', Vitis: 'Grape',
    Cantharellus: 'Mushroom', Morchella: 'Mushroom',
    Allium: 'Other', Asparagus: 'Other', Mentha: 'Other'
  };
  function groupOf(s: Species): string {
    if (s.scientific_name === 'Prunus dulcis') return 'Almond';
    const genus = s.scientific_name.split(/\s+/)[0];
    return GROUP_LABELS[genus] ?? genus;
  }

  /** Category derived from forage_parts (matches the main map's logic).
   *  Sort order is fruit → nut → mushroom → other; everything else last. */
  const CATEGORY_ORDER: Record<string, number> = {
    fruit: 0, nut: 1, mushroom: 2, other: 3
  };
  function categoryOf(s: Species): 'fruit' | 'nut' | 'mushroom' | 'other' {
    const parts = s.forage_parts ?? [];
    if (parts.includes('mushroom')) return 'mushroom';
    if (parts.includes('nut')) return 'nut';
    if (parts.includes('fruit')) return 'fruit';
    return 'other';
  }

  $: speciesWithWindows = Object.entries(windowsBySpecies)
    .map(([id, stages]) => ({ id, species: speciesById[id], stages }))
    .filter((r) => r.species)
    .sort((a, b) => {
      const ca = CATEGORY_ORDER[categoryOf(a.species)] ?? 99;
      const cb = CATEGORY_ORDER[categoryOf(b.species)] ?? 99;
      if (ca !== cb) return ca - cb;
      const ga = groupOf(a.species);
      const gb = groupOf(b.species);
      if (ga !== gb) return ga.localeCompare(gb);
      return a.species.common_name.localeCompare(b.species.common_name);
    });

  /** Bucket the sorted species list into consecutive groups (genus
   *  buckets like "Apple / Pear", "Cornelian cherry") so the timeline
   *  can render a vertical group label spanning each bucket. Iteration
   *  order preserves the sort above. */
  $: timelineGroups = (() => {
    const out: { group: string; rows: typeof speciesWithWindows }[] = [];
    for (const sw of speciesWithWindows) {
      const g = groupOf(sw.species);
      const last = out[out.length - 1];
      if (last && last.group === g) last.rows.push(sw);
      else out.push({ group: g, rows: [sw] });
    }
    return out;
  })();

  function openEditor(w: WindowRow) {
    editing = w;
    editStart = w.start_doy;
    editEnd = w.end_doy;
  }
  function closeEditor() {
    editing = null;
  }

  async function saveEdit() {
    if (!editing) return;
    saving = true;
    errorMessage = '';
    try {
      const { error } = await supabase
        .from('species_fruiting_windows')
        .update({ start_doy: editStart, end_doy: editEnd })
        .eq('id', editing.id);
      if (error) throw error;
      // Update local state in place so the timeline reflects immediately.
      windows = windows.map((w) =>
        w.id === editing!.id ? { ...w, start_doy: editStart, end_doy: editEnd } : w
      );
      editing = null;
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Save failed.';
    } finally {
      saving = false;
    }
  }

  /** Reset both fields back to the seed defaults (does not save until the
   *  user clicks Save). */
  function resetToSeed() {
    if (!editing) return;
    const sp = speciesById[editing.species_id];
    if (!sp) return;
    const seed = seedByScientific[sp.scientific_name]?.[editing.stage];
    if (!seed) return;
    editStart = seed.start_doy;
    editEnd = seed.end_doy;
  }

  $: editingSpecies = editing ? speciesById[editing.species_id] : null;
  $: editingSeed = editingSpecies
    ? seedByScientific[editingSpecies.scientific_name]?.[editing!.stage] ?? null
    : null;

  function openSpeciesDetail(id: string) {
    focusedSpeciesId = id;
    selectedObs = null;
  }
  function closeSpeciesDetail() {
    focusedSpeciesId = null;
    selectedObs = null;
  }

  /** Resolve focused species + its rendered tick set + its bars, all
   *  using the same trimmed range as the overview so positions match. */
  $: focusedSpecies = focusedSpeciesId ? speciesById[focusedSpeciesId] : null;
  $: focusedStages = focusedSpeciesId ? windowsBySpecies[focusedSpeciesId] ?? {} : {};
  $: focusedObs = focusedSpeciesId ? obsBySpecies[focusedSpeciesId] ?? [] : [];

  function fmtDate(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  }

  function openPin(pinId: string) {
    // Bounce to the map with this pin selected. The query param is read
    // by the main page on mount.
    goto(`/?pin=${encodeURIComponent(pinId)}`);
  }
</script>

<header>
  <button class="back" on:click={() => goto('/')}>← Back</button>
  <h1>Harvest windows</h1>
  <div class="header-spacer"></div>
  <ToolsMenu />
</header>

<main>
  {#if loading}
    <p class="hint">Loading…</p>
  {:else if errorMessage}
    <p class="error">{errorMessage}</p>
  {:else}
    <p class="intro">
      Approximate windows per species per stage in your region. The red line
      is today. Tick marks above each bar are observations. Click any bar to
      edit its start/end dates.
    </p>

    <div class="timeline">
      <div class="legend-row">
        {#each Object.entries(STAGE_COLORS) as [stage, color]}
          <span class="leg-item"><span class="leg-dot" style="background: {color}"></span>{stage}</span>
        {/each}
        <span class="leg-item"><span class="leg-line"></span>today</span>
      </div>
      <div class="month-row">
        {#each monthTicks as t}
          <span class="month-tick" style={`left: ${doyToPct(t.doy)}%`}>{t.label}</span>
        {/each}
      </div>
      {#each timelineGroups as { group, rows }}
        <div class="group">
          <div class="group-label"><span>{group}</span></div>
          <div class="group-rows">
            {#each rows as { species, stages }}
              <div class="species-row">
                <button
                  type="button"
                  class="row-label species-link"
                  on:click={() => openSpeciesDetail(species.id)}
                  title="Zoom in on {species.common_name}"
                >{species.common_name}</button>
                <div class="row-track">
                  {#each STAGES as stage}
                    {#if stages[stage]}
                      <button
                        type="button"
                        class="stage-bar"
                        style={`left: ${doyToPct(stages[stage].start_doy)}%; width: ${doyToPct(stages[stage].end_doy) - doyToPct(stages[stage].start_doy)}%; background: ${STAGE_COLORS[stage] ?? '#888'};`}
                        title="{stage}: {doyToDate(stages[stage].start_doy)} – {doyToDate(stages[stage].end_doy)} · click to edit"
                        on:click={() => openEditor(stages[stage])}
                      ></button>
                    {/if}
                  {/each}
                  {#each obsBySpecies[species.id] ?? [] as o}
                    {#if o.doy >= timelineRange.start && o.doy <= timelineRange.end}
                      <span
                        class="obs-tick"
                        style={`left: ${doyToPct(o.doy)}%; background: ${STAGE_COLORS[o.stage] ?? '#888'};`}
                        title="Observation: {o.stage} on {doyToDate(o.doy)}"
                      ></span>
                    {/if}
                  {/each}
                  {#if todayInRange}
                    <div class="today-line" style={`left: ${todayPct}%`}></div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</main>

{#if editing && editingSpecies}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="modal-backdrop" on:click={closeEditor}>
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      on:click|stopPropagation
      on:keydown|stopPropagation
    >
      <h3>
        {editingSpecies.common_name}
        <span class="modal-stage" style="color: {STAGE_COLORS[editing.stage]}">{editing.stage}</span>
      </h3>

      <div class="modal-fields">
        <label>
          Start
          <input type="number" min="1" max="366" bind:value={editStart} />
          <span class="muted">{doyToDate(editStart)}</span>
        </label>
        <label>
          End
          <input type="number" min="1" max="366" bind:value={editEnd} />
          <span class="muted">{doyToDate(editEnd)}</span>
        </label>
      </div>

      <div class="reference">
        <div class="reference-label">Reference (default)</div>
        {#if editingSeed}
          <div class="reference-value">
            DOY {editingSeed.start_doy} – {editingSeed.end_doy}
            <span class="muted">({doyToDate(editingSeed.start_doy)} – {doyToDate(editingSeed.end_doy)})</span>
            <button type="button" class="reset" on:click={resetToSeed}>Reset</button>
          </div>
        {:else}
          <div class="reference-value muted">No seeded default for this species/stage.</div>
        {/if}
        <div class="citation">{seedCitation}</div>
      </div>

      {#if errorMessage}
        <p class="error">{errorMessage}</p>
      {/if}

      <div class="modal-actions">
        <button type="button" class="cancel" on:click={closeEditor} disabled={saving}>Cancel</button>
        <button type="button" class="save" on:click={saveEdit} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if focusedSpecies}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="modal-backdrop" on:click={closeSpeciesDetail}>
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div
      class="modal focus-modal"
      role="dialog"
      aria-modal="true"
      on:click|stopPropagation
      on:keydown|stopPropagation
    >
      <h3 class="focus-title">
        {focusedSpecies.common_name}
        <em class="focus-sci">{focusedSpecies.scientific_name}</em>
      </h3>

      <div class="focus-months">
        {#each monthTicks as t}
          <span class="focus-month" style={`left: ${doyToPct(t.doy)}%`}>{t.label}</span>
        {/each}
      </div>
      <div class="focus-track">
        {#each STAGES as stage}
          {#if focusedStages[stage]}
            <button
              type="button"
              class="focus-bar"
              style={`left: ${doyToPct(focusedStages[stage].start_doy)}%; width: ${doyToPct(focusedStages[stage].end_doy) - doyToPct(focusedStages[stage].start_doy)}%; background: ${STAGE_COLORS[stage] ?? '#888'};`}
              title="Click to edit"
              on:click={() => openEditor(focusedStages[stage])}
            >{stage}</button>
          {/if}
        {/each}
        {#each focusedObs as o}
          {#if o.doy >= timelineRange.start && o.doy <= timelineRange.end}
            <button
              type="button"
              class="focus-obs"
              class:selected={selectedObs?.id === o.id}
              style={`left: ${doyToPct(o.doy)}%; background: ${STAGE_COLORS[o.stage] ?? '#888'};`}
              title="{o.stage} · {fmtDate(o.observed_at)}"
              on:click={() => (selectedObs = o)}
            ></button>
          {/if}
        {/each}
        {#if todayInRange}
          <div class="focus-today" style={`left: ${todayPct}%`}></div>
        {/if}
      </div>

      {#if focusedObs.length === 0}
        <p class="focus-empty">No observations logged for this species yet.</p>
      {:else if !selectedObs}
        <p class="focus-hint">{focusedObs.length} observation{focusedObs.length === 1 ? '' : 's'} — click any point above for details.</p>
      {/if}

      {#if selectedObs}
        <div class="obs-detail">
          <div class="obs-detail-head">
            <span class="obs-stage" style={`background: ${STAGE_COLORS[selectedObs.stage] ?? '#888'}`}>{selectedObs.stage}</span>
            <span class="obs-date">{fmtDate(selectedObs.observed_at)}</span>
            <button type="button" class="obs-close" on:click={() => (selectedObs = null)} aria-label="Clear selection">×</button>
          </div>
          <div class="obs-detail-body">
            <div><strong>Pin:</strong> {selectedObs.pin_display_name ?? '(unnamed)'}</div>
            {#if selectedObs.quality_rating != null}
              <div><strong>Quality:</strong>
                {#if selectedObs.quality_rating === 0}🚫 No harvest{:else}{'★'.repeat(selectedObs.quality_rating)}{'☆'.repeat(Math.max(0, 5 - selectedObs.quality_rating))}{/if}
              </div>
            {/if}
            {#if selectedObs.quality_notes}
              <div class="obs-notes">{selectedObs.quality_notes}</div>
            {/if}
          </div>
          {#if selectedObs.pin_id}
            {@const pinId = selectedObs.pin_id}
            <button type="button" class="obs-open" on:click={() => openPin(pinId)}>Open pin →</button>
          {/if}
        </div>
      {/if}

      <div class="modal-actions">
        <button type="button" class="cancel" on:click={closeSpeciesDetail}>Close</button>
      </div>
    </div>
  </div>
{/if}

<style>
  header { display: flex; align-items: center; gap: 1rem; padding: 0.5rem 1rem; background: white; border-bottom: 1px solid #e1e8e1; height: 56px; box-sizing: border-box; }
  header h1 { margin: 0; font-size: 1.05rem; color: #3a5a3a; }
  .header-spacer { flex: 1; }
  .back { background: transparent; border: 0; color: #3a5a3a; font-size: 0.9rem; cursor: pointer; }
  main { padding: 1rem; max-width: 60rem; margin: 0 auto; }
  .intro { color: #4a554a; font-size: 0.9rem; margin: 0 0 1rem; }
  .error { color: #b03030; font-size: 0.9rem; }
  .hint { color: #6b7a6b; }
  .muted { color: #8a948a; font-size: 0.85rem; }
  input[type='number'] { width: 4rem; padding: 0.2rem 0.35rem; border: 1px solid #c7d0c7; border-radius: 0.25rem; font-size: 0.85rem; }

  /* Timeline */
  .timeline {
    margin: 1rem 0 1.5rem;
    background: #fafcf6;
    border: 1px solid #d0d8d0;
    border-radius: 0.4rem;
    padding: 0.6rem 0.8rem;
    /* Single source of truth for label-column widths so the month row,
       legend, and species rows all line up exactly. */
    --group-w: 1.6rem;
    --label-w: 8rem;
    --label-gap: 0.4rem;
    --left-offset: calc(var(--group-w) + var(--label-w) + var(--label-gap) * 2);
  }
  .legend-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    margin-bottom: 0.4rem;
    font-size: 0.72rem;
    color: #6b7a6b;
  }
  .month-row {
    position: relative;
    height: 1rem;
    margin-left: var(--left-offset);
    margin-bottom: 0.3rem;
    font-size: 0.7rem;
    color: #6b7a6b;
  }
  .month-tick {
    position: absolute;
    transform: translateX(-50%);
  }
  .group {
    display: flex;
    align-items: stretch;
    gap: var(--label-gap);
    margin-bottom: 0.35rem;
    /* Floor each group to about 4 species-row-heights so single- or
       two-species groups still give the vertical label room and don't
       look squashed next to taller groups. */
    min-height: 5.4rem;
  }
  .group-label {
    width: var(--group-w);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #eef2ee;
    border-radius: 0.2rem;
    color: #3a5a3a;
    font-size: 0.72rem;
    line-height: 1;
    overflow: hidden;
  }
  .group-label > span {
    /* Vertical text reading top-to-bottom. */
    writing-mode: vertical-rl;
    text-orientation: mixed;
    transform: rotate(180deg);
    padding: 0.3rem 0;
    white-space: nowrap;
    text-overflow: ellipsis;
    max-height: 100%;
  }
  .group-rows {
    flex: 1;
    display: flex;
    flex-direction: column;
    /* Center species rows vertically within the group so groups with one
       or two species don't pin to the top and leave dead space at the
       bottom of the vertical label. */
    justify-content: center;
    gap: 0.18rem;
    min-width: 0;
  }
  .species-row {
    display: flex;
    align-items: center;
    gap: var(--label-gap);
    height: 1.3rem;
  }
  .row-label {
    width: var(--label-w);
    flex-shrink: 0;
    font-size: 0.78rem;
    color: #1f2a1f;
    text-align: right;
    padding-right: 0.2rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .species-link {
    background: transparent;
    border: 0;
    cursor: pointer;
    text-align: right;
    padding-right: 0.2rem;
  }
  .species-link:hover { text-decoration: underline; color: #3a5a3a; }
  .row-track {
    position: relative;
    flex: 1;
    height: 0.9rem;
    background: #ebefeb;
    border-radius: 0.2rem;
    /* No overflow:hidden — would clip the observation ticks (top:-0.35rem)
       and the today-line's top/bottom extensions. */
  }
  .stage-bar {
    position: absolute;
    top: 0; bottom: 0;
    border: 0;
    padding: 0;
    cursor: pointer;
  }
  .stage-bar:hover { filter: brightness(1.1); }
  .stage-bar:focus-visible { outline: 2px solid #1f2a1f; outline-offset: 1px; }
  .obs-tick {
    /* Diamond centered ON the bar marking an observation at that DOY.
       Centering vertically (rather than perching above) keeps the tick
       unambiguously inside its own species row — the previous offset
       made ticks visually drift up into the gap above. White inner
       border + thin dark halo keep the tick legible against any bar
       color, including the matching-color "ripe on ripe" case. */
    position: absolute;
    top: 50%;
    width: 0.7rem;
    height: 0.7rem;
    transform: translate(-50%, -50%) rotate(45deg);
    border: 2px solid #ffffff;
    box-sizing: border-box;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.55);
    pointer-events: none;
  }
  .today-line {
    position: absolute;
    top: -0.45rem; bottom: -0.2rem;
    width: 2px;
    background: #b03030;
    border-radius: 1px;
    pointer-events: none;
  }
  .leg-item { display: inline-flex; align-items: center; gap: 0.25rem; }
  .leg-dot { width: 0.65rem; height: 0.65rem; border-radius: 2px; }
  .leg-line { width: 2px; height: 0.85rem; background: #b03030; }

  /* Edit modal */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
    padding: 1rem;
  }
  .modal {
    background: white;
    border-radius: 0.5rem;
    padding: 1.1rem 1.2rem 1rem;
    width: 100%;
    max-width: 24rem;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  }
  .modal h3 {
    margin: 0 0 0.75rem;
    font-size: 1rem;
    color: #1f2a1f;
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }
  .modal-stage {
    font-size: 0.78rem;
    font-style: italic;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .modal-fields {
    display: flex;
    gap: 0.8rem;
    margin-bottom: 0.85rem;
  }
  .modal-fields label {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.78rem;
    color: #6b7a6b;
  }
  .modal-fields input { width: 100%; box-sizing: border-box; }
  .reference {
    background: #f5f8f5;
    border: 1px solid #e1e8e1;
    border-radius: 0.3rem;
    padding: 0.55rem 0.7rem;
    margin-bottom: 0.85rem;
  }
  .reference-label {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #6b7a6b;
    margin-bottom: 0.25rem;
  }
  .reference-value {
    font-size: 0.85rem;
    color: #1f2a1f;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .reset {
    margin-left: auto;
    background: transparent;
    border: 1px solid #c7d0c7;
    border-radius: 0.25rem;
    padding: 0.15rem 0.5rem;
    font-size: 0.75rem;
    color: #3a5a3a;
    cursor: pointer;
  }
  .citation {
    margin-top: 0.4rem;
    font-size: 0.72rem;
    color: #6b7a6b;
    line-height: 1.35;
    font-style: italic;
  }
  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
  .modal-actions button {
    padding: 0.4rem 0.9rem;
    border-radius: 0.3rem;
    font-size: 0.85rem;
    cursor: pointer;
    border: 1px solid transparent;
  }
  .cancel { background: white; border-color: #c7d0c7; color: #3a5a3a; }
  .save { background: #3a5a3a; color: white; }
  .save:disabled, .cancel:disabled { opacity: 0.6; cursor: default; }

  /* Focused per-species drill-down modal */
  .focus-modal { max-width: 32rem; }
  .focus-title {
    margin: 0 0 0.7rem;
    font-size: 1.05rem;
    color: #1f2a1f;
  }
  .focus-sci {
    font-size: 0.78rem;
    color: #6b7a6b;
    margin-left: 0.4rem;
  }
  .focus-months {
    position: relative;
    height: 0.95rem;
    font-size: 0.7rem;
    color: #6b7a6b;
    margin-bottom: 0.25rem;
  }
  .focus-month {
    position: absolute;
    transform: translateX(-50%);
  }
  .focus-track {
    position: relative;
    height: 1.7rem;
    background: #ebefeb;
    border-radius: 0.25rem;
    margin-bottom: 0.6rem;
  }
  .focus-bar {
    position: absolute;
    top: 0; bottom: 0;
    border: 0;
    padding: 0;
    cursor: pointer;
    color: white;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    overflow: hidden;
    white-space: nowrap;
    text-shadow: 0 1px 0 rgba(0,0,0,0.35);
  }
  .focus-bar:hover { filter: brightness(1.1); }
  .focus-obs {
    position: absolute;
    top: 50%;
    width: 0.85rem;
    height: 0.85rem;
    transform: translate(-50%, -50%) rotate(45deg);
    border: 2px solid white;
    box-sizing: border-box;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.55);
    cursor: pointer;
    padding: 0;
  }
  .focus-obs:hover { filter: brightness(1.1); }
  .focus-obs.selected {
    box-shadow: 0 0 0 2px #1f2a1f, 0 0 0 4px white;
  }
  .focus-today {
    position: absolute;
    top: -0.3rem; bottom: -0.3rem;
    width: 2px;
    background: #b03030;
    border-radius: 1px;
    pointer-events: none;
  }
  .focus-empty, .focus-hint {
    margin: 0.5rem 0 0;
    font-size: 0.78rem;
    color: #6b7a6b;
  }
  .obs-detail {
    margin-top: 0.6rem;
    background: #f5f8f5;
    border: 1px solid #e1e8e1;
    border-radius: 0.35rem;
    padding: 0.55rem 0.7rem;
  }
  .obs-detail-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.4rem;
  }
  .obs-stage {
    color: white;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0.1rem 0.45rem;
    border-radius: 0.2rem;
  }
  .obs-date { font-size: 0.85rem; color: #1f2a1f; }
  .obs-close {
    margin-left: auto;
    background: transparent;
    border: 0;
    font-size: 1.1rem;
    line-height: 1;
    color: #6b7a6b;
    cursor: pointer;
    padding: 0 0.2rem;
  }
  .obs-detail-body { font-size: 0.85rem; color: #1f2a1f; line-height: 1.4; }
  .obs-detail-body > div { margin-bottom: 0.15rem; }
  .obs-notes { font-style: italic; color: #4a554a; margin-top: 0.2rem; }
  .obs-open {
    margin-top: 0.45rem;
    background: #3a5a3a;
    color: white;
    border: 0;
    border-radius: 0.25rem;
    padding: 0.3rem 0.65rem;
    font-size: 0.8rem;
    cursor: pointer;
  }

  @media (max-width: 640px) {
    .timeline {
      --group-w: 1.4rem;
      --label-w: 5.5rem;
    }
    .row-label { font-size: 0.72rem; }
  }
</style>
