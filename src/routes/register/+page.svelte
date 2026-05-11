<script lang="ts">
  import { goto } from '$lib/utils/nav';
  import { base } from '$app/paths';
  import { signUpWithPassword } from '$lib/services/authService';

  let email = '';
  let password = '';
  let submitting = false;
  let errorMessage = '';
  let needsConfirmation = false;

  async function handleSubmit() {
    submitting = true;
    errorMessage = '';
    const result = await signUpWithPassword(email, password);
    submitting = false;
    if (!result.ok) {
      errorMessage = result.message;
      return;
    }
    if (result.session) {
      // Email confirmation was disabled at the project level — straight
      // to the app.
      goto('/');
    } else {
      needsConfirmation = true;
    }
  }
</script>

<main>
  <header class="hero">
    <h1>Choose your plan</h1>
  </header>

  {#if needsConfirmation}
    <div class="confirm-card">
      <h2>Check your email</h2>
      <p>
        We sent a confirmation link to <strong>{email}</strong>. Click
        it to finish creating your account, then sign in.
      </p>
      <a class="back-link" href={base + '/login'}>Go to sign in</a>
    </div>
  {:else}
    <div class="tiers">
      <section class="tier">
        <header>
          <h2>Free</h2>
          <p class="price">$0 forever</p>
        </header>
        <ul>
          <li>Browse <strong>millions of forageable trees, plants, and mushrooms</strong> across the US, Canada, and (via iNaturalist) much of the world</li>
          <li>Use GPS to center the map on where you are</li>
          <li>Read full species pages — edible parts, preparation, harvest tips, safety notes</li>
          <li><strong>Watch species</strong> and get a heads-up when they're ripe near you<sup>*</sup></li>
          <li>Track your filter preferences across devices</li>
        </ul>
      </section>

      <section class="tier pro">
        <header>
          <h2>Forager Pro</h2>
          <p class="price">$30 / year</p>
          <span class="badge">Coming soon</span>
        </header>
        <ul>
          <li>Everything in Free</li>
          <li><strong>Drop your own pins</strong> — private, shared with a group, or both</li>
          <li>Log observations + harvest quality ratings</li>
          <li>Attach photos with GPS-tagged proof of where you found it</li>
          <li><strong>Tune harvest windows</strong> for your area based on your own ripeness observations<sup>*</sup></li>
          <li>Year-over-year journal: see when each spot was ripe in 2024 vs 2025 vs 2026</li>
          <li><strong>Map your tracks</strong> from foraging outings (upload GPX or record live) and see a heatmap of where you've been</li>
          <li>Move and edit pins as conditions change</li>
          <li>Export all your data on request</li>
        </ul>
        <p class="not-yet">Sign up free now — upgrade in one click when Pro launches later this year.</p>
      </section>
    </div>

    <!-- Honest scoping: pins are global (we just ingested ~35k from
         iNaturalist worldwide), but the calibrated harvest-window
         model is keyed to USDA + Canadian hardiness zones. Outside
         the US/Canada the per-zone ripeness predictions won't apply.
         Users deserve to know this before signing up for Pro. -->
    <aside class="scope-note">
      <p>
        <strong><sup>*</sup> Coverage note</strong> — Forager maps
        forageable species worldwide via iNaturalist plus municipal
        tree inventories, but the <strong>harvest-window predictions</strong>
        (the "edible now" indicator, watchlist notifications, and the
        Pro-tier window-tuning feature) are calibrated for the
        <strong>United States and Canada</strong> only at launch. Pins
        outside North America are visible on the map but per-zone
        ripeness timing won't apply to them yet.
      </p>
    </aside>

    <form class="signup" on:submit|preventDefault={handleSubmit}>
      <h2>Create your account</h2>
      <label>
        Email
        <input
          type="email"
          autocomplete="email"
          bind:value={email}
          required
          disabled={submitting}
        />
      </label>
      <label>
        Password
        <input
          type="password"
          autocomplete="new-password"
          bind:value={password}
          required
          minlength="8"
          disabled={submitting}
        />
        <span class="pw-hint">8 characters minimum.</span>
      </label>
      {#if errorMessage}<p class="error">{errorMessage}</p>{/if}
      <div class="actions">
        <button type="submit" class="primary" disabled={submitting || !email || !password}>
          {submitting ? 'Creating…' : 'Create my account'}
        </button>
        <a class="back-link" href={base + '/login'}>Already have one? Sign in</a>
      </div>
    </form>
  {/if}
</main>

<style>
  main {
    max-width: 52rem;
    margin: 1.25rem auto 2.5rem;
    padding: 0 1rem;
    color: #1f2a1f;
  }
  .hero h1 {
    color: #3a5a3a;
    margin: 0 0 1rem;
    font-size: 1.3rem;
    text-align: center;
  }

  .tiers {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.85rem;
    margin-bottom: 1.25rem;
  }
  @media (max-width: 720px) {
    .tiers { grid-template-columns: 1fr; }
  }
  .tier {
    background: white;
    border: 1px solid #c7d0c7;
    border-radius: 0.45rem;
    padding: 0.85rem 0.95rem 0.95rem;
    position: relative;
  }
  .tier.pro {
    background: #fbfdfa;
    border-color: #3a5a3a;
    border-width: 2px;
  }
  .tier header { margin-bottom: 0.5rem; }
  .tier h2 { margin: 0; color: #3a5a3a; font-size: 1rem; }
  .tier .price { margin: 0.1rem 0 0; color: #1f2a1f; font-size: 0.9rem; font-weight: 600; }
  .tier .badge {
    position: absolute;
    top: 0.7rem;
    right: 0.7rem;
    background: #fff4e3;
    color: #7a4a10;
    border: 1px solid #e8d3a6;
    padding: 0.1rem 0.45rem;
    border-radius: 0.35rem;
    font-size: 0.7rem;
    font-weight: 600;
  }
  .tier ul {
    list-style: none;
    padding: 0;
    margin: 0 0 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    line-height: 1.35;
    font-size: 0.85rem;
  }
  .tier li::before {
    content: '✓ ';
    color: #3a5a3a;
    font-weight: 700;
  }
  .not-yet {
    margin: 0;
    font-size: 0.78rem;
    color: #6b7a6b;
    font-style: italic;
  }

  .signup {
    background: white;
    border: 1px solid #c7d0c7;
    border-radius: 0.45rem;
    padding: 0.95rem 1rem 1.05rem;
    max-width: 26rem;
    margin: 0 auto;
  }
  .signup h2 { color: #3a5a3a; margin: 0 0 0.5rem; font-size: 1rem; }
  .signup label {
    display: block;
    font-size: 0.85rem;
    color: #4a554a;
    margin-top: 0.6rem;
  }
  .signup input {
    display: block;
    width: 100%;
    box-sizing: border-box;
    margin-top: 0.25rem;
    padding: 0.45rem 0.6rem;
    border: 1px solid #c7d0c7;
    border-radius: 0.3rem;
    font-size: 0.95rem;
  }
  .pw-hint { display: block; font-size: 0.75rem; color: #6b7a6b; margin-top: 0.2rem; }
  .error { color: #b03030; font-size: 0.85rem; margin-top: 0.5rem; }
  .actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    margin-top: 0.85rem;
    flex-wrap: wrap;
  }
  .actions .primary {
    padding: 0.45rem 1rem;
    border-radius: 0.3rem;
    border: 1px solid #3a5a3a;
    background: #3a5a3a;
    color: white;
    cursor: pointer;
    font-size: 0.9rem;
  }
  .actions .primary:disabled { opacity: 0.6; cursor: default; }
  .back-link {
    color: #3a5a3a;
    font-size: 0.88rem;
    text-decoration: none;
  }
  .back-link:hover { text-decoration: underline; }

  .confirm-card {
    background: white;
    border: 1px solid #c7d0c7;
    border-radius: 0.55rem;
    padding: 1.5rem;
    max-width: 32rem;
    margin: 1.5rem auto;
    text-align: center;
  }
  .confirm-card h2 { color: #3a5a3a; margin: 0 0 0.5rem; }
  .confirm-card p { line-height: 1.5; }
  /* Geographic-scope disclaimer between the tier cards and the
     signup form. Calibrated harvest-window predictions are
     US/Canada-only; pins are global. Users need this upfront. */
  .scope-note {
    margin: 1.25rem auto 0;
    max-width: 38rem;
    padding: 0.8rem 1rem;
    background: #fdf2dc;
    border: 1px solid #e7c074;
    border-radius: 0.45rem;
    color: #5a3e15;
    font-size: 0.88rem;
    line-height: 1.45;
  }
  .scope-note p { margin: 0; }
  .scope-note sup {
    color: #b86b00;
    font-weight: 700;
  }
</style>
