<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$lib/utils/nav';
  import PinDetailContent from '$lib/components/PinDetailContent.svelte';
  import { getEffective, type PinEffective } from '$lib/services/pinService';
  import { listAll as listSpecies, type Species } from '$lib/services/speciesService';

  $: pinId = $page.params.id as string;

  // Per-pin OG card data. SvelteKit's adapter-static can't render
  // these per-route at build time (the pin id is dynamic), so social
  // crawlers that don't run JS will only see the default card. Until
  // we add a tiny prerender step or a Cloudflare worker that injects
  // OG tags at the edge, this <svelte:head> at least gives shares
  // from inside the app a useful preview.
  let pin: PinEffective | null = null;
  let species: Species | null = null;
  $: ogTitle = species?.common_name
    ? `${species.common_name} on Forager`
    : 'Forager';
  $: ogDescription = species?.scientific_name
    ? `A ${species.common_name} (${species.scientific_name}) pinned on the Forager community foraging map.`
    : 'A pinned spot on the Forager community foraging map.';

  onMount(async () => {
    try {
      pin = await getEffective(pinId);
      if (pin?.species_id) {
        const all = await listSpecies();
        species = all.find((s) => s.id === pin?.species_id) ?? null;
      }
    } catch {
      pin = null;
    }
  });

  function copyLink() {
    const url = window.location.href;
    if (navigator.clipboard) navigator.clipboard.writeText(url);
  }
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
  <button class="back" on:click={() => goto('/')}>← Back to map</button>
  <h1>Pin detail</h1>
  <button class="share" on:click={copyLink} title="Copy link to this pin">Share</button>
</header>

<main>
  <PinDetailContent {pinId} />
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
  header h1 {
    margin: 0;
    font-size: 1.05rem;
    color: #3a5a3a;
  }
  .back {
    background: transparent;
    border: 0;
    color: #3a5a3a;
    font-size: 0.9rem;
    cursor: pointer;
  }
  .share {
    margin-left: auto;
    background: white;
    border: 1px solid #c7d0c7;
    color: #3a5a3a;
    padding: 0.3rem 0.7rem;
    border-radius: 0.3rem;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .share:hover { background: #f0f5ef; }
  main {
    max-width: 36rem;
    margin: 0 auto;
  }
</style>
