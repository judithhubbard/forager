<script lang="ts">
  import { goto } from '$lib/utils/nav';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { signOut } from '$lib/services/authService';
  import { session } from '$lib/stores/auth';
  import {
    activeRegion,
    activeRegionId,
    myRegions,
    setActiveRegionId
  } from '$lib/stores/activeRegion';

  let open = false;
  let helpOpen = false;
  $: isAdmin = $activeRegion?.role === 'admin';
  $: hasMultipleRegions = $myRegions.length > 1;
  // Strip the configured base path so the comparison works whether
  // the app runs at / or /forager/.
  $: localPath = (() => {
    const p = $page.url.pathname;
    if (base && p.startsWith(base)) {
      const rest = p.slice(base.length);
      return rest.startsWith('/') ? rest : '/' + rest;
    }
    return p;
  })();
  $: isOnMap = localPath === '/' || localPath === '';

  async function handleSignOut() {
    open = false;
    await signOut();
    goto('/login', { replaceState: true });
  }

  function handleClickOutside(e: MouseEvent) {
    if (!open) return;
    const target = e.target as HTMLElement;
    if (!target.closest('.tools-wrap')) {
      open = false;
      helpOpen = false;
    }
  }

  function closeMenu() {
    open = false;
    helpOpen = false;
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

      <!-- Core navigation. The Map link is hidden when the user is
           already on the map page since it would be a no-op. The
           personal-data pages (Activity, Watchlist, My tracks etc.)
           are authed-only because they read user-scoped data and
           would just show 'sign in to use this' for anon. -->
      {#if !isOnMap}
        <a href={base + '/'} on:click={closeMenu}>Map</a>
      {/if}
      {#if $session}
        <a href={base + '/activity'} on:click={closeMenu}>Activity</a>
        <a href={base + '/watchlist'} on:click={closeMenu}>Watchlist</a>
        <a href={base + '/timeline'} on:click={closeMenu}>Year history</a>
        <a href={base + '/tracks'} on:click={closeMenu}>My tracks</a>
        <a href={base + '/windows'} on:click={closeMenu}>Harvest windows</a>
        <a href={base + '/interests'} on:click={closeMenu}>My interests</a>
      {/if}

      <!-- Help submenu — How to use is the parent doc, About + Data
           sources are linked from inside it (and reachable here too
           for direct access). -->
      <button class="submenu-toggle" on:click={() => (helpOpen = !helpOpen)}>
        Help <span class="chev">{helpOpen ? '▾' : '▸'}</span>
      </button>
      {#if helpOpen}
        <div class="submenu">
          <a href={base + '/feedback'} on:click={closeMenu}>Send feedback</a>
          <a href={base + '/how-to-use'} on:click={closeMenu}>How to use</a>
          <a href={base + '/about'} on:click={closeMenu}>About</a>
          <a href={base + '/sources'} on:click={closeMenu}>Data sources</a>
        </div>
      {/if}

      {#if isAdmin}
        <hr />
        <a href={base + '/admin'} on:click={closeMenu}>Admin</a>
      {/if}
      <hr />
      {#if $session}
        <button on:click={handleSignOut}>Sign out</button>
      {:else}
        <a href={base + '/login'} on:click={closeMenu}>Sign in</a>
        <a href={base + '/register'} on:click={closeMenu}>Sign up free</a>
      {/if}
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
    min-width: 12rem;
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
  .submenu-toggle {
    display: flex !important;
    justify-content: space-between;
    align-items: center;
    color: #3a5a3a !important;
    font-weight: 600 !important;
  }
  .chev {
    color: #6b7a6b;
    font-size: 0.78rem;
    margin-left: 0.5rem;
  }
  .submenu {
    background: #fbfdfa;
    border: 1px solid #ebefeb;
    border-radius: 0.3rem;
    margin: 0.15rem 0.15rem 0.25rem;
    padding: 0.2rem;
    display: flex;
    flex-direction: column;
  }
  .settings-block {
    padding: 0.35rem 0.55rem;
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
