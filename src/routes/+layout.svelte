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
  // Side-effect import: registers locales and kicks off init() at module
  // load time so $_('key') is ready before any page mounts.
  import '$lib/i18n';
  import { isLoading as i18nLoading } from 'svelte-i18n';

  // Routes that anonymous (signed-out) viewers can reach. The map (/)
  // and species/pin detail are anon-readable per Phase 2A; the
  // existing /login + /register stay; /about + /how-to-use are
  // marketing-friendly so signed-out browsers can read them too.
  const PUBLIC_ROUTES = [
    '/login',
    '/register',
    '/',
    '/about',
    '/how-to-use',
    '/accept',
    '/species',
    '/pins',
    '/sources'
  ];

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
  /** Auth-exclusive: signed-in users get bounced off these (so an
   *  authed user landing on /login is redirected back to wherever
   *  they came from). The rest of PUBLIC_ROUTES are open to both. */
  const AUTH_EXCLUSIVE_ROUTES = ['/login', '/register'];
  $: routeIsAuthExclusive = AUTH_EXCLUSIVE_ROUTES.some((r) =>
    localPath.startsWith(r)
  );
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
    } else if ($session && routeIsAuthExclusive) {
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

  // One-time foraging-responsibility acknowledgment. Shown to anyone
  // who hasn't accepted yet — including anonymous viewers, since the
  // safety / legal / property disclaimers are critical for ANY user
  // looking at forageable-plant data on a map. For signed-in users
  // we still wait until they've cleared the username + welcome flow
  // so it doesn't pile on top of those modals.
  $: needsDisclaimer =
    !$settings.disclaimerAcceptedAt &&
    !routeIsAuthExclusive &&
    !routeIsWelcome &&
    (
      // Anon viewers: show on any non-auth route as soon as the page
      // loads (i18n + auth have settled).
      !$session
      // Authed: existing gate — username set, at least one region.
      || (
        !!$profile &&
        !isPlaceholderUsername($profile.username) &&
        $myRegions.length > 0
      )
    );
</script>

{#if $authLoading || $i18nLoading}
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
