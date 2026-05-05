<script lang="ts">
  import { signInWithPassword } from '$lib/services/authService';

  let email = '';
  let password = '';
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
      <input
        type="password"
        autocomplete="current-password"
        bind:value={password}
        required
        disabled={submitting}
      />
    </label>

    {#if errorMessage}
      <p class="error">{errorMessage}</p>
    {/if}

    <button type="submit" disabled={submitting}>
      {submitting ? 'Signing in…' : 'Sign in'}
    </button>
  </form>

  <p class="footnote">
    Accounts are invitation-only. If you do not have one, ask the person who invited you.
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
