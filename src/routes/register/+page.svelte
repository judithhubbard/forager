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
    <p class="lead">
      Forager is a private, mobile-friendly map of forageable plants.
      Pick a tier to get started.
    </p>
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
          <li>Browse the public map</li>
          <li>Read full species pages</li>
          <li><strong>Watch species</strong> and get a heads-up when they're ripe near you</li>
          <li>Track your filter preferences across devices</li>
        </ul>
        <p class="not-yet">Pin-dropping, journaling, photos, and group sharing live in Pro.</p>
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
          <li>Year-over-year journal: see when each spot was ripe in 2024 vs 2025 vs 2026</li>
          <li>Move and edit pins as conditions change</li>
          <li>Export all your data on request</li>
        </ul>
        <p class="not-yet">
          Subscriptions launch later this year. Sign up free now;
          upgrading takes one click when Pro opens.
        </p>
      </section>
    </div>

    <form class="signup" on:submit|preventDefault={handleSubmit}>
      <h2>Create your account</h2>
      <p class="hint">
        Free for now. Pro unlocks when subscriptions go live — you keep
        the same account.
      </p>
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
    max-width: 56rem;
    margin: 2.5rem auto 4rem;
    padding: 0 1.5rem;
    color: #1f2a1f;
  }
  .hero h1 { color: #3a5a3a; margin: 0 0 0.4rem; font-size: 1.7rem; }
  .lead { margin: 0 0 2rem; color: #4a554a; line-height: 1.5; }

  .tiers {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    margin-bottom: 2.5rem;
  }
  @media (max-width: 720px) {
    .tiers { grid-template-columns: 1fr; }
  }
  .tier {
    background: white;
    border: 1px solid #c7d0c7;
    border-radius: 0.55rem;
    padding: 1.4rem 1.4rem 1.6rem;
    position: relative;
  }
  .tier.pro {
    background: #fbfdfa;
    border-color: #3a5a3a;
    border-width: 2px;
  }
  .tier header { margin-bottom: 0.85rem; }
  .tier h2 { margin: 0; color: #3a5a3a; font-size: 1.2rem; }
  .tier .price { margin: 0.2rem 0 0; color: #1f2a1f; font-size: 1.05rem; font-weight: 600; }
  .tier .badge {
    position: absolute;
    top: 1rem;
    right: 1rem;
    background: #fff4e3;
    color: #7a4a10;
    border: 1px solid #e8d3a6;
    padding: 0.15rem 0.55rem;
    border-radius: 0.4rem;
    font-size: 0.75rem;
    font-weight: 600;
  }
  .tier ul {
    list-style: none;
    padding: 0;
    margin: 0 0 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    line-height: 1.4;
  }
  .tier li::before {
    content: '✓ ';
    color: #3a5a3a;
    font-weight: 700;
  }
  .not-yet {
    margin: 0;
    font-size: 0.85rem;
    color: #6b7a6b;
    font-style: italic;
  }

  .signup {
    background: white;
    border: 1px solid #c7d0c7;
    border-radius: 0.55rem;
    padding: 1.4rem;
    max-width: 28rem;
    margin: 0 auto;
  }
  .signup h2 { color: #3a5a3a; margin: 0 0 0.4rem; font-size: 1.1rem; }
  .signup .hint { margin: 0 0 1rem; color: #4a554a; font-size: 0.9rem; line-height: 1.4; }
  .signup label {
    display: block;
    font-size: 0.9rem;
    color: #4a554a;
    margin-top: 0.85rem;
  }
  .signup input {
    display: block;
    width: 100%;
    box-sizing: border-box;
    margin-top: 0.3rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid #c7d0c7;
    border-radius: 0.35rem;
    font-size: 1rem;
  }
  .pw-hint { display: block; font-size: 0.78rem; color: #6b7a6b; margin-top: 0.25rem; }
  .error { color: #b03030; font-size: 0.9rem; margin-top: 0.6rem; }
  .actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-top: 1.25rem;
    flex-wrap: wrap;
  }
  .actions .primary {
    padding: 0.55rem 1.1rem;
    border-radius: 0.35rem;
    border: 1px solid #3a5a3a;
    background: #3a5a3a;
    color: white;
    cursor: pointer;
    font-size: 0.95rem;
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
</style>
