<script lang="ts">
  import { goto } from '$lib/utils/nav';
  import { activeRegion } from '$lib/stores/activeRegion';
  import { dataChange } from '$lib/stores/dataChange';
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
    confidence?: string | null;
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

  /** Regions that have at least one harvest-window row, with display
   *  name. Drives the region selector at the top of the page so users
   *  understand the chart is regional and can pick which region to
   *  view. Loaded once on mount; re-derived if a save adds the first
   *  window for a previously-empty region. */
  let regionsWithWindows: Array<{ id: string; name: string }> = [];
  /** Currently displayed region. Defaults to the user's active region
   *  if it has windows, otherwise the first available. Null means
   *  "no curated regions exist yet" — empty-state copy renders. */
  let selectedRegionId: string | null = null;

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

  /** Initialize the region list + default selection. Runs once when
   *  the active region first becomes available, then again only on
   *  $dataChange (a save might create new windows that change the
   *  set of regions to choose from). */
  let initialized = false;
  $: if ($activeRegion && !initialized) {
    void $dataChange;
    initialized = true;
    void initRegionsAndLoad();
  } else if (initialized) {
    void $dataChange;
    if (selectedRegionId) loadFor(selectedRegionId);
  }

  async function initRegionsAndLoad(): Promise<void> {
    // Find regions that have either at least one curated fruiting-window
    // row OR at least one observation — both sources contribute data
    // worth showing on this page.
    const [winRes, obsRes] = await Promise.all([
      supabase.from('species_fruiting_windows').select('region_id, regions!inner(name)'),
      supabase.from('v_observation_with_pin').select('pin_region_id, regions:pin_region_id ( name )' as never)
    ]);
    if (winRes.error) {
      errorMessage = winRes.error.message;
      loading = false;
      return;
    }
    const seen = new Map<string, string>();
    for (const r of (winRes.data ?? []) as Array<{ region_id: string; regions: { name: string } | null }>) {
      if (r.region_id && !seen.has(r.region_id)) {
        seen.set(r.region_id, r.regions?.name ?? '(unknown)');
      }
    }
    if (!obsRes.error) {
      for (const r of (obsRes.data ?? []) as unknown as Array<{ pin_region_id: string; regions: { name: string } | null }>) {
        if (r.pin_region_id && !seen.has(r.pin_region_id)) {
          seen.set(r.pin_region_id, r.regions?.name ?? '(unknown)');
        }
      }
    }
    regionsWithWindows = [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (regionsWithWindows.length === 0) {
      selectedRegionId = null;
      loading = false;
      return;
    }
    // Prefer the user's active region if it has windows; else first
    // alphabetically. Stable, predictable.
    const activeHas = regionsWithWindows.find((r) => r.id === $activeRegion?.id);
    selectedRegionId = (activeHas ?? regionsWithWindows[0]).id;
    await loadFor(selectedRegionId);
  }

  /** Switch the displayed region — fired by the selector. */
  async function onRegionChange(e: Event) {
    const id = (e.currentTarget as HTMLSelectElement).value;
    selectedRegionId = id;
    await loadFor(id);
  }

  async function loadFor(regionId: string) {
    loading = true;
    errorMessage = '';
    try {
      species = await listSpecies();
      // Fetch the region's climate zone(s) so we can pick up frost-
      // offset estimated windows that aren't tied to any specific
      // region (region_id is NULL on those, climate_zone_id is the
      // real key).
      const zoneRes = await supabase
        .from('region_climate_zones')
        .select('climate_zone_id')
        .eq('region_id', regionId);
      const zoneIds: string[] = ((zoneRes.data ?? []) as Array<{ climate_zone_id: string }>)
        .map((r) => r.climate_zone_id);

      // The generated Database types don't include the `confidence`
      // column yet (added in migration 45 but never regen'd). Cast
      // through unknown so .select('…confidence') typechecks. Same
      // pattern is used elsewhere for post-migration columns.
      const sb = supabase as unknown as {
        from: (t: string) => {
          select: (cols: string) => {
            eq: (col: string, val: string) => Promise<{ data: WindowRow[] | null; error: { message: string } | null }>;
            neq: (col: string, val: string) => {
              in: (col: string, vals: string[]) => Promise<{ data: WindowRow[] | null; error: { message: string } | null }>;
            };
          };
        };
      };
      const [curatedRes, frostRes, obsRes] = await Promise.all([
        sb.from('species_fruiting_windows')
          .select('id, species_id, region_id, stage, start_doy, end_doy, confidence')
          .eq('region_id', regionId),
        zoneIds.length > 0
          ? sb.from('species_fruiting_windows')
              .select('id, species_id, region_id, stage, start_doy, end_doy, confidence')
              .neq('confidence', 'curated')
              .in('climate_zone_id', zoneIds)
          : Promise.resolve({ data: [] as WindowRow[], error: null }),
        supabase
          .from('v_observation_with_pin')
          .select('id, species_id, stage, observed_at, pin_id, pin_display_name, quality_rating, quality_notes')
          .eq('pin_region_id', regionId)
      ]);
      if (curatedRes.error) throw curatedRes.error;
      if (frostRes.error) throw frostRes.error;
      if (obsRes.error) throw obsRes.error;
      const curatedKeys = new Set(
        (curatedRes.data ?? []).map((w) => `${w.species_id}|${w.stage}`)
      );
      const frostFiltered = (frostRes.data ?? []).filter(
        (w) => !curatedKeys.has(`${w.species_id}|${w.stage}`)
      );
      windows = [...(curatedRes.data ?? []), ...frostFiltered];
      observations = obsRes.data ?? [];
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
  /** Fixed full-year range. Earlier auto-fit-to-data was unstable —
   *  adding new windows (sap in Feb-March, fall fungi in Oct-Nov)
   *  made the chart suddenly span 10 months and old bars looked
   *  skinny and left-shifted relative to before. Locking to Jan-Dec
   *  is predictable, makes month positions intuitive, and the bars
   *  are sized in absolute proportion to the year regardless of
   *  what species are seeded. */
  const timelineRange = { start: 1, end: 365, span: 364 };
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
  /** High-level group label for a species, derived from interest_tags
   *  (added in migration 29). One species can have multiple tags
   *  (e.g. Sambucus is both tree_fruit and flower_aromatic) — picks
   *  the first by the priority order below.
   *
   *  This replaces the earlier per-genus grouping (one row per genus
   *  like Apple / Cherry / Hickory) which made the chart very long.
   *  At ~100 species the per-genus chart had ~50 rows; the high-level
   *  grouping has 8. */
  const GROUP_PRIORITY: Array<{ tag: string; label: string }> = [
    { tag: 'tree_fruit',                   label: 'Tree fruit' },
    { tag: 'mediterranean_tropical_fruit', label: 'Mediterranean & tropical fruit' },
    { tag: 'bramble_berry',                label: 'Berries & brambles' },
    { tag: 'nut_easy',                     label: 'Nuts' },
    { tag: 'nut_intensive',                label: 'Nuts' },
    { tag: 'sap_syrup',                    label: 'Sap' },
    { tag: 'flower_aromatic',              label: 'Flowers & aromatics' },
    { tag: 'wild_green',                   label: 'Wild greens & herbs' },
    { tag: 'mushroom_beginner',            label: 'Mushrooms' },
    { tag: 'mushroom_advanced',            label: 'Mushrooms' },
    { tag: 'root_tuber',                   label: 'Roots & tubers' }
  ];
  /** Group sort order — same shape as the welcome flow's INTEREST_GROUPS. */
  const GROUP_ORDER: Record<string, number> = (() => {
    const seen = new Set<string>();
    const out: Record<string, number> = {};
    let i = 0;
    for (const { label } of GROUP_PRIORITY) {
      if (!seen.has(label)) { seen.add(label); out[label] = i++; }
    }
    out['Other'] = i;
    return out;
  })();
  function groupOf(s: Species): string {
    const tags = ((s as unknown as { interest_tags?: string[] }).interest_tags) ?? [];
    for (const p of GROUP_PRIORITY) {
      if (tags.includes(p.tag)) return p.label;
    }
    return 'Other';
  }

  /** Species that get a row on the timeline = species with curated
   *  windows OR with at least one observation in this region. The
   *  observation-only species let users see "the community has data
   *  here even though no curated bar exists" — observations are
   *  authoritative even without a formal window. Curated stages are
   *  rendered as bars; observation-only rows show ticks alone. */
  $: speciesWithWindows = (() => {
    const ids = new Set<string>([...Object.keys(windowsBySpecies)]);
    for (const id of Object.keys(obsBySpecies)) ids.add(id);
    const rows: Array<{ id: string; species: Species; stages: Record<string, WindowRow> }> = [];
    for (const id of ids) {
      const sp = speciesById[id];
      if (!sp) continue;
      rows.push({ id, species: sp, stages: windowsBySpecies[id] ?? {} });
    }
    return rows.sort((a, b) => {
      const ga = groupOf(a.species);
      const gb = groupOf(b.species);
      const oa = GROUP_ORDER[ga] ?? 99;
      const ob = GROUP_ORDER[gb] ?? 99;
      if (oa !== ob) return oa - ob;
      return a.species.common_name.localeCompare(b.species.common_name);
    });
  })();

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
  {:else if regionsWithWindows.length === 0}
    <p class="intro">
      Harvest windows are regional — Ithaca's apple bloom doesn't predict
      San Diego's. No region has curated harvest data yet. Add a region
      and seed some species to populate this page.
    </p>
  {:else}
    <div class="region-row">
      <label>
        Showing harvest windows for:
        {#if regionsWithWindows.length === 1}
          <strong class="single-region">{regionsWithWindows[0].name}</strong>
        {:else}
          <select bind:value={selectedRegionId} on:change={onRegionChange}>
            {#each regionsWithWindows as r}
              <option value={r.id}>{r.name}</option>
            {/each}
          </select>
        {/if}
      </label>
    </div>
    <p class="intro">
      Harvest windows are regional — these dates apply to the selected region
      only and will differ elsewhere. The red line is today. Tick marks above
      each bar are observations. Click any bar to edit its start/end dates.
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
                      {@const isEstimated = stages[stage].confidence && stages[stage].confidence !== 'curated'}
                      <button
                        type="button"
                        class="stage-bar"
                        class:estimated={isEstimated}
                        style={`left: ${doyToPct(stages[stage].start_doy)}%; width: ${doyToPct(stages[stage].end_doy) - doyToPct(stages[stage].start_doy)}%; background: ${STAGE_COLORS[stage] ?? '#888'};`}
                        title={isEstimated
                          ? `${stage}: ${doyToDate(stages[stage].start_doy)} – ${doyToDate(stages[stage].end_doy)} · estimated from frost-date offsets — log a ripe observation to refine`
                          : `${stage}: ${doyToDate(stages[stage].start_doy)} – ${doyToDate(stages[stage].end_doy)} · click to edit`}
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

    <p class="attribution">
      <strong>Source:</strong> {seedCitation}
      Edits made here override the defaults; bars also stretch when
      observations of that stage fall outside the predicted window.
    </p>
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
  .region-row {
    margin: 0 0 0.5rem;
    font-size: 0.95rem;
    color: #1f2a1f;
  }
  .region-row label {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }
  .region-row select {
    padding: 0.3rem 0.5rem;
    border: 1px solid #c7d0c7;
    border-radius: 0.3rem;
    font-size: 0.95rem;
    background: white;
  }
  .single-region { color: #3a5a3a; }
  .intro { color: #4a554a; font-size: 0.9rem; margin: 0 0 1rem; }
  .error { color: #b03030; font-size: 0.9rem; }
  .attribution {
    margin: 1.25rem 0 0;
    padding: 0.65rem 0.85rem;
    background: #f5f8f5;
    border: 1px solid #e1e8e1;
    border-radius: 0.35rem;
    font-size: 0.78rem;
    color: #4a554a;
    line-height: 1.5;
  }
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
    position: sticky;
    top: 56px; /* matches the page header height */
    z-index: 5;
    background: #fafcf6;
    height: 1.2rem;
    margin-left: var(--left-offset);
    margin-bottom: 0.3rem;
    padding: 0.15rem 0;
    font-size: 0.7rem;
    color: #6b7a6b;
    border-bottom: 1px solid #d8e0d0;
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
  /* Estimated (confidence = 'frost_offset') — fade the fill and use
   * a dashed outline so the user sees this is a derived value, not
   * curator-authored. Hovering bumps the opacity so the bar feels
   * interactive again. Tooltip explains the source. */
  .stage-bar.estimated {
    opacity: 0.55;
    background-image: repeating-linear-gradient(
      45deg,
      transparent,
      transparent 4px,
      rgba(255, 255, 255, 0.35) 4px,
      rgba(255, 255, 255, 0.35) 6px
    );
    box-shadow: inset 0 0 0 1px rgba(31, 42, 31, 0.4);
    border: 1px dashed rgba(31, 42, 31, 0.6);
    box-sizing: border-box;
  }
  .stage-bar.estimated:hover { opacity: 0.85; }
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
