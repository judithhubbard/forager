<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$lib/utils/nav';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { session, authLoading } from '$lib/stores/auth';
  import { supabase } from '$lib/supabase';

  type Phase = 'checking' | 'accepting' | 'success' | 'error';

  let phase: Phase = 'checking';
  let message = '';

  onMount(() => {
    // The layout takes care of bouncing signed-out users to
    // /login?next=/accept?token=… so by the time we run the RPC
    // we're guaranteed to have a session. Wait for the initial
    // auth check to settle before deciding.
    const unsub = authLoading.subscribe((loading) => {
      if (loading) return;
      unsub();
      const token = $page.url.searchParams.get('token');
      if (!token) {
        phase = 'error';
        message = 'Missing invitation token.';
        return;
      }
      if (!$session) return; // layout will redirect us
      void run(token);
    });
  });

  async function run(token: string) {
    phase = 'accepting';
    const { error } = await supabase.rpc('accept_invitation', {
      invite_token: token
    });
    if (error) {
      phase = 'error';
      message = error.message ?? 'Could not accept invitation.';
      return;
    }
    phase = 'success';
    message = "You've joined the region. Redirecting…";
    setTimeout(() => goto('/', { replaceState: true }), 800);
  }
</script>

<main>
  <h1>Accept invitation</h1>
  {#if phase === 'checking' || phase === 'accepting'}
    <p class="hint">Working…</p>
  {:else if phase === 'success'}
    <p class="ok">{message}</p>
  {:else}
    <p class="error">{message}</p>
    <p><a href={base + '/'}>Back to map</a></p>
  {/if}
</main>

<style>
  main { max-width: 28rem; margin: 5rem auto; padding: 0 1.5rem; }
  h1 { color: #3a5a3a; margin: 0 0 1rem; font-size: 1.4rem; }
  .hint { color: #6b7a6b; }
  .ok { color: #2f7a3e; }
  .error { color: #b03030; }
  a { color: #3a5a3a; }
</style>
