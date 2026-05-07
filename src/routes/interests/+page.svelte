<script lang="ts">
  // "Edit my interests" — pulls the user's current per-species
  // preferences, derives which interest groups are mostly-enabled,
  // pre-selects them in the picker, and writes back the user's
  // chosen groups as a fresh per-species pref set.
  import { goto } from '$lib/utils/nav';
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  import InterestPicker from '$lib/components/InterestPicker.svelte';
  import {
    INTEREST_GROUPS,
    type InterestGroup
  } from '$lib/utils/interestGroups';
  import {
    applyInterestGroups,
    listMine,
    removeAllMine
  } from '$lib/services/userPreferencesService';
  import { loadFromServer as reloadUserPrefs } from '$lib/stores/userPreferences';

  let initial: InterestGroup[] = [];
  let loaded = false;
  let busy = false;
  let errorMsg = '';

  onMount(async () => {
    // Pull catalog tags + current prefs and figure out which groups
    // are 'mostly enabled' for this user — those become the pre-checked
    // boxes. A group is mostly-enabled if at least one of its species
    // is enabled (default-or-explicit). Empty prefs = everything
    // enabled = every group on.
    const [{ data: speciesRows, error }, prefs] = await Promise.all([
      supabase.from('species').select('id, interest_tags' as never),
      listMine()
    ]);
    if (error) {
      errorMsg = error.message;
      loaded = true;
      return;
    }
    const all = (speciesRows ?? []) as unknown as Array<{ id: string; interest_tags: string[] | null }>;
    const explicit = new Map(prefs.map((p) => [p.speciesId, p.enabled]));
    const groupHasEnabled = new Set<InterestGroup>();
    for (const s of all) {
      const enabled = explicit.has(s.id) ? explicit.get(s.id)! : true;
      if (!enabled) continue;
      for (const tag of s.interest_tags ?? []) {
        if (INTEREST_GROUPS.some((g) => g.id === tag)) {
          groupHasEnabled.add(tag as InterestGroup);
        }
      }
    }
    initial = [...groupHasEnabled];
    loaded = true;
  });

  async function onSubmit(e: CustomEvent<{ selected: InterestGroup[] }>) {
    if (busy) return;
    busy = true;
    errorMsg = '';
    try {
      await applyInterestGroups(e.detail.selected);
      await reloadUserPrefs();
      goto('/');
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Failed to save.';
    } finally {
      busy = false;
    }
  }

  async function onSkipAll() {
    if (busy) return;
    busy = true;
    errorMsg = '';
    try {
      await removeAllMine();
      await reloadUserPrefs();
      goto('/');
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Failed to reset.';
    } finally {
      busy = false;
    }
  }
</script>

<header>
  <button class="back" on:click={() => goto('/')}>← Back</button>
  <h1>My foraging interests</h1>
</header>

<main>
  <p class="lead">
    Pick the categories of foraging you want to track. Species in
    unchecked categories stay in the catalog but are hidden from the map
    and filter panel.
  </p>
  {#if errorMsg}<p class="error">{errorMsg}</p>{/if}
  {#if loaded}
    <InterestPicker
      selected={initial}
      submitLabel={busy ? 'Saving…' : 'Save'}
      on:submit={onSubmit}
      on:skipAll={onSkipAll}
    />
  {:else}
    <p class="hint">Loading…</p>
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
  header h1 { margin: 0; font-size: 1.05rem; color: #3a5a3a; }
  .back {
    background: transparent;
    border: 0;
    color: #3a5a3a;
    font-size: 0.9rem;
    cursor: pointer;
  }
  main {
    max-width: 36rem;
    margin: 0 auto;
    padding: 1rem 1.25rem 3rem;
    color: #1f2a1f;
  }
  .lead { color: #4a554a; font-size: 0.95rem; line-height: 1.5; }
  .hint { color: #6b7a6b; }
  .error { color: #b03030; font-size: 0.9rem; }
</style>
