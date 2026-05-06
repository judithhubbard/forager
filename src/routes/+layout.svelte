<script lang="ts">
  import { goto } from '$lib/utils/nav';
  import { page } from '$app/stores';
  import { session, authLoading } from '$lib/stores/auth';
  import { profile } from '$lib/stores/profile';
  import { isPlaceholderUsername } from '$lib/services/profileService';
  import { safeNext, encodeNext } from '$lib/utils/safeNext';
  import UsernameSetup from '$lib/components/UsernameSetup.svelte';

  const PUBLIC_ROUTES = ['/login', '/register'];

  $: routeIsPublic = PUBLIC_ROUTES.some((r) => $page.url.pathname.startsWith(r));

  // Redirect on auth state — but only after the initial session fetch
  // completes. Signed-out users on protected routes get bounced to
  // /login with a `?next=` carrying the path they tried to reach;
  // signed-in users on public routes land on whatever `?next=` says
  // (validated to same-origin), defaulting to /.
  $: if (!$authLoading) {
    if (!$session && !routeIsPublic) {
      const here = $page.url.pathname + $page.url.search;
      goto(`/login?next=${encodeNext(here)}`, { replaceState: true });
    } else if ($session && routeIsPublic) {
      const dest = safeNext($page.url.searchParams.get('next'), '/');
      goto(dest, { replaceState: true });
    }
  }

  // Soft-block: show the username setup as soon as we have a session AND
  // a loaded profile whose username is still the auto-issued placeholder.
  // App content keeps rendering underneath — the modal sits over it. We
  // don't show on /login or /register (no session yet) or before the
  // profile is loaded (avoids a flash).
  $: needsUsername =
    !!$session &&
    !routeIsPublic &&
    !!$profile &&
    isPlaceholderUsername($profile.username);
</script>

{#if $authLoading}
  <main class="loading">
    <p>Loading…</p>
  </main>
{:else}
  <slot />
  {#if needsUsername && $profile}
    <UsernameSetup profile={$profile} />
  {/if}
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
