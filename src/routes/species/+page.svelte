<script lang="ts">
  // Browseable species index — every forageable species in the catalog,
  // grouped by interest tag (tree fruit, brambles, mushrooms, etc.) with
  // search + click-through to individual species pages. Anon-readable.
  //
  // This was missing — the species filter panel on the map only shows
  // species that have pins in the current bbox, and there was no other
  // way to browse the catalog.

  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { goto } from '$lib/utils/nav';
  import { supabase } from '$lib/supabase';
  import { INTEREST_GROUPS, type InterestGroup } from '$lib/utils/interestGroups';
  import ToolsMenu from '$lib/components/ToolsMenu.svelte';

  interface Row {
    id: string;
    common_name: string;
    scientific_name: string;
    forage_parts: string[];
    interest_tags: string[];
    image_url: string | null;
  }

  let species: Row[] = [];
  let loaded = false;
  let errorMsg = '';
  let searchTerm = '';
  let activeGroup: InterestGroup | 'all' = 'all';

  onMount(async () => {
    try {
      const { data, error } = await supabase
        .from('species')
        .select('id, common_name, scientific_name, forage_parts, interest_tags, image_url' as never)
        .eq('is_forageable', true)
        .order('common_name');
      if (error) throw error;
      // Cast via unknown — generated types lag schema for interest_tags / image_url etc.
      species = (data ?? []) as unknown as Row[];
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Failed to load.';
    } finally {
      loaded = true;
    }
  });

  $: filteredSpecies = (() => {
    let list = species;
    if (activeGroup !== 'all') {
      list = list.filter((s) => s.interest_tags.includes(activeGroup as string));
    }
    if (searchTerm.trim()) {
      const t = searchTerm.toLowerCase();
      list = list.filter(
        (s) =>
          s.common_name.toLowerCase().includes(t) ||
          s.scientific_name.toLowerCase().includes(t) ||
          s.forage_parts.some((p) => p.toLowerCase().includes(t))
      );
    }
    return list;
  })();

  /** Group counts so the filter pills show the size. */
  $: groupCounts = (() => {
    const out = new Map<string, number>();
    for (const s of species) for (const t of s.interest_tags) out.set(t, (out.get(t) ?? 0) + 1);
    return out;
  })();
</script>

<svelte:head>
  <title>Species catalog · Forager</title>
</svelte:head>

<header>
  <button class="back" on:click={() => goto('/')}>← Map</button>
  <h1>Species catalog</h1>
  <div class="header-spacer"></div>
  <ToolsMenu />
</header>

<main>
  {#if !loaded}
    <p class="muted">Loading…</p>
  {:else if errorMsg}
    <p class="error">{errorMsg}</p>
  {:else}
    <p class="lead">
      All {species.length} forageable species in Forager's catalog. Filter by
      type, search by name or forage part, and click any species for its
      detail page (with images, edible parts, harvest tips, and harvest
      windows by climate zone).
    </p>

    <input
      class="search"
      type="search"
      bind:value={searchTerm}
      placeholder="Search by name or forage part (fruit, leaf, mushroom, sap…)"
    />

    <div class="group-filters">
      <button class="gf" class:active={activeGroup === 'all'} on:click={() => (activeGroup = 'all')}>
        All <span class="gf-count">{species.length}</span>
      </button>
      {#each INTEREST_GROUPS as g}
        {@const n = groupCounts.get(g.id) ?? 0}
        {#if n > 0}
          <button
            class="gf"
            class:active={activeGroup === g.id}
            on:click={() => (activeGroup = g.id)}
            title={g.examples}
          >
            {g.label} <span class="gf-count">{n}</span>
          </button>
        {/if}
      {/each}
    </div>

    {#if filteredSpecies.length === 0}
      <p class="muted">No species match your filter.</p>
    {:else}
      <ul class="species-grid">
        {#each filteredSpecies as s (s.id)}
          <li>
            <a class="species-card" href={base + '/species/' + s.id}>
              {#if s.image_url}
                <img class="thumb" src={s.image_url} alt="" loading="lazy" />
              {:else}
                <div class="thumb thumb-empty"></div>
              {/if}
              <div class="card-body">
                <div class="common">{s.common_name}</div>
                <div class="sci">{s.scientific_name}</div>
                <div class="parts">
                  {#each s.forage_parts as p}
                    <span class="part-chip">{p}</span>
                  {/each}
                </div>
              </div>
            </a>
          </li>
        {/each}
      </ul>
      <p class="muted small foot">
        Showing {filteredSpecies.length} of {species.length} species.
      </p>
    {/if}
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
  .header-spacer { flex: 1; }
  main {
    max-width: 60rem;
    margin: 0 auto;
    padding: 1rem 1.25rem 4rem;
    color: #1f2a1f;
  }
  .lead {
    color: #4a554a;
    font-size: 0.95rem;
    line-height: 1.5;
    margin: 0 0 0.8rem;
  }
  .muted { color: #6b7a6b; }
  .small { font-size: 0.78rem; }
  .error { color: #b03030; }
  .search {
    width: 100%;
    box-sizing: border-box;
    padding: 0.55rem 0.75rem;
    font-size: 0.95rem;
    border: 1px solid #c7d0c7;
    border-radius: 0.4rem;
    margin-bottom: 0.6rem;
  }
  .group-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-bottom: 1rem;
  }
  .gf {
    padding: 0.35rem 0.7rem;
    font-size: 0.8rem;
    border: 1px solid #c7d0c7;
    border-radius: 1rem;
    background: white;
    color: #4a554a;
    cursor: pointer;
  }
  .gf:hover { background: #f0f5ef; }
  .gf.active { background: #3a5a3a; color: white; border-color: #3a5a3a; }
  .gf-count {
    color: #8a948a;
    font-size: 0.72rem;
    margin-left: 0.15rem;
  }
  .gf.active .gf-count { color: rgba(255,255,255,0.7); }

  .species-grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
    gap: 0.6rem;
  }
  .species-card {
    display: flex;
    gap: 0.6rem;
    padding: 0.5rem;
    background: white;
    border: 1px solid #d0d8d0;
    border-radius: 0.4rem;
    text-decoration: none;
    color: inherit;
    align-items: center;
    transition: background 0.1s;
  }
  .species-card:hover { background: #f7faf6; border-color: #b3d0a8; }
  .thumb {
    width: 3.5rem;
    height: 3.5rem;
    object-fit: cover;
    border-radius: 0.3rem;
    flex-shrink: 0;
    background: #f0f5ef;
  }
  .thumb-empty {
    background: linear-gradient(135deg, #e8f0e3, #d3dfcb);
  }
  .card-body { flex: 1; min-width: 0; }
  .common {
    font-weight: 500;
    color: #1f2a1f;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sci {
    font-size: 0.78rem;
    color: #6b7a6b;
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .parts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem;
    margin-top: 0.2rem;
  }
  .part-chip {
    font-size: 0.68rem;
    padding: 0.05rem 0.35rem;
    background: #f0f5ef;
    color: #4a554a;
    border-radius: 0.2rem;
  }
  .foot { margin-top: 1.2rem; text-align: center; }
</style>
