<script lang="ts">
  // Browseable species index — every forageable species in the catalog,
  // grouped by interest tag (tree fruit, brambles, mushrooms, etc.) with
  // search + click-through to individual species pages. Anon-readable.
  //
  // This was missing — the species filter panel on the map only shows
  // species that have pins in the current bbox, and there was no other
  // way to browse the catalog.

  import { onMount, tick } from 'svelte';
  import { base } from '$app/paths';
  import { goto } from '$lib/utils/nav';
  import { supabase } from '$lib/supabase';
  import { browser } from '$app/environment';
  import { INTEREST_GROUPS, type InterestGroup } from '$lib/utils/interestGroups';
  import ToolsMenu from '$lib/components/ToolsMenu.svelte';

  interface Row {
    id: string;
    common_name: string;
    scientific_name: string;
    forage_parts: string[];
    interest_tags: string[];
    image_url: string | null;
    aliases: string[];
  }

  interface ZonePresence {
    species_id: string;
    zone_code: string;
    n_pins: number;
    has_window: boolean;
  }

  let species: Row[] = [];
  let zonePresence: ZonePresence[] = [];
  let zoneOptions: string[] = [];
  let speciesByZone: Map<string, Set<string>> = new Map();
  let loaded = false;
  let errorMsg = '';

  // Initial state pulled from URL search params so back-navigation
  // restores the filters the user had set when they clicked through
  // to a species detail page.
  function initialFromUrl<T extends string>(key: string, fallback: T): T {
    if (!browser) return fallback;
    try {
      const v = new URLSearchParams(window.location.search).get(key);
      return (v ?? fallback) as T;
    } catch {
      return fallback;
    }
  }

  let searchTerm = initialFromUrl('q', '');
  let activeGroup: InterestGroup | 'all' = initialFromUrl('group', 'all') as InterestGroup | 'all';
  let activeZone: string | 'all' = initialFromUrl('zone', 'all');

  // URL state management. We use `replaceState` for incremental
  // changes (typing into the search box, toggling pills) so the
  // browser history isn't spammed with one entry per keystroke.
  // But we DO call `pushState` the first time filters transition
  // from "none active" to "any active", because:
  //
  //   - User lands on /species (no filters), browses, clicks a card → /species/[id]
  //   - User lands on /species, searches "cleavers" → /species?q=cleavers
  //     (replaceState — same history entry)
  //   - User clicks a result → /species/[id]
  //   - User hits Back → /species?q=cleavers (the replaced entry)
  //
  // Without the pushState-on-first-filter, that final Back appears
  // to do nothing because the user is already on the filtered
  // catalog view (which they just came from). They have to hit
  // Back a second time to escape to the map.
  //
  // Heuristic: track whether the URL currently HAS any filter; when
  // the new URL HAS a filter but the previous one DIDN'T, push.
  // Subsequent edits of the same active-filter state replace.
  let mounted = false;
  let hadFilterInUrl = browser && window.location.search.length > 0;
  $: if (mounted && browser) {
    const params = new URLSearchParams();
    if (searchTerm.trim()) params.set('q', searchTerm.trim());
    if (activeGroup !== 'all') params.set('group', activeGroup as string);
    if (activeZone !== 'all') params.set('zone', activeZone);
    const qs = params.toString();
    const next = qs ? '?' + qs : window.location.pathname;
    const currentQs = window.location.search.replace(/^\?/, '');
    if (currentQs !== qs) {
      // Transition from no-filter → first-filter creates a real
      // history entry; subsequent edits replace.
      const transitionToFiltered = !hadFilterInUrl && qs.length > 0;
      try {
        if (transitionToFiltered) {
          window.history.pushState(null, '', next);
        } else {
          window.history.replaceState(null, '', next);
        }
      } catch { /* no-op */ }
      hadFilterInUrl = qs.length > 0;
    }
  }

  onMount(async () => {
    try {
      const [spRes, zpRes] = await Promise.all([
        supabase
          .from('species')
          .select('id, common_name, scientific_name, forage_parts, interest_tags, image_url, aliases' as never)
          .eq('is_forageable', true)
          .order('common_name'),
        supabase.rpc('species_zone_presence_all' as never, {} as never)
      ]);
      if (spRes.error) throw spRes.error;
      species = (spRes.data ?? []) as unknown as Row[];

      if (!zpRes.error) {
        zonePresence = (zpRes.data ?? []) as unknown as ZonePresence[];
        const byZone = new Map<string, Set<string>>();
        const zonesSet = new Set<string>();
        for (const r of zonePresence) {
          zonesSet.add(r.zone_code);
          let s = byZone.get(r.zone_code);
          if (!s) { s = new Set<string>(); byZone.set(r.zone_code, s); }
          s.add(r.species_id);
        }
        speciesByZone = byZone;
        zoneOptions = [...zonesSet].sort((a, b) => {
          const re = /^(\d+)([ab]?)$/;
          const ma = a.match(re), mb = b.match(re);
          if (!ma || !mb) return a.localeCompare(b);
          const na = parseInt(ma[1], 10) + (ma[2] === 'b' ? 0.5 : 0);
          const nb = parseInt(mb[1], 10) + (mb[2] === 'b' ? 0.5 : 0);
          return na - nb;
        });
      }
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Failed to load.';
    } finally {
      loaded = true;
      await tick();
      mounted = true;
    }
  });

  $: filteredSpecies = (() => {
    let list = species;
    if (activeGroup !== 'all') {
      list = list.filter((s) => s.interest_tags.includes(activeGroup as string));
    }
    if (activeZone !== 'all') {
      const presentInZone = speciesByZone.get(activeZone as string);
      if (presentInZone) list = list.filter((s) => presentInZone.has(s.id));
      else list = [];
    }
    if (searchTerm.trim()) {
      const t = searchTerm.toLowerCase();
      list = list.filter(
        (s) =>
          s.common_name.toLowerCase().includes(t) ||
          s.scientific_name.toLowerCase().includes(t) ||
          s.forage_parts.some((p) => p.toLowerCase().includes(t)) ||
          (s.aliases ?? []).some((a) => a.toLowerCase().includes(t))
      );
    }
    return list;
  })();

  /** When the active search matched an alias rather than the common
   *  name, surface that match so the user understands why the row
   *  appears. Returns the first matching alias for the current term,
   *  or null when the common/scientific name already explains the
   *  match. */
  function matchedAlias(s: Row): string | null {
    const t = searchTerm.trim().toLowerCase();
    if (!t) return null;
    if (s.common_name.toLowerCase().includes(t)) return null;
    if (s.scientific_name.toLowerCase().includes(t)) return null;
    const hit = (s.aliases ?? []).find((a) => a.toLowerCase().includes(t));
    return hit ?? null;
  }

  $: speciesById = new Map(species.map((s) => [s.id, s] as const));

  /** Interest-group pill counts reflect the active zone filter (faceted
   *  search): selecting zone 5b updates "Tree fruit (N)" to mean
   *  "tree-fruit species present in zone 5b", not the global total.
   *  Search input intentionally does NOT feed in — re-counting on
   *  every keystroke is jumpy and the pills already gate categorical
   *  choices, not text matches. */
  $: groupCounts = (() => {
    const zoneSet = activeZone === 'all' ? null : speciesByZone.get(activeZone as string);
    const out = new Map<string, number>();
    for (const s of species) {
      if (zoneSet && !zoneSet.has(s.id)) continue;
      for (const t of s.interest_tags) out.set(t, (out.get(t) ?? 0) + 1);
    }
    return out;
  })();

  /** Total species available with current zone filter (drives "All (N)").
   *  Same exclusion rule as groupCounts — zone applied, search excluded. */
  $: zoneFilteredCount = (() => {
    if (activeZone === 'all') return species.length;
    const zoneSet = speciesByZone.get(activeZone as string);
    return zoneSet ? zoneSet.size : 0;
  })();

  /** Zone-dropdown counts reflect the active interest-group filter so
   *  the dropdown numbers mirror the pill numbers. With no group
   *  selected, this is the same as speciesByZone.get(z).size. With a
   *  group selected, it's the intersection. */
  $: zoneCounts = (() => {
    const out = new Map<string, number>();
    const allowedTag = activeGroup === 'all' ? null : (activeGroup as string);
    for (const z of zoneOptions) {
      const ids = speciesByZone.get(z) ?? new Set<string>();
      if (!allowedTag) { out.set(z, ids.size); continue; }
      let n = 0;
      for (const id of ids) {
        const s = speciesById.get(id);
        if (s && s.interest_tags.includes(allowedTag)) n++;
      }
      out.set(z, n);
    }
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

    <div class="filter-row">
      <input
        class="search"
        type="search"
        bind:value={searchTerm}
        placeholder="Search by name or forage part (fruit, leaf, mushroom, sap…)"
      />
      {#if zoneOptions.length > 0}
        <label class="zone-pick" title="Filter to species with public pins or calibration data in this USDA hardiness zone. Counts reflect the active interest-group pill.">
          <span class="zp-label">USDA zone</span>
          <select bind:value={activeZone}>
            <option value="all">all</option>
            {#each zoneOptions as z}
              <option value={z}>{z} ({zoneCounts.get(z) ?? 0})</option>
            {/each}
          </select>
        </label>
      {/if}
    </div>

    <div class="group-filters">
      <button class="gf" class:active={activeGroup === 'all'} on:click={() => (activeGroup = 'all')}>
        All <span class="gf-count">{zoneFilteredCount}</span>
      </button>
      {#each INTEREST_GROUPS as g}
        {@const n = groupCounts.get(g.id) ?? 0}
        <button
          class="gf"
          class:active={activeGroup === g.id}
          class:empty={n === 0}
          disabled={n === 0 && activeGroup !== g.id}
          on:click={() => (activeGroup = g.id)}
          title={n === 0 ? `No ${g.label.toLowerCase()} species in this zone` : g.examples}
        >
          {g.label} <span class="gf-count">{n}</span>
        </button>
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
                {#if matchedAlias(s)}
                  {@const m = matchedAlias(s)}
                  <div class="alias-hit" title="Matched by alias">also: {m}</div>
                {/if}
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
  .filter-row {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.6rem;
    align-items: stretch;
    flex-wrap: wrap;
  }
  .search {
    flex: 1;
    min-width: 16rem;
    box-sizing: border-box;
    padding: 0.55rem 0.75rem;
    font-size: 0.95rem;
    border: 1px solid #c7d0c7;
    border-radius: 0.4rem;
  }
  .zone-pick {
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 0.25rem 0.6rem;
    border: 1px solid #c7d0c7;
    border-radius: 0.4rem;
    background: white;
    cursor: pointer;
  }
  .zp-label {
    font-size: 0.7rem;
    color: #6b7a6b;
  }
  .zone-pick select {
    border: 0;
    padding: 0.1rem 0;
    font-size: 0.9rem;
    color: #1f2a1f;
    background: transparent;
    font-variant-numeric: tabular-nums;
    min-width: 6rem;
    cursor: pointer;
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
  .gf:hover:not(:disabled) { background: #f0f5ef; }
  .gf.active { background: #3a5a3a; color: white; border-color: #3a5a3a; }
  .gf.empty {
    color: #b0b8b0;
    border-color: #e2e6e2;
    background: #fafbfa;
  }
  .gf:disabled { cursor: not-allowed; }
  .gf-count {
    color: #8a948a;
    font-size: 0.72rem;
    margin-left: 0.15rem;
  }
  .gf.active .gf-count { color: rgba(255,255,255,0.7); }
  .gf.empty .gf-count { color: #c4ccc4; }

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
  .alias-hit {
    font-size: 0.72rem;
    color: #8a728a;
    margin-top: 0.15rem;
    font-style: normal;
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
