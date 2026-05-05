<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { activeRegion, regionsLoading, myRegions } from '$lib/stores/activeRegion';
  import { signOut } from '$lib/services/authService';
  import { session } from '$lib/stores/auth';
  import { listByRegion, type PinEffective } from '$lib/services/pinService';
  import Map from '$lib/components/Map.svelte';

  let pins: PinEffective[] = [];
  let pinsLoading = false;

  $: if (!$regionsLoading && $session && $myRegions.length === 0) {
    goto('/no-regions', { replaceState: true });
  }

  // Reload pins when active region changes.
  $: if ($activeRegion) loadPins($activeRegion.id);

  async function loadPins(regionId: string) {
    pinsLoading = true;
    try {
      pins = await listByRegion(regionId);
    } catch (err) {
      console.error('[+page] loadPins error', err);
      pins = [];
    } finally {
      pinsLoading = false;
    }
  }

  async function handleSignOut() {
    await signOut();
    goto('/login', { replaceState: true });
  }

  function handlePinClick(e: CustomEvent<{ pinId: string }>) {
    // Phase 1.6 will route to /pins/[id]; for now, just log.
    console.log('Pin clicked:', e.detail.pinId);
  }
</script>

<header>
  <h1>Forager</h1>
  <div class="meta">
    {#if $activeRegion}
      <span class="region">{$activeRegion.name}</span>
    {/if}
    {#if pinsLoading}
      <span class="hint">Loading pins…</span>
    {:else if $activeRegion}
      <span class="hint">{pins.length} pins</span>
    {/if}
    <button class="signout" on:click={handleSignOut}>Sign out</button>
  </div>
</header>

{#if $activeRegion}
  <Map {pins} on:pinClick={handlePinClick} />
{:else if $regionsLoading}
  <main class="loading"><p>Loading…</p></main>
{/if}

<style>
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
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
  .meta {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.85rem;
  }
  .region {
    color: #4a554a;
    padding: 0.2rem 0.6rem;
    background: #eaf2ea;
    border-radius: 1rem;
  }
  .hint {
    color: #6b7a6b;
  }
  .signout {
    background: transparent;
    color: #6b7a6b;
    border: 0;
    cursor: pointer;
    text-decoration: underline;
    font-size: 0.85rem;
  }
  main.loading {
    padding: 2rem;
    color: #6b7a6b;
  }
</style>
