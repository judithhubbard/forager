<script lang="ts">
  import { goto } from '$lib/utils/nav';
  import { profile } from '$lib/stores/profile';
  import { createRegion } from '$lib/services/regionService';
  import { reloadRegions } from '$lib/stores/activeRegion';
  import { supabase } from '$lib/supabase';
  import InterestPicker from '$lib/components/InterestPicker.svelte';
  import {
    DEFAULT_INTERESTS,
    type InterestGroup
  } from '$lib/utils/interestGroups';
  import { applyInterestGroups, removeAllMine } from '$lib/services/userPreferencesService';
  import { loadFromServer as reloadUserPrefs } from '$lib/stores/userPreferences';
  import { settings, setShowInvasives } from '$lib/stores/settings';
  import { onMount } from 'svelte';
  import { getGlobalStats, formatPinCount, type GlobalStats } from '$lib/services/statsService';

  let stats: GlobalStats | null = null;
  onMount(async () => { stats = await getGlobalStats(); });

  function onInvasiveOptin(e: Event) {
    setShowInvasives((e.currentTarget as HTMLInputElement).checked);
  }

  type Mode = 'choose' | 'join' | 'group' | 'personal' | 'interests';

  let mode: Mode = 'choose';
  let busy = false;
  let errorMsg = '';

  // Join mode
  let inviteToken = '';
  // Group mode
  let groupName = '';

  async function startGroup() {
    if (busy) return;
    busy = true;
    errorMsg = '';
    try {
      const id = await createRegion({
        name: groupName.trim(),
        defaultPinVisibility: 'shared'
      });
      await reloadRegions(id);
      mode = 'interests';
    } catch (err) {
      errorMsg = friendly(err);
    } finally {
      busy = false;
    }
  }

  async function startPersonal() {
    if (busy) return;
    busy = true;
    errorMsg = '';
    try {
      const username = $profile?.display_name || $profile?.username || 'My';
      const id = await createRegion({
        name: `${username}'s map`,
        defaultPinVisibility: 'private'
      });
      await reloadRegions(id);
      mode = 'interests';
    } catch (err) {
      errorMsg = friendly(err);
    } finally {
      busy = false;
    }
  }

  async function joinGroup() {
    if (busy) return;
    const token = inviteToken.trim();
    if (!token) {
      errorMsg = 'Paste your invitation token first.';
      return;
    }
    busy = true;
    errorMsg = '';
    try {
      const { data, error } = await supabase.rpc('accept_invitation', {
        invite_token: token
      });
      if (error) throw error;
      const id = data as string;
      await reloadRegions(id);
      mode = 'interests';
    } catch (err) {
      errorMsg = friendly(err);
    } finally {
      busy = false;
    }
  }

  /** After region creation, the user picks interest groups; this turns
   *  group ids into per-species enabled/disabled rows on
   *  user_species_preferences. */
  async function onInterestsSubmit(e: CustomEvent<{ selected: InterestGroup[] }>) {
    if (busy) return;
    busy = true;
    errorMsg = '';
    try {
      await applyInterestGroups(e.detail.selected);
      await reloadUserPrefs();
      goto('/', { replaceState: true });
    } catch (err) {
      errorMsg = friendly(err);
    } finally {
      busy = false;
    }
  }

  /** "Skip — show me everything" — wipe any existing prefs so the
   *  default all-enabled state takes effect. */
  async function onSkipInterests() {
    if (busy) return;
    busy = true;
    errorMsg = '';
    try {
      await removeAllMine();
      await reloadUserPrefs();
      goto('/', { replaceState: true });
    } catch (err) {
      errorMsg = friendly(err);
    } finally {
      busy = false;
    }
  }

  function friendly(err: unknown): string {
    const msg = err instanceof Error ? err.message : 'Something went wrong.';
    if (msg.includes('Invitation not found')) return 'That invitation token is not valid.';
    if (msg.includes('expired')) return 'That invitation has expired — ask the sender for a new one.';
    if (msg.includes('different email')) return 'This invitation was sent to a different email address.';
    return msg;
  }
</script>

