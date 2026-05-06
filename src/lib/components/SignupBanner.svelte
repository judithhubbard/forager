<script lang="ts">
  // Phase 2C: single sticky CTA shown to anonymous viewers in lieu of
  // every individual write affordance. The hide-writes pattern in
  // PinDetailContent and +page.svelte means the user never sees a
  // grayed-out button or a tooltip telling them to log in — just
  // this banner. Watchlist + ripeness notifications are mentioned
  // explicitly because the *signed-in free* tier is the funnel
  // hook, not paid.
  import { goto } from '$lib/utils/nav';
  import { encodeNext } from '$lib/utils/safeNext';
  import { page } from '$app/stores';

  function go(path: '/login' | '/register') {
    const here = $page.url.pathname + $page.url.search;
    goto(`${path}?next=${encodeNext(here)}`);
  }
</script>

<div class="banner" role="region" aria-label="Sign up prompt">
  <p class="msg">
    <strong>Sign up free</strong> to save your finds, get notified when
    berries are ripe, and create private spots.
  </p>
  <div class="actions">
    <button class="primary" on:click={() => go('/register')}>Sign up free</button>
    <button class="ghost" on:click={() => go('/login')}>Sign in</button>
  </div>
</div>

<style>
  .banner {
    background: #3a5a3a;
    color: white;
    padding: 0.55rem 1rem;
    display: flex;
    align-items: center;
    gap: 0.85rem;
    flex-wrap: wrap;
    font-size: 0.88rem;
    border-bottom: 1px solid #2a4a2a;
  }
  .msg { margin: 0; flex: 1 1 18rem; line-height: 1.35; }
  .actions { display: flex; gap: 0.4rem; flex-shrink: 0; }
  button {
    border-radius: 0.3rem;
    border: 1px solid white;
    padding: 0.3rem 0.75rem;
    font-size: 0.85rem;
    cursor: pointer;
    line-height: 1;
  }
  .primary {
    background: white;
    color: #3a5a3a;
    font-weight: 600;
  }
  .primary:hover { background: #eaf2ea; }
  .ghost {
    background: transparent;
    color: white;
  }
  .ghost:hover { background: rgba(255, 255, 255, 0.1); }
  @media (max-width: 640px) {
    .banner { padding: 0.5rem 0.7rem; gap: 0.5rem; font-size: 0.83rem; }
    .msg { flex-basis: 100%; }
  }
</style>
