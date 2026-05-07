<script lang="ts">
  // Multi-select picker for interest groups. Used by /welcome to onboard
  // a new account and by /settings (or wherever) to let users edit their
  // species interests later. Pure presentation — the parent decides
  // what to do with the selected[] when the user submits.
  import { createEventDispatcher } from 'svelte';
  import {
    INTEREST_GROUPS,
    type InterestGroup
  } from '$lib/utils/interestGroups';

  /** Initial set of selected group ids. */
  export let selected: InterestGroup[] = [];
  /** Submit button label, e.g. "Continue" / "Save". */
  export let submitLabel: string = 'Continue';
  /** Optional skip button — when shown, dispatches 'skipAll'
   *  meaning "show me everything regardless of group". */
  export let showSkipAll: boolean = true;

  const dispatch = createEventDispatcher<{
    submit: { selected: InterestGroup[] };
    skipAll: void;
  }>();

  let chosen = new Set<InterestGroup>(selected);

  function toggle(id: InterestGroup, checked: boolean) {
    const next = new Set(chosen);
    if (checked) next.add(id);
    else next.delete(id);
    chosen = next;
  }
  function onCheckboxChange(id: InterestGroup, e: Event) {
    toggle(id, (e.currentTarget as HTMLInputElement).checked);
  }

  function onSubmit() {
    dispatch('submit', { selected: [...chosen] });
  }

  function onSkipAll() {
    dispatch('skipAll');
  }
</script>

<div class="interest-picker">
  <ul>
    {#each INTEREST_GROUPS as g}
      <li>
        <label>
          <input
            type="checkbox"
            checked={chosen.has(g.id)}
            on:change={(e) => onCheckboxChange(g.id, e)}
          />
          <div class="text">
            <div class="title">
              <strong>{g.label}</strong>
              {#if g.caution}<span class="caution"> · {g.caution}</span>{/if}
            </div>
            <div class="examples">{g.examples}</div>
            <div class="coverage">{g.coverage}</div>
          </div>
        </label>
      </li>
    {/each}
  </ul>
  <div class="actions">
    {#if showSkipAll}
      <button type="button" class="link-btn" on:click={onSkipAll}>
        Skip — show me everything
      </button>
    {/if}
    <button type="button" class="primary" on:click={onSubmit}>
      {submitLabel}
    </button>
  </div>
</div>

<style>
  .interest-picker { display: flex; flex-direction: column; gap: 0.7rem; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  li { background: white; border: 1px solid #c7d0c7; border-radius: 0.4rem; padding: 0.6rem 0.8rem; }
  li:hover { border-color: #3a5a3a; }
  label { display: flex; align-items: flex-start; gap: 0.6rem; cursor: pointer; }
  input[type='checkbox'] { margin-top: 0.2rem; width: 1.1rem; height: 1.1rem; }
  .text { flex: 1; min-width: 0; }
  .title { font-size: 0.95rem; color: #1f2a1f; }
  .title strong { font-weight: 600; }
  .caution { color: #8a4f10; font-size: 0.82rem; font-style: italic; font-weight: normal; }
  .examples { color: #4a554a; font-size: 0.83rem; margin-top: 0.15rem; }
  .coverage { color: #6b7a6b; font-size: 0.78rem; margin-top: 0.1rem; font-style: italic; }
  .actions {
    display: flex;
    gap: 0.5rem;
    justify-content: space-between;
    align-items: center;
    margin-top: 0.4rem;
  }
  .link-btn {
    background: transparent;
    border: 0;
    color: #3a5a3a;
    font-size: 0.9rem;
    cursor: pointer;
    text-decoration: underline;
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
  }
  .primary:disabled { opacity: 0.6; cursor: default; }
</style>
