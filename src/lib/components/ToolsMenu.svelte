<script lang="ts">
  import { goto } from '$lib/utils/nav';
  import { base } from '$app/paths';
  import { signOut } from '$lib/services/authService';
  import { activeRegion } from '$lib/stores/activeRegion';
  import { settings, setBasemap, type Basemap } from '$lib/stores/settings';

  let open = false;
  $: isAdmin = $activeRegion?.role === 'admin';

  const BASEMAP_OPTIONS: { value: Basemap; label: string }[] = [
    { value: 'osm', label: 'Standard (OpenStreetMap)' },
    { value: 'osm-hot', label: 'Humanitarian OSM' },
    { value: 'topo', label: 'Topographic' },
    { value: 'satellite', label: 'Satellite' }
  ];

  async function handleSignOut() {
    open = false;
    await signOut();
    goto('/login', { replaceState: true });
  }

  function handleClickOutside(e: MouseEvent) {
    if (!open) return;
    const target = e.target as HTMLElement;
    if (!target.closest('.tools-wrap')) open = false;
  }

  function onBasemapChange(e: Event) {
    setBasemap((e.currentTarget as HTMLSelectElement).value as Basemap);
  }
</script>

<svelte:window on:click={handleClickOutside} />

<div class="tools-wrap">
  <button class="tools-button" on:click={() => (open = !open)} aria-label="Tools menu">≡</button>
  {#if open}
    <div class="tools-menu" role="menu">
      <a href={base + '/'} on:click={() => (open = false)}>Map</a>
      <a href={base + '/activity'} on:click={() => (open = false)}>Activity</a>
      <a href={base + '/windows'} on:click={() => (open = false)}>Harvest windows</a>
      <a href={base + '/how-to-use'} on:click={() => (open = false)}>How to use</a>
      <a href={base + '/about'} on:click={() => (open = false)}>About</a>
      {#if isAdmin}
        <hr />
        <a href={base + '/admin'} on:click={() => (open = false)}>Admin</a>
      {/if}
      <hr />
      <div class="settings-block">
        <label>
          Basemap
          <select value={$settings.basemap} on:change={onBasemapChange}>
            {#each BASEMAP_OPTIONS as o}
              <option value={o.value}>{o.label}</option>
            {/each}
          </select>
        </label>
      </div>
      <hr />
      <button on:click={handleSignOut}>Sign out</button>
    </div>
  {/if}
</div>

<style>
  .tools-wrap {
    position: relative;
  }
  .tools-button {
    background: transparent;
    border: 1px solid #c7d0c7;
    color: #3a5a3a;
    border-radius: 0.3rem;
    width: 2rem;
    height: 1.85rem;
    font-size: 1.1rem;
    line-height: 1;
    cursor: pointer;
  }
  .tools-menu {
    position: absolute;
    top: calc(100% + 0.3rem);
    right: 0;
    min-width: 11rem;
    background: white;
    border: 1px solid #d0d8d0;
    border-radius: 0.4rem;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15);
    z-index: 1200;
    padding: 0.25rem;
    display: flex;
    flex-direction: column;
  }
  .tools-menu a, .tools-menu button {
    display: block;
    padding: 0.45rem 0.7rem;
    text-decoration: none;
    color: #1f2a1f;
    font-size: 0.88rem;
    border-radius: 0.3rem;
    background: transparent;
    border: 0;
    cursor: pointer;
    text-align: left;
  }
  .tools-menu a:hover, .tools-menu button:hover {
    background: #f0f5ef;
  }
  .tools-menu hr {
    margin: 0.25rem 0;
    border: 0;
    border-top: 1px solid #ebefeb;
  }
  .settings-block {
    padding: 0.35rem 0.7rem;
    font-size: 0.78rem;
    color: #4a554a;
  }
  .settings-block label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .settings-block select {
    padding: 0.25rem 0.4rem;
    border: 1px solid #c7d0c7;
    border-radius: 0.25rem;
    background: white;
    font-size: 0.85rem;
  }
</style>