<main>
  <h1>Welcome to Forager</h1>
  {#if stats && stats.total_pins > 0}
    <p class="stats-line">
      Tracking <strong>{formatPinCount(stats.total_pins)}</strong> trees and plants
      across <strong>{stats.total_species}</strong> foragable species.
    </p>
  {/if}
  <p class="lead">How would you like to get started?</p>

  {#if mode === 'choose'}
    <div class="cards">
      <button class="card" on:click={() => (mode = 'join')}>
        <h2>Join a regional group</h2>
        <p>You have an invitation link or token from someone in an existing group.</p>
      </button>
      <button class="card" on:click={() => (mode = 'group')}>
        <h2>Start a regional group</h2>
        <p>Create a new shared map for your community. You become its admin.</p>
      </button>
      <button class="card" on:click={() => (mode = 'personal')}>
        <h2>Use it just for me</h2>
        <p>A private map for your own foraging notes. Nothing is shared by default. You can invite others later.</p>
      </button>
    </div>
  {:else if mode === 'join'}
    <h2>Join a regional group</h2>
    <p>Paste your invitation token (the long string at the end of the link the admin sent you).</p>
    <label>
      Invitation token
      <input
        type="text"
        bind:value={inviteToken}
        placeholder="e.g. v8KLm6r2Z9ej…"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        disabled={busy}
      />
    </label>
    {#if errorMsg}<p class="error">{errorMsg}</p>{/if}
    <div class="actions">
      <button class="back" on:click={() => (mode = 'choose')} disabled={busy}>Back</button>
      <button class="primary" on:click={joinGroup} disabled={busy || !inviteToken.trim()}>
        {busy ? 'Joining…' : 'Join group'}
      </button>
    </div>
  {:else if mode === 'group'}
    <h2>Start a regional group</h2>
    <p>You'll be the admin and can invite others. New pins default to <strong>shared</strong> — visible to every member of the group. Members can mark individual pins private if they want.</p>
    <label>
      Group name
      <input
        type="text"
        bind:value={groupName}
        placeholder="e.g. Ithaca foragers"
        maxlength="80"
        disabled={busy}
      />
    </label>
    {#if errorMsg}<p class="error">{errorMsg}</p>{/if}
    <div class="actions">
      <button class="back" on:click={() => (mode = 'choose')} disabled={busy}>Back</button>
      <button class="primary" on:click={startGroup} disabled={busy || !groupName.trim()}>
        {busy ? 'Creating…' : 'Create group'}
      </button>
    </div>
  {:else if mode === 'personal'}
    <h2>Use it just for me</h2>
    <p>A private map will be created for you. New pins default to <strong>private</strong> — only you'll see them. You can change individual pins to shared later, or invite others to your map.</p>
    {#if errorMsg}<p class="error">{errorMsg}</p>{/if}
    <div class="actions">
      <button class="back" on:click={() => (mode = 'choose')} disabled={busy}>Back</button>
      <button class="primary" on:click={startPersonal} disabled={busy}>
        {busy ? 'Setting up…' : 'Create my map'}
      </button>
    </div>
  {:else}
    <h2>What kind of foraging interests you?</h2>
    <p>
      Pick the categories you'd like the app to track. Defaults below match
      what most casual foragers actually do — fruit trees and berries you
      find on a walk. You can change this any time from settings.
    </p>
    {#if errorMsg}<p class="error">{errorMsg}</p>{/if}
    <InterestPicker
      selected={DEFAULT_INTERESTS}
      submitLabel={busy ? 'Saving…' : 'Done'}
      on:submit={onInterestsSubmit}
      on:skipAll={onSkipInterests}
    />
    <!-- Invasive opt-in: parallel question to interests, but a different
         axis (management vs foraging). Default off — most users come for
         food, not removal. Anyone can toggle later in Layers or here. -->
    <label class="invasive-optin">
      <input
        type="checkbox"
        checked={$settings.showInvasives}
        on:change={onInvasiveOptin}
      />
      <div class="invasive-text">
        <strong>Also show invasive species (management mode)</strong>
        <span class="invasive-hint">
          Optional. Adds inedible invasives like tree of heaven, knotweed, and
          callery pear to the map so you can flag and help remove them. They
          render with a red ✗ so you don't mistake them for foragables.
        </span>
      </div>
    </label>
  {/if}
</main>

<style>
  main {
    max-width: 36rem;
    margin: 3rem auto 4rem;
    padding: 0 1.5rem;
    color: #1f2a1f;
  }
  h1 { color: #3a5a3a; margin: 0 0 0.4rem; font-size: 1.6rem; }
  h2 { color: #3a5a3a; margin: 1.4rem 0 0.4rem; font-size: 1.1rem; }
  .lead { margin: 0 0 1.5rem; font-size: 1rem; color: #4a554a; }
  .stats-line {
    margin: 0 0 1rem;
    padding: 0.55rem 0.8rem;
    background: #f0f5ef;
    border-left: 3px solid #3a5a3a;
    border-radius: 0.25rem;
    color: #1f2a1f;
    font-size: 0.95rem;
    line-height: 1.4;
  }
  .stats-line strong { color: #3a5a3a; font-weight: 600; }
  p { line-height: 1.5; color: #2a322a; }

  .cards {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .card {
    text-align: left;
    background: white;
    border: 1px solid #c7d0c7;
    border-radius: 0.5rem;
    padding: 1rem 1.1rem;
    cursor: pointer;
    transition: border-color 0.1s;
  }
  .card:hover { border-color: #3a5a3a; }
  .card h2 { margin: 0 0 0.3rem; font-size: 1.05rem; }
  .card p { margin: 0; font-size: 0.9rem; color: #4a554a; }

  label {
    display: block;
    font-size: 0.9rem;
    color: #4a554a;
    margin-top: 1rem;
  }
  input[type='text'] {
    display: block;
    width: 100%;
    box-sizing: border-box;
    margin-top: 0.3rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid #c7d0c7;
    border-radius: 0.35rem;
    font-size: 1rem;
  }
  .error { color: #b03030; font-size: 0.9rem; margin-top: 0.6rem; }
  .invasive-optin {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    margin-top: 1.2rem;
    padding: 0.7rem 0.85rem;
    background: #fbf0e8;
    border: 1px solid #d8a880;
    border-radius: 0.4rem;
    cursor: pointer;
  }
  .invasive-optin input[type='checkbox'] {
    margin-top: 0.2rem;
    width: 1.1rem;
    height: 1.1rem;
    flex-shrink: 0;
  }
  .invasive-text { display: flex; flex-direction: column; gap: 0.15rem; }
  .invasive-text strong { color: #5e3920; font-size: 0.92rem; }
  .invasive-hint { color: #5e3920; font-size: 0.83rem; line-height: 1.4; }
  .actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    margin-top: 1.4rem;
  }
  .actions button {
    padding: 0.55rem 1.1rem;
    border-radius: 0.35rem;
    border: 1px solid #c7d0c7;
    background: white;
    color: #3a5a3a;
    cursor: pointer;
    font-size: 0.95rem;
  }
  .actions .primary {
    background: #3a5a3a;
    color: white;
    border-color: #3a5a3a;
  }
  .actions button:disabled { opacity: 0.6; cursor: default; }
</style>
