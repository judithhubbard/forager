<script lang="ts">
  // "Edit my interests" — expandable per-group editor with per-species
  // checkboxes inside each group. Loads species + tags + the user's
  // current preferences once, lets the user toggle anything they want,
  // then writes back the full set on save.
  //
  // Group checkbox is a "select all in group" shortcut; species
  // checkboxes give precise control. The group state shows ✓ when all
  // species are on, ☐ when all off, and an indeterminate dash when
  // mixed (custom selection within the group).
  import { goto } from '$lib/utils/nav';
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  import {
    INTEREST_GROUPS,
    type InterestGroup
  } from '$lib/utils/interestGroups';
  import {
    listMine,
    upsertMany,
    removeAllMine
  } from '$lib/services/userPreferencesService';
  import { loadFromServer as reloadUserPrefs } from '$lib/stores/userPreferences';
  import {
    settings,
    setShowInvasives,
    setDefaultPhotoLicense,
    type PhotoLicense
  } from '$lib/stores/settings';

  function onInvasiveOptin(e: Event) {
    setShowInvasives((e.currentTarget as HTMLInputElement).checked);
  }

  const PHOTO_LICENSE_OPTIONS: { value: PhotoLicense; label: string }[] = [
    { value: 'CC-BY-SA-4.0',        label: 'CC BY-SA 4.0 (share-alike, default)' },
    { value: 'CC-BY-4.0',           label: 'CC BY 4.0 (attribution)' },
    { value: 'CC-BY-NC-SA-4.0',     label: 'CC BY-NC-SA 4.0 (non-commercial)' },
    { value: 'CC0',                 label: 'CC0 (public domain)' },
    { value: 'all-rights-reserved', label: 'All rights reserved' }
  ];

  function onPhotoLicenseChange(e: Event) {
    setDefaultPhotoLicense((e.currentTarget as HTMLSelectElement).value as PhotoLicense);
  }

  interface SpeciesRow {
    id: string;
    common_name: string;
    scientific_name: string;
    interest_tags: string[];
  }

  let allSpecies: SpeciesRow[] = [];
  let enabledById = new Map<string, boolean>();
  let expanded = new Set<InterestGroup>();
  let loaded = false;
  let busy = false;
  let errorMsg = '';

  onMount(async () => {
    const [resp, prefs] = await Promise.all([
      supabase
        .from('species')
        .select('id, common_name, scientific_name, interest_tags' as never)
        .order('common_name'),
      listMine()
    ]);
    if (resp.error) {
      errorMsg = resp.error.message;
      loaded = true;
      return;
    }
    allSpecies = ((resp.data ?? []) as unknown as Array<{
      id: string;
      common_name: string;
      scientific_name: string;
      interest_tags: string[] | null;
    }>).map((s) => ({
      id: s.id,
      common_name: s.common_name,
      scientific_name: s.scientific_name,
      interest_tags: s.interest_tags ?? []
    }));
    // Default: any species without an explicit pref row is enabled.
    const m = new Map<string, boolean>();
    for (const s of allSpecies) m.set(s.id, true);
    for (const p of prefs) m.set(p.speciesId, p.enabled);
    enabledById = m;
    loaded = true;
  });

  /** Group → species[] derived from the catalog. A species can appear
   *  in more than one group (Sambucus is both tree_fruit and
   *  flower_aromatic, for example) — that's intentional, the group is
   *  a UX label, not a partition. */
  $: speciesByGroup = (() => {
    const out = new Map<InterestGroup, SpeciesRow[]>();
    for (const g of INTEREST_GROUPS) out.set(g.id, []);
    for (const s of allSpecies) {
      for (const t of s.interest_tags) {
        const arr = out.get(t as InterestGroup);
        if (arr) arr.push(s);
      }
    }
    return out;
  })();

  /** all-on / all-off / mixed for the group's species, given the
   *  current local enabledById state. */
  function groupState(group: InterestGroup): 'all' | 'none' | 'mixed' {
    const list = speciesByGroup.get(group) ?? [];
    if (list.length === 0) return 'none';
    let on = 0;
    for (const s of list) if (enabledById.get(s.id)) on++;
    if (on === 0) return 'none';
    if (on === list.length) return 'all';
    return 'mixed';
  }

  function setSpecies(id: string, enabled: boolean) {
    const m = new Map(enabledById);
    m.set(id, enabled);
    enabledById = m;
  }

  function setGroup(group: InterestGroup, enabled: boolean) {
    const m = new Map(enabledById);
    for (const s of speciesByGroup.get(group) ?? []) m.set(s.id, enabled);
    enabledById = m;
  }

  function toggleExpand(group: InterestGroup) {
    const next = new Set(expanded);
    if (next.has(group)) next.delete(group);
    else next.add(group);
    expanded = next;
  }

  function onSpeciesChange(id: string, e: Event) {
    setSpecies(id, (e.currentTarget as HTMLInputElement).checked);
  }
  function onGroupChange(group: InterestGroup, e: Event) {
    setGroup(group, (e.currentTarget as HTMLInputElement).checked);
  }

  async function save() {
    if (busy) return;
    busy = true;
    errorMsg = '';
    try {
      const rows = allSpecies.map((s) => ({
        speciesId: s.id,
        enabled: enabledById.get(s.id) ?? true
      }));
      // Replace-all semantics: clear then write so de-disabled species
      // become rows we can see, and re-default species drop their row.
      await removeAllMine();
      // Only write rows where enabled=false (the deny-list set) +
      // explicit enabled=true if the user wants it on the row.
      // Simpler: write everything; the table is small. This makes the
      // state authoritative and explicit on a save.
      await upsertMany(rows);
      await reloadUserPrefs();
      goto('/');
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Failed to save.';
    } finally {
      busy = false;
    }
  }

  async function showEverything() {
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

  /** Set indeterminate state on group checkbox via DOM ref — Svelte
   *  doesn't have a binding for this. */
  function applyIndeterminate(node: HTMLInputElement, mixed: boolean) {
    node.indeterminate = mixed;
    return {
      update(newMixed: boolean) { node.indeterminate = newMixed; }
    };
  }
</script>

<header>
  <button class="back" on:click={() => goto('/')}>← Back</button>
  <h1>Preferences</h1>
</header>

<main>
  <h2 class="section-heading">Foraging interests</h2>
  <p class="lead">
    Pick the categories you want the app to track. Expand any category
    to fine-tune individual species. Species in unchecked categories
    stay in the catalog but won't appear on the map or filter panel.
  </p>
  {#if errorMsg}<p class="error">{errorMsg}</p>{/if}
  {#if !loaded}
    <p class="hint">Loading…</p>
  {:else}
    <ul class="groups">
      {#each INTEREST_GROUPS as g}
        {@const list = speciesByGroup.get(g.id) ?? []}
        {@const state = groupState(g.id)}
        {@const isOpen = expanded.has(g.id)}
        <li class="group" class:open={isOpen}>
          <div class="group-row">
            <label class="group-label">
              <input
                type="checkbox"
                checked={state === 'all'}
                use:applyIndeterminate={state === 'mixed'}
                on:change={(e) => onGroupChange(g.id, e)}
              />
              <div class="text">
                <div class="title">
                  <strong>{g.label}</strong>
                  <span class="group-count">({list.length})</span>
                  {#if g.caution}<span class="caution"> · {g.caution}</span>{/if}
                </div>
                <div class="examples">{g.examples}</div>
                <div class="coverage">{g.coverage}</div>
              </div>
            </label>
            <button
              type="button"
              class="expand-btn"
              on:click={() => toggleExpand(g.id)}
              aria-expanded={isOpen}
              aria-label={isOpen ? 'Collapse' : 'Expand'}
            >
              {isOpen ? '▾' : '▸'}
            </button>
          </div>
          {#if isOpen}
            <ul class="species-list">
              {#each list as s (s.id)}
                <li>
                  <label>
                    <input
                      type="checkbox"
                      checked={enabledById.get(s.id) ?? true}
                      on:change={(e) => onSpeciesChange(s.id, e)}
                    />
                    <span class="sp-common">{s.common_name}</span>
                    <span class="sp-sci">{s.scientific_name}</span>
                  </label>
                </li>
              {/each}
            </ul>
          {/if}
        </li>
      {/each}
    </ul>
    <!-- Invasive opt-in: parallel to the per-group foraging picker
         above, but a different axis (management vs harvest). Toggling
         this flips the same Layers > "Invasives" setting users can
         change ad hoc on the map. -->
    <label class="invasive-optin">
      <input
        type="checkbox"
        checked={$settings.showInvasives}
        on:change={onInvasiveOptin}
      />
      <div class="invasive-text">
        <strong>Also show non-forageable species</strong>
        <span class="invasive-hint">
          Some non-forageable trees (Norway maple, tree of heaven, etc.) show
          up in city tree inventories. Edible forageable species that happen
          to be invasive (autumn olive, wineberry, knotweed shoots) are
          always shown — eating them is foraging, and it helps control their
          spread.
        </span>
      </div>
    </label>

    <h2 class="section-heading">Photo upload</h2>
    <p class="lead small">
      Default license for photos you upload to pins. Saves automatically.
      You can override per-photo on the upload form.
    </p>
    <label class="photo-license">
      <span class="ph-label">License</span>
      <select value={$settings.defaultPhotoLicense} on:change={onPhotoLicenseChange}>
        {#each PHOTO_LICENSE_OPTIONS as o}
          <option value={o.value}>{o.label}</option>
        {/each}
      </select>
    </label>

    <div class="actions">
      <button type="button" class="link-btn" on:click={showEverything} disabled={busy}>
        Reset — show me everything
      </button>
      <button type="button" class="primary" on:click={save} disabled={busy}>
        {busy ? 'Saving…' : 'Save'}
      </button>
    </div>
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
  .invasive-optin {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    margin-top: 1rem;
    padding: 0.7rem 0.85rem;
    background: #fbf0e8;
    border: 1px solid #d8a880;
    border-radius: 0.4rem;
    cursor: pointer;
  }
  .invasive-optin input[type='checkbox'] {
    margin-top: 0.2rem;
    width: 1.1rem;
    height: 1.1rem;
    flex-shrink: 0;
  }
  .invasive-text { display: flex; flex-direction: column; gap: 0.15rem; }
  .invasive-text strong { color: #5e3920; font-size: 0.92rem; }
  .invasive-hint { color: #5e3920; font-size: 0.83rem; line-height: 1.4; }
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
  .lead.small { font-size: 0.88rem; margin-top: 0.3rem; }
  .hint { color: #6b7a6b; }
  .error { color: #b03030; font-size: 0.9rem; }

  .section-heading {
    margin: 1.6rem 0 0.4rem;
    font-size: 0.95rem;
    color: #3a5a3a;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .section-heading:first-of-type { margin-top: 0; }

  .photo-license {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    margin-top: 0.5rem;
    padding: 0.6rem 0.8rem;
    background: white;
    border: 1px solid #c7d0c7;
    border-radius: 0.4rem;
  }
  .ph-label {
    font-size: 0.85rem;
    color: #4a554a;
  }
  .photo-license select {
    padding: 0.35rem 0.5rem;
    border: 1px solid #c7d0c7;
    border-radius: 0.25rem;
    background: white;
    font-size: 0.9rem;
  }

  ul.groups {
    list-style: none;
    margin: 1rem 0 1rem;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .group {
    background: white;
    border: 1px solid #c7d0c7;
    border-radius: 0.4rem;
    padding: 0.6rem 0.8rem;
  }
  .group-row {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
  }
  .group-label {
    flex: 1;
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    cursor: pointer;
    min-width: 0;
  }
  .group-label input[type='checkbox'] {
    margin-top: 0.2rem;
    width: 1.1rem;
    height: 1.1rem;
  }
  .text { flex: 1; min-width: 0; }
  .title { font-size: 0.95rem; color: #1f2a1f; }
  .group-count { color: #6b7a6b; font-weight: 400; font-size: 0.85rem; }
  .caution { color: #8a4f10; font-size: 0.82rem; font-style: italic; font-weight: normal; }
  .examples { color: #4a554a; font-size: 0.83rem; margin-top: 0.15rem; }
  .coverage { color: #6b7a6b; font-size: 0.78rem; margin-top: 0.1rem; font-style: italic; }

  .expand-btn {
    background: transparent;
    border: 0;
    color: #3a5a3a;
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    padding: 0.3rem 0.4rem;
    align-self: center;
  }

  ul.species-list {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0.5rem 0 0 1.7rem;
    border-top: 1px solid #ebefeb;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  ul.species-list label {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    cursor: pointer;
    font-size: 0.88rem;
  }
  ul.species-list input[type='checkbox'] {
    width: 1rem;
    height: 1rem;
  }
  .sp-common { color: #1f2a1f; }
  .sp-sci { color: #6b7a6b; font-style: italic; font-size: 0.82rem; }

  .actions {
    display: flex;
    gap: 0.5rem;
    justify-content: space-between;
    align-items: center;
    margin-top: 0.8rem;
  }
  .link-btn {
    background: transparent;
    border: 0;
    color: #3a5a3a;
    font-size: 0.9rem;
    cursor: pointer;
    text-decoration: underline;
    padding: 0.4rem 0;
  }
  .primary {
    padding: 0.55rem 1.2rem;
    border-radius: 0.35rem;
    border: 1px solid #3a5a3a;
    background: #3a5a3a;
    color: white;
    font-size: 0.95rem;
    cursor: pointer;
  }
  .primary:disabled { opacity: 0.6; cursor: default; }
</style>
