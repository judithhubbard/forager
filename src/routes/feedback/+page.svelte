<script lang="ts">
  // Feedback / report submission page. Single form, single category
  // select, free-text body. Auto-attaches context (URL the user came
  // from) so admin triage can see what they were looking at.
  //
  // Anonymous users can submit too — RLS allows reporter_id=null.
  // Most reports will come from signed-in users since that's where
  // the discovery surfaces are.

  import { onMount } from 'svelte';
  import { goto } from '$lib/utils/nav';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import {
    submit,
    FEEDBACK_CATEGORIES,
    type FeedbackCategory
  } from '$lib/services/feedbackService';
  import { activeRegion } from '$lib/stores/activeRegion';
  import { session } from '$lib/stores/auth';

  let category: FeedbackCategory = 'feature_request';
  let subject = '';
  let body = '';
  let referrer = '';

  let busy = false;
  let success = false;
  let errorMessage = '';

  $: chosenHint = FEEDBACK_CATEGORIES.find((c) => c.value === category)?.hint ?? '';

  onMount(() => {
    // The referrer URL is what the user was looking at before
    // navigating here — useful triage context. Falls back to the
    // page they came from in the SvelteKit routing if browser
    // referrer is empty (e.g., direct nav from menu).
    referrer = (typeof document !== 'undefined' && document.referrer)
      ? document.referrer
      : ($page.url.origin + $page.url.pathname);
  });

  async function handleSubmit() {
    if (busy) return;
    if (!subject.trim()) {
      errorMessage = 'Please add a short subject.';
      return;
    }
    if (!body.trim()) {
      errorMessage = 'Please describe the issue or suggestion.';
      return;
    }
    busy = true;
    errorMessage = '';
    try {
      await submit({
        category,
        subject,
        body,
        contextRegionId: $activeRegion?.id ?? null,
        contextUrl: referrer || undefined
      });
      success = true;
      subject = '';
      body = '';
    } catch (err) {
      const e = err as { message?: unknown; code?: unknown };
      errorMessage =
        (typeof e?.message === 'string' && e.message)
          ? e.message
          : 'Could not send the report. Try again in a moment.';
    } finally {
      busy = false;
    }
  }
</script>

<header>
  <button class="back" on:click={() => goto('/')}>← Back</button>
  <h1>Send feedback</h1>
</header>

<main>
  {#if success}
    <div class="success">
      <strong>Thanks — your report is in.</strong>
      <p>We read every one. Submit another, or head back to the map.</p>
      <div class="actions">
        <button type="button" class="link-btn" on:click={() => { success = false; }}>Send another</button>
        <a class="primary" href={base + '/'}>Back to map</a>
      </div>
    </div>
  {:else}
    <p class="lead">
      Suggestions, error reports, requests for new datasets, community
      misuse — anything you want us to know. Replies aren't guaranteed,
      but every report lands in the admin queue and informs what we ship
      next.
    </p>
    {#if !$session}
      <p class="anon-note muted">
        You're signing in anonymously. If you want a reply, include an email
        address in the body — otherwise we have no way to reach you.
      </p>
    {/if}
    {#if errorMessage}<p class="error">{errorMessage}</p>{/if}
    <form on:submit|preventDefault={handleSubmit}>
      <label class="field">
        Category
        <select bind:value={category} disabled={busy}>
          {#each FEEDBACK_CATEGORIES as c}
            <option value={c.value}>{c.label}</option>
          {/each}
        </select>
        <span class="field-hint">{chosenHint}</span>
      </label>
      <label class="field">
        Subject
        <input
          type="text"
          bind:value={subject}
          maxlength="200"
          placeholder="Short summary"
          disabled={busy}
        />
      </label>
      <label class="field">
        Details
        <textarea
          bind:value={body}
          rows="8"
          maxlength="8000"
          placeholder="What happened, what you'd like to see, where it's broken, etc. The more specific, the better."
          disabled={busy}
        ></textarea>
        <span class="field-hint">{body.length} / 8000</span>
      </label>
      <p class="context-line muted">
        We'll attach: the page you came from{$activeRegion ? `, your active region (${$activeRegion.name})` : ''}{$session ? ', your account' : ' (no account — anonymous report)'}.
      </p>
      <div class="actions">
        <button type="button" class="link-btn" on:click={() => goto('/')} disabled={busy}>Cancel</button>
        <button type="submit" class="primary" disabled={busy}>
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
    </form>
  {/if}
</main>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.5rem 1rem;
    background: white;
    border-bottom: 1px solid #e1e8e1;
    height: 56px;
    box-sizing: border-box;
  }
  header h1 { margin: 0; font-size: 1.05rem; color: #3a5a3a; }
  .back {
    background: transparent;
    border: 0;
    color: #3a5a3a;
    font-size: 0.9rem;
    cursor: pointer;
  }
  main {
    max-width: 36rem;
    margin: 1rem auto 4rem;
    padding: 0 1rem;
    color: #1f2a1f;
  }
  .lead { color: #4a554a; font-size: 0.95rem; line-height: 1.5; margin: 0 0 1rem; }
  .anon-note { font-size: 0.85rem; margin: 0 0 0.75rem; }
  .muted { color: #6b7a6b; }
  .error {
    color: #b03030;
    background: #fff5f5;
    border: 1px solid #d6a3a3;
    padding: 0.5rem 0.7rem;
    border-radius: 0.35rem;
    font-size: 0.88rem;
    margin: 0 0 0.75rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    margin-bottom: 0.85rem;
    font-size: 0.92rem;
    color: #4a554a;
  }
  .field-hint { font-size: 0.78rem; color: #8a948a; }
  input[type='text'], textarea, select {
    padding: 0.5rem 0.65rem;
    border: 1px solid #c7d0c7;
    border-radius: 0.35rem;
    background: white;
    font-size: 0.95rem;
    color: #1f2a1f;
    font-family: inherit;
    box-sizing: border-box;
    width: 100%;
  }
  textarea { resize: vertical; min-height: 8rem; line-height: 1.4; }
  .context-line { font-size: 0.82rem; margin: 0.5rem 0 1rem; }
  .actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 0.5rem;
  }
  .link-btn {
    background: transparent;
    border: 0;
    color: #3a5a3a;
    font-size: 0.9rem;
    cursor: pointer;
    padding: 0.4rem 0;
  }
  .primary {
    padding: 0.55rem 1.2rem;
    border-radius: 0.35rem;
    border: 1px solid #3a5a3a;
    background: #3a5a3a;
    color: white;
    font-size: 0.95rem;
    cursor: pointer;
    text-decoration: none;
    display: inline-block;
  }
  .primary:disabled { opacity: 0.6; cursor: default; }
  .success {
    background: #f0f5ef;
    border: 1px solid #a8c4a8;
    border-radius: 0.4rem;
    padding: 1rem 1.1rem;
    color: #1f2a1f;
  }
  .success strong { font-size: 1rem; color: #3a5a3a; }
  .success p { margin: 0.4rem 0 0.8rem; font-size: 0.92rem; line-height: 1.5; }
</style>
