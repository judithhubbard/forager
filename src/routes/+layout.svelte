<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { session, authLoading } from '$lib/stores/auth';

  const PUBLIC_ROUTES = ['/login', '/register'];

  $: routeIsPublic = PUBLIC_ROUTES.some((r) => $page.url.pathname.startsWith(r));

  // Redirect on auth state — but only after the initial session fetch completes.
  $: if (!$authLoading) {
    if (!$session && !routeIsPublic) {
      goto('/login', { replaceState: true });
    } else if ($session && routeIsPublic) {
      goto('/', { replaceState: true });
    }
  }

  onMount(() => {
    // No-op; presence of mount hook keeps types/lifecycle clean.
  });
</script>

{#if $authLoading}
  <main class="loading">
    <p>Loading…</p>
  </main>
{:else}
  <slot />
{/if}

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    font-family: system-ui, -apple-system, Segoe UI, sans-serif;
    color: #1f2a1f;
    background: #fafaf6;
  }

  main.loading {
    padding: 2rem;
    color: #6b7a6b;
  }
</style>
