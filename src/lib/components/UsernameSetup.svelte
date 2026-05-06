<script lang="ts">
  import { onMount } from 'svelte';
  import {
    isAvailable,
    update as updateProfile,
    UsernameTakenError,
    type Profile
  } from '$lib/services/profileService';
  import { reloadProfile } from '$lib/stores/profile';

  export let profile: Profile;

  let username = '';
  let displayName = profile.display_name ?? '';
  let saving = false;
  let errorMsg = '';
  let availability: 'unknown' | 'checking' | 'available' | 'taken' | 'invalid' =
    'unknown';
  let availabilityToken = 0;

  const FORMAT = /^[a-z0-9_-]{3,20}$/;

  $: normalized = username.trim().toLowerCase();
  $: if (normalized === '') {
    availability = 'unknown';
  } else if (!FORMAT.test(normalized)) {
    availability = 'invalid';
  } else {
    void checkAvailability(normalized);
  }

  async function checkAvailability(candidate: string) {
    const token = ++availabilityToken;
    availability = 'checking';
    try {
      const ok = await isAvailable(candidate);
      // A newer keystroke superseded this check — drop the result.
      if (token !== availabilityToken) return;
      availability = ok ? 'available' : 'taken';
    } catch {
      if (token !== availabilityToken) return;
      availability = 'unknown';
    }
  }

  async function save() {
    if (!FORMAT.test(normalized)) return;
    saving = true;
    errorMsg = '';
    try {
      await updateProfile({
        username: normalized,
        display_name: displayName.trim() || null
      });
      await reloadProfile();
    } catch (err) {
      if (err instanceof UsernameTakenError) {
        availability = 'taken';
        errorMsg = `"${err.username}" is already taken.`;
      } else {
        errorMsg = err instanceof Error ? err.message : 'Could not save username.';
      }
    } finally {
      saving = false;
    }
  }

  onMount(() => {
    // Suggest the placeholder stripped of its prefix as a starting
    // point if the user wants something quick — they can clear it.
    const stripped = profile.username?.replace(/^user_/, '') ?? '';
    if (stripped && /^[a-z0-9_-]{3,20}$/.test(stripped)) username = stripped;
  });
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="backdrop">
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <div
    class="modal"
    role="dialog"
    aria-modal="true"
    on:click|stopPropagation
    on:keydown|stopPropagation
  >
    <h3>Choose a public username</h3>
    <p class="intro">
      Other users will see this on observations and photos you contribute.
      You can change it later.
    </p>

    <label>
      Username
      <input
        type="text"
        bind:value={username}
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        autocomplete="off"
        maxlength="20"
        placeholder="3–20 chars: a–z, 0–9, _-"
      />
      <span class="status status-{availability}">
        {#if availability === 'invalid'}
          Use 3–20 lowercase letters, digits, underscore or hyphen.
        {:else if availability === 'checking'}
          Checking…
        {:else if availability === 'available'}
          ✓ available
        {:else if availability === 'taken'}
          ✗ taken
        {:else}
          &nbsp;
        {/if}
      </span>
    </label>

    <label>
      Display name <span class="muted">(optional)</span>
      <input
        type="text"
        bind:value={displayName}
        maxlength="40"
        placeholder="Judith H."
      />
    </label>

    {#if errorMsg}<p class="error">{errorMsg}</p>{/if}

    <div class="actions">
      <button
        type="button"
        class="save"
        on:click={save}
        disabled={saving || availability !== 'available'}
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex; align-items: center; justify-content: center;
    z-index: 3000;
    padding: 1rem;
  }
  .modal {
    background: white;
    border-radius: 0.5rem;
    padding: 1.1rem 1.2rem 1rem;
    width: 100%;
    max-width: 24rem;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  }
  h3 { margin: 0 0 0.4rem; color: #1f2a1f; font-size: 1.05rem; }
  .intro { margin: 0 0 0.9rem; font-size: 0.85rem; color: #4a554a; }
  label {
    display: block;
    margin-bottom: 0.7rem;
    font-size: 0.78rem;
    color: #4a554a;
  }
  .muted { color: #8a948a; font-weight: normal; }
  input[type='text'] {
    display: block;
    width: 100%;
    box-sizing: border-box;
    padding: 0.4rem 0.55rem;
    border: 1px solid #c7d0c7;
    border-radius: 0.3rem;
    font-size: 0.95rem;
    margin-top: 0.2rem;
  }
  .status {
    display: block;
    margin-top: 0.2rem;
    font-size: 0.75rem;
    min-height: 1.1em;
  }
  .status-available { color: #2f7a3e; }
  .status-taken, .status-invalid { color: #b03030; }
  .status-checking, .status-unknown { color: #8a948a; }
  .error { color: #b03030; font-size: 0.85rem; margin: 0.3rem 0 0.6rem; }
  .actions { display: flex; justify-content: flex-end; }
  .save {
    background: #3a5a3a; color: white; border: 0;
    padding: 0.45rem 1rem; border-radius: 0.3rem;
    font-size: 0.9rem; cursor: pointer;
  }
  .save:disabled { opacity: 0.6; cursor: default; }
</style>
