<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { activeRegion } from '$lib/stores/activeRegion';
  import { listAll as listSpecies, type Species } from '$lib/services/speciesService';
  import { supabase } from '$lib/supabase';

  type WindowRow = {
    id: string;
    species_id: string;
    region_id: string;
    stage: string;
    start_doy: number;
    end_doy: number;
  };

  let species: Species[] = [];
  let windows: WindowRow[] = [];
  let loading = true;
  let saving = '';
  let errorMessage = '';

  const STAGES = ['flowering', 'green', 'ripening', 'ripe', 'past'] as const;

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
        const { data, error } = await supabase
          .from('species_fruiting_windows')
          .select('id, species_id, region_id, stage, start_doy, end_doy')
          .eq('region_id', $activeRegion.id);
        if (error) throw error;
        windows = data ?? [];
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Failed to load.';
    } finally {
      loading = false;
    }
  }

  function doyToDate(doy: number): string {
    const d = new Date(2024, 0, doy);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  async function updateWindow(w: WindowRow, field: 'start_doy' | 'end_doy', value: number) {
    saving = w.id;
    errorMessage = '';
    try {
      const patch =
        field === 'start_doy' ? { start_doy: value } : { end_doy: value };
      const { error } = await supabase
        .from('species_fruiting_windows')
        .update(patch)
        .eq('id', w.id);
      if (error) throw error;
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Save failed.';
    } finally {
      saving = '';
    }
  }

  function onStartChange(e: Event, w: WindowRow) {
    updateWindow(w, 'start_doy', Number((e.target as HTMLInputElement).value));
  }
  function onEndChange(e: Event, w: WindowRow) {
    updateWindow(w, 'end_doy', Number((e.target as HTMLInputElement).value));
  }
</script>

<header>
  <button class="back" on:click={() => goto('/')}>← Back</button>
  <h1>Edit harvest windows</h1>
</header>

<main>
  {#if loading}
    <p class="hint">Loading…</p>
  {:else if errorMessage}
    <p class="error">{errorMessage}</p>
  {:else}
    <p class="intro">
      Approximate day-of-year windows per species per stage in your region.
      Numbers are day-of-year (Jan 1 = 1). Edits save immediately.
    </p>
    <table>
      <thead>
        <tr>
          <th>Species</th>
          <th>Stage</th>
          <th>Start (DOY)</th>
          <th>End (DOY)</th>
          <th>Approx</th>
        </tr>
      </thead>
      <tbody>
        {#each Object.entries(windowsBySpecies) as [speciesId, stages]}
          {@const s = speciesById[speciesId]}
          {#if s}
            {#each STAGES as stage}
              {#if stages[stage]}
                <tr>
                  <td>{s.common_name}</td>
                  <td class="stage">{stage}</td>
                  <td>
                    <input
                      type="number"
                      min="1"
                      max="366"
                      value={stages[stage].start_doy}
                      on:change={(e) => onStartChange(e, stages[stage])}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="1"
                      max="366"
                      value={stages[stage].end_doy}
                      on:change={(e) => onEndChange(e, stages[stage])}
                    />
                  </td>
                  <td class="muted">{doyToDate(stages[stage].start_doy)} – {doyToDate(stages[stage].end_doy)}</td>
                </tr>
              {/if}
            {/each}
          {/if}
        {/each}
      </tbody>
    </table>
  {/if}
</main>

<style>
  header { display: flex; align-items: center; gap: 1rem; padding: 0.5rem 1rem; background: white; border-bottom: 1px solid #e1e8e1; height: 56px; box-sizing: border-box; }
  header h1 { margin: 0; font-size: 1.05rem; color: #3a5a3a; }
  .back { background: transparent; border: 0; color: #3a5a3a; font-size: 0.9rem; cursor: pointer; }
  main { padding: 1rem; max-width: 60rem; margin: 0 auto; }
  .intro { color: #4a554a; font-size: 0.9rem; margin: 0 0 1rem; }
  .error { color: #b03030; font-size: 0.9rem; }
  .hint { color: #6b7a6b; }
  .muted { color: #8a948a; font-size: 0.85rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  th, td { padding: 0.35rem 0.5rem; text-align: left; border-bottom: 1px solid #ebefeb; }
  th { color: #6b7a6b; font-weight: 600; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em; }
  td.stage { color: #4a554a; font-style: italic; }
  input[type='number'] { width: 4rem; padding: 0.2rem 0.35rem; border: 1px solid #c7d0c7; border-radius: 0.25rem; font-size: 0.85rem; }
</style>
