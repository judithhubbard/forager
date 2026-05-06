<script lang="ts">
  import { base } from '$app/paths';
  import { signInWithPassword } from '$lib/services/authService';

  let email = '';
  let password = '';
  let showPassword = false;
  let submitting = false;
  let errorMessage = '';

  async function handleSubmit() {
    submitting = true;
    errorMessage = '';
    const result = await signInWithPassword(email, password);
    submitting = false;
    if (!result.ok) errorMessage = result.message;
    // On success, the +layout effect handles redirect to /.
  }

  function onPwInput(e: Event) {
    password = (e.currentTarget as HTMLInputElement).value;
  }
</script>

<main>
  <h1>Forager</h1>
  <p class="lead">Sign in to your account.</p>

  <form on:submit|preventDefault={handleSubmit}>
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
      <div class="pw-row">
        <!-- Svelte forbids a dynamic `type` with bind:value, so render
             two <input>s and toggle visibility by which gets mounted. -->
        {#if showPassword}
          <input
            type="text"
            autocomplete="current-password"
            value={password}
            on:input={onPwInput}
            required
            disabled={submitting}
          />
        {:else}
          <input
            type="password"
            autocomplete="current-password"
            value={password}
            on:input={onPwInput}
            required
            disabled={submitting}
          />
        {/if}
        <button
          type="button"
          class="pw-toggle"
          on:click={() => (showPassword = !showPassword)}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
        >{showPassword ? '👁' : '🙈'}</button>
      </div>
    </label>

    {#if errorMessage}
      <p class="error">{errorMessage}</p>
    {/if}

    <button type="submit" disabled={submitting}>
      {submitting ? 'Signing in…' : 'Sign in'}
    </button>
  </form>

  <p class="footnote">
    Don't have an account?
    <a href={base + '/register'}>Sign up free</a>.
  </p>
</main>

<style>
  main {
    max-width: 24rem;
    margin: 4rem auto;
    padding: 0 1.5rem;
  }
  h1 {
    color: #3a5a3a;
    margin: 0 0 0.5rem;
  }
  .lead {
    color: #6b7a6b;
    margin: 0 0 2rem;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.9rem;
    color: #4a554a;
  }
  input {
    padding: 0.6rem 0.75rem;
    font-size: 1rem;
    border: 1px solid #c7d0c7;
    border-radius: 0.4rem;
    background: white;
  }
  input:focus {
    outline: 2px solid #3a5a3a;
    outline-offset: -1px;
  }
  .pw-row { position: relative; display: flex; }
  .pw-row input { flex: 1; padding-right: 3rem; }
  .pw-toggle {
    position: absolute;
    right: 0.4rem;
    top: 50%;
    transform: translateY(-50%);
    margin: 0;
    padding: 0.3rem 0.5rem;
    background: transparent;
    border: 0;
    font-size: 1.1rem;
    cursor: pointer;
  }
  button {
    margin-top: 0.5rem;
    padding: 0.7rem 1rem;
    font-size: 1rem;
    background: #3a5a3a;
    color: white;
    border: 0;
    border-radius: 0.4rem;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .error {
    color: #b03030;
    font-size: 0.9rem;
    margin: 0;
  }
  .footnote {
    margin-top: 2rem;
    font-size: 0.85rem;
    color: #8a948a;
  }
</style>
