<script lang="ts">
  import { goto } from '$app/navigation';
  import { activeRegion, regionsLoading, myRegions } from '$lib/stores/activeRegion';
  import { signOut } from '$lib/services/authService';
  import { session } from '$lib/stores/auth';
  import { listByRegion, type PinEffective } from '$lib/services/pinService';
  import Map from '$lib/components/Map.svelte';
  import DropPinModal from '$lib/components/DropPinModal.svelte';

  let pins: PinEffective[] = [];
  let pinsLoading = false;
  let showDropPin = false;

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

  function handlePinSaved(e: CustomEvent<{ id: string }>) {
    showDropPin = false;
    if ($activeRegion) loadPins($activeRegion.id);
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
  <button class="fab" on:click={() => (showDropPin = true)} aria-label="Drop a pin">+</button>
{:else if $regionsLoading}
  <main class="loading"><p>Loading…</p></main>
{/if}

{#if showDropPin && $activeRegion}
  <DropPinModal
    regionId={$activeRegion.id}
    on:close={() => (showDropPin = false)}
    on:saved={handlePinSaved}
  />
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
  .fab {
    position: fixed;
    bottom: 1.25rem;
    right: 1.25rem;
    width: 3.5rem;
    height: 3.5rem;
    border-radius: 50%;
    border: 0;
    background: #3a5a3a;
    color: white;
    font-size: 2rem;
    line-height: 1;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    cursor: pointer;
    z-index: 600;
  }
  .fab:active {
    background: #2a4a2a;
  }
</style>
