<script lang="ts">
  import { goto } from '$lib/utils/nav';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { session, authLoading } from '$lib/stores/auth';
  import { profile } from '$lib/stores/profile';
  import { isPlaceholderUsername } from '$lib/services/profileService';
  import { safeNext, encodeNext } from '$lib/utils/safeNext';
  import { settings } from '$lib/stores/settings';
  import { myRegions, regionsLoading } from '$lib/stores/activeRegion';
  import UsernameSetup from '$lib/components/UsernameSetup.svelte';
  import Disclaimer from '$lib/components/Disclaimer.svelte';

  const PUBLIC_ROUTES = ['/login', '/register'];

  /** Strip the configured base path from `$page.url.pathname` so route
   *  matching doesn't depend on whether the app is hosted at `/` or at
   *  `/forager/`. Without this, on production `pathname` is
   *  `/forager/login` and a startsWith('/login') check returns false —
   *  which used to send signed-out users into an infinite redirect
   *  loop on the login page itself. */
  $: localPath = (() => {
    const p = $page.url.pathname;
    if (base && p.startsWith(base)) {
      const rest = p.slice(base.length);
      return rest.startsWith('/') ? rest : '/' + rest;
    }
    return p;
  })();

  $: routeIsPublic = PUBLIC_ROUTES.some((r) => localPath.startsWith(r));
  /** /welcome is reachable while signed in but has no other prereqs.
   *  Treated like a public route for redirect purposes — visiting it
   *  shouldn't trigger the "no memberships → /welcome" bounce that
   *  applies to other in-app routes. */
  $: routeIsWelcome = localPath.startsWith('/welcome');

  // Redirect on auth state — but only after the initial session fetch
  // completes. Signed-out users on protected routes get bounced to
  // /login with a `?next=` carrying the path they tried to reach;
  // signed-in users on public routes land on whatever `?next=` says
  // (validated to same-origin), defaulting to /.
  $: if (!$authLoading) {
    if (!$session && !routeIsPublic) {
      const here = localPath + $page.url.search;
      goto(`/login?next=${encodeNext(here)}`, { replaceState: true });
    } else if ($session && routeIsPublic) {
      const dest = safeNext($page.url.searchParams.get('next'), '/');
      goto(dest, { replaceState: true });
    }
  }

  // First-run flow: if a signed-in user has no memberships yet, send
  // them to /welcome to pick a mode (join / start group / personal).
  // Wait for both the auth check and the regions fetch to settle to
  // avoid bouncing during initial load.
  $: if (
    !$authLoading &&
    $session &&
    !$regionsLoading &&
    !routeIsPublic &&
    !routeIsWelcome &&
    $myRegions.length === 0
  ) {
    goto('/welcome', { replaceState: true });
  }

  // Soft-block: show the username setup as soon as we have a session AND
  // a loaded profile whose username is still the auto-issued placeholder.
  // App content keeps rendering underneath — the modal sits over it. We
  // don't show on /login or /register (no session yet) or before the
  // profile is loaded (avoids a flash).
  $: needsUsername =
    !!$session &&
    !routeIsPublic &&
    !routeIsWelcome &&
    !!$profile &&
    isPlaceholderUsername($profile.username);

  // One-time foraging-responsibility acknowledgment. Shown only after
  // the user has cleared the username step AND has at least one
  // region, so it doesn't pile up over the welcome flow.
  $: needsDisclaimer =
    !!$session &&
    !routeIsPublic &&
    !routeIsWelcome &&
    !!$profile &&
    !isPlaceholderUsername($profile.username) &&
    $myRegions.length > 0 &&
    !$settings.disclaimerAcceptedAt;
</script>

{#if $authLoading}
  <main class="loading">
    <p>Loading…</p>
  </main>
{:else}
  <slot />
  {#if needsUsername && $profile}
    <UsernameSetup profile={$profile} />
  {:else if needsDisclaimer}
    <Disclaimer />
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
