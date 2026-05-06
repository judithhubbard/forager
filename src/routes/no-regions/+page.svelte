<script lang="ts">
  import { signOut } from '$lib/services/authService';
  import { goto } from '$lib/utils/nav';

  async function handleSignOut() {
    await signOut();
    goto('/login', { replaceState: true });
  }
</script>

<main>
  <h1>You have no regions yet.</h1>
  <p>
    Forager is invitation-only. You are signed in, but you do not yet belong to any foraging
    region. Ask the person who invited you to send a fresh invite, or to add you back to their
    region.
  </p>
  <button on:click={handleSignOut}>Sign out</button>
</main>

<style>
  main {
    max-width: 32rem;
    margin: 4rem auto;
    padding: 0 1.5rem;
    color: #1f2a1f;
  }
  h1 {
    color: #3a5a3a;
  }
  button {
    margin-top: 1.5rem;
    padding: 0.6rem 1rem;
    background: transparent;
    color: #3a5a3a;
    border: 1px solid #3a5a3a;
    border-radius: 0.4rem;
    cursor: pointer;
  }
</style>
