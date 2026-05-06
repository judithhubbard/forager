<script lang="ts">
  import { goto } from '$lib/utils/nav';
  import { base } from '$app/paths';
  import { signOut } from '$lib/services/authService';
  import {
    activeRegion,
    activeRegionId,
    myRegions,
    setActiveRegionId
  } from '$lib/stores/activeRegion';
  import {
    settings,
    setBasemap,
    setColorBy,
    setDefaultPhotoLicense,
    type Basemap,
    type ColorBy,
    type PhotoLicense
  } from '$lib/stores/settings';

  let open = false;
  $: isAdmin = $activeRegion?.role === 'admin';
  $: hasMultipleRegions = $myRegions.length > 1;

  const BASEMAP_OPTIONS: { value: Basemap; label: string }[] = [
    { value: 'osm-hot',   label: 'Humanitarian OSM' },
    { value: 'satellite', label: 'Satellite' }
  ];

  const COLOR_BY_OPTIONS: { value: ColorBy; label: string }[] = [
    { value: 'group',    label: 'Per species group' },
    { value: 'category', label: 'By category only' }
  ];

  const PHOTO_LICENSE_OPTIONS: { value: PhotoLicense; label: string }[] = [
    { value: 'CC-BY-SA-4.0',      label: 'CC BY-SA 4.0 (share-alike, default)' },
    { value: 'CC-BY-4.0',         label: 'CC BY 4.0 (attribution)' },
    { value: 'CC-BY-NC-SA-4.0',   label: 'CC BY-NC-SA 4.0 (non-commercial)' },
    { value: 'CC0',               label: 'CC0 (public domain)' },
    { value: 'all-rights-reserved', label: 'All rights reserved' }
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
  function onColorByChange(e: Event) {
    setColorBy((e.currentTarget as HTMLSelectElement).value as ColorBy);
  }
  function onPhotoLicenseChange(e: Event) {
    setDefaultPhotoLicense((e.currentTarget as HTMLSelectElement).value as PhotoLicense);
  }
  function onRegionChange(e: Event) {
    setActiveRegionId((e.currentTarget as HTMLSelectElement).value);
  }
</script>

<svelte:window on:click={handleClickOutside} />

<div class="tools-wrap">
  <button class="tools-button" on:click={() => (open = !open)} aria-label="Tools menu">≡</button>
  {#if open}
    <div class="tools-menu" role="menu">
      {#if hasMultipleRegions}
        <div class="settings-block">
          <label>
            Region
            <select value={$activeRegionId} on:change={onRegionChange}>
              {#each $myRegions as r}
                <option value={r.id}>{r.name}{r.role === 'admin' ? ' (admin)' : ''}</option>
              {/each}
            </select>
          </label>
        </div>
        <hr />
      {/if}
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
      <div class="settings-block">
        <label>
          Marker color
          <select value={$settings.colorBy} on:change={onColorByChange}>
            {#each COLOR_BY_OPTIONS as o}
              <option value={o.value}>{o.label}</option>
            {/each}
          </select>
        </label>
      </div>
      <div class="settings-block">
        <label>
          Photo license
          <select value={$settings.defaultPhotoLicense} on:change={onPhotoLicenseChange}>
            {#each PHOTO_LICENSE_OPTIONS as o}
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
