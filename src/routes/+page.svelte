<script lang="ts">
  import { goto } from '$app/navigation';
  import { activeRegion, regionsLoading, myRegions } from '$lib/stores/activeRegion';
  import { signOut } from '$lib/services/authService';
  import { session } from '$lib/stores/auth';

  $: if (!$regionsLoading && $session && $myRegions.length === 0) {
    goto('/no-regions', { replaceState: true });
  }

  async function handleSignOut() {
    await signOut();
    goto('/login', { replaceState: true });
  }
</script>

<header>
  <h1>Forager</h1>
  <div class="meta">
    {#if $activeRegion}
      <span class="region">{$activeRegion.name}</span>
    {/if}
    <button class="signout" on:click={handleSignOut}>Sign out</button>
  </div>
</header>

<main>
  {#if $regionsLoading}
    <p class="hint">Loading your regions…</p>
  {:else if $activeRegion}
    <p class="hint">
      Map view coming next. You are signed in to <strong>{$activeRegion.name}</strong>
      (zone {$activeRegion.climate_zone ?? '—'}, role {$activeRegion.role}).
    </p>
  {/if}
</main>

<style>
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1.25rem;
    background: white;
    border-bottom: 1px solid #e1e8e1;
  }
  header h1 {
    margin: 0;
    font-size: 1.1rem;
    color: #3a5a3a;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .region {
    font-size: 0.9rem;
    color: #4a554a;
    padding: 0.2rem 0.6rem;
    background: #eaf2ea;
    border-radius: 1rem;
  }
  .signout {
    background: transparent;
    color: #6b7a6b;
    border: 0;
    cursor: pointer;
    font-size: 0.9rem;
    text-decoration: underline;
  }
  main {
    padding: 2rem 1.5rem;
  }
  .hint {
    color: #6b7a6b;
  }
</style>
