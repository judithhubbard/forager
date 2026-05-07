<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$lib/utils/nav';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { listAll as listSpecies, type Species } from '$lib/services/speciesService';
  import { session } from '$lib/stores/auth';
  import {
    isWatchingSpecies,
    watchSpecies,
    unwatch,
    type WatchlistRow
  } from '$lib/services/watchlistService';

  let species: Species | null = null;
  let loading = true;
  let error = '';
  let watching: WatchlistRow | null = null;
  let watchBusy = false;

  $: speciesId = $page.params.id;

  onMount(async () => {
    try {
      const all = await listSpecies();
      species = all.find((s) => s.id === speciesId) ?? null;
      if (!species) error = 'Species not found.';
      else if ($session) {
        watching = await isWatchingSpecies(species.id);
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not load species.';
    } finally {
      loading = false;
    }
  });

  async function toggleWatch() {
    if (!species) return;
    watchBusy = true;
    try {
      if (watching) {
        await unwatch(watching.id);
        watching = null;
      } else {
        const id = await watchSpecies(species.id);
        watching = {
          id,
          user_id: $session?.user?.id ?? '',
          species_id: species.id,
          pin_id: null,
          notify_email: true,
          notify_in_app: true,
          created_at: new Date().toISOString()
        };
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not update watch.';
    } finally {
      watchBusy = false;
    }
  }

  function back() {
    if (history.length > 1) history.back();
    else goto('/');
  }

  $: ogTitle = species?.common_name
    ? `${species.common_name} · Forager`
    : 'Forager';
  $: ogDescription = species
    ? `${species.common_name} (${species.scientific_name}) — edible parts, preparation methods, harvest tips, and safety notes for foragers.`
    : 'A foragable species on Forager.';

  /** Pretty-print a snake_case forage_part or preparation_method. */
  function pretty(s: string): string {
    return s.replace(/_/g, ' ');
  }

  /** Parse an attribution string into rendered segments. The
   *  Wikidata pull script writes 'Wikidata: Qxxx · Wikipedia: <url>',
   *  but the field is also free-form for hand-curated values, so
   *  fall through unchanged when no recognized prefix is present. */
  type AttribPart =
    | { kind: 'text'; value: string }
    | { kind: 'link'; label: string; href: string };
  function parseAttribution(s: string): AttribPart[] {
    const parts: AttribPart[] = [];
    for (const seg of s.split('·').map((x) => x.trim()).filter(Boolean)) {
      const wd = seg.match(/^Wikidata:\s*(Q\d+)$/i);
      const wp = seg.match(/^Wikipedia:\s*(https?:\/\/\S+)$/i);
      if (wd) {
        parts.push({
          kind: 'link',
          label: `Wikidata ${wd[1]}`,
          href: `https://www.wikidata.org/wiki/${wd[1]}`
        });
      } else if (wp) {
        parts.push({ kind: 'link', label: 'Wikipedia', href: wp[1] });
      } else {
        parts.push({ kind: 'text', value: seg });
      }
    }
    return parts;
  }
  $: attribParts = species?.attribution ? parseAttribution(species.attribution) : [];
</script>

<svelte:head>
  <title>{ogTitle}</title>
  <meta name="description" content={ogDescription} />
  <meta property="og:title" content={ogTitle} />
  <meta property="og:description" content={ogDescription} />
  <meta property="og:type" content="article" />
  <meta name="twitter:card" content="summary" />
</svelte:head>

<header>
  <button class="back" on:click={back} aria-label="Back">← Back</button>
  <h1>{species?.common_name ?? 'Species'}</h1>
</header>

<main>
  {#if loading}
    <p class="hint">Loading…</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else if species}
    <p class="sci">{species.scientific_name}</p>
    {#if species.aliases?.length}
      <p class="aliases">Also known as: {species.aliases.join(', ')}</p>
    {/if}

    {#if $session}
      <button
        class="watch"
        class:active={!!watching}
        on:click={toggleWatch}
        disabled={watchBusy}
      >
        {watching ? '★ Watching — tap to stop' : '☆ Watch · notify when ripe'}
      </button>
    {/if}

    {#if species.forage_parts?.length}
      <section>
        <h2>Edible parts</h2>
        <div class="chips">
          {#each species.forage_parts as part}
            <span class="chip">{pretty(part)}</span>
          {/each}
        </div>
      </section>
    {/if}

    {#if species.preparation_methods?.length}
      <section>
        <h2>Preparation</h2>
        <div class="chips">
          {#each species.preparation_methods as method}
            <span class="chip method">{pretty(method)}</span>
          {/each}
        </div>
      </section>
    {/if}

    {#if species.usage_notes}
      <section>
        <h2>Uses</h2>
        <p class="prose">{species.usage_notes}</p>
      </section>
    {/if}

    {#if species.harvest_tips}
      <section>
        <h2>Harvest tips</h2>
        <p class="prose">{species.harvest_tips}</p>
      </section>
    {/if}

    {#if species.toxicity_notes}
      <section class="warn">
        <h2>Toxicity</h2>
        <p class="prose">{species.toxicity_notes}</p>
      </section>
    {/if}

    {#if species.safety_notes}
      <section class="warn">
        <h2>Safety</h2>
        <p class="prose">{species.safety_notes}</p>
      </section>
    {/if}

    <section class="disclaimer">
      <p>
        Misidentification can be dangerous. Always confirm identity from
        multiple sources before harvesting. When in doubt, don't eat it.
      </p>
    </section>

    {#if attribParts.length}
      <p class="attrib">
        Source:
        {#each attribParts as p, i}
          {#if i > 0}<span class="sep"> · </span>{/if}
          {#if p.kind === 'link'}
            <a href={p.href} target="_blank" rel="noopener noreferrer">{p.label}</a>
          {:else}
            <span>{p.value}</span>
          {/if}
        {/each}
      </p>
    {/if}

    <p class="see-also">
      <a href={base + '/?species=' + species.id}>Show pins of this species on the map →</a>
    </p>
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
  .back { background: transparent; border: 0; color: #3a5a3a; font-size: 0.9rem; cursor: pointer; }
  main { padding: 1.25rem 1rem 3rem; max-width: 38rem; margin: 0 auto; line-height: 1.55; color: #1f2a1f; }
  .hint { color: #6b7a6b; }
  .error { color: #b03030; }
  .sci { font-style: italic; color: #4a554a; margin: 0.1rem 0 0.4rem; }
  .aliases { color: #6b7a6b; font-size: 0.9rem; margin-top: 0; }
  section { margin-top: 1.25rem; }
  h2 { color: #3a5a3a; font-size: 1rem; margin: 0 0 0.45rem; }
  .prose { margin: 0; }
  .chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .chip {
    background: #eef3ed;
    color: #1f2a1f;
    padding: 0.2rem 0.55rem;
    border-radius: 0.6rem;
    font-size: 0.85rem;
    border: 1px solid #d4ddd2;
  }
  .chip.method { background: #fff4e3; border-color: #e8d3a6; }
  .warn h2 { color: #b03030; }
  .disclaimer {
    margin-top: 1.5rem;
    padding: 0.75rem 0.85rem;
    border-left: 3px solid #6b7a6b;
    background: #f7faf6;
    font-size: 0.9rem;
    color: #2a322a;
  }
  .disclaimer p { margin: 0; }
  .attrib { color: #6b7a6b; font-size: 0.8rem; margin-top: 1.25rem; }
  .see-also { margin-top: 1.5rem; }
  .see-also a { color: #3a5a3a; }
  .watch {
    display: inline-block;
    margin-top: 0.75rem;
    padding: 0.4rem 0.85rem;
    border: 1px solid #c7d0c7;
    background: white;
    color: #3a5a3a;
    border-radius: 0.35rem;
    cursor: pointer;
    font-size: 0.9rem;
  }
  .watch:hover { background: #f0f5ef; }
  .watch.active {
    background: #fff4e3;
    border-color: #e8d3a6;
    color: #7a4a10;
  }
</style>
