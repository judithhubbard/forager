<script lang="ts">
  import { settings } from '$lib/stores/settings';

  function accept() {
    settings.update((s) => ({ ...s, disclaimerAcceptedAt: new Date().toISOString() }));
  }
</script>

<!-- Backdrop swallows clicks but keeps the app rendered behind so
     it's clear what they're agreeing to use. -->
<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="backdrop">
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="disc-title">
    <h2 id="disc-title">Forage responsibly</h2>
    <p class="lead">
      Forager is a personal record-keeping tool, not a guarantee. You — not
      Forager, not whoever logged the pin — are responsible for:
    </p>
    <ul>
      <li>
        <strong>Identification.</strong> Misidentification can be dangerous,
        especially with mushrooms. When in doubt, don't eat it.
      </li>
      <li>
        <strong>Following local laws.</strong> Foraging is restricted in many
        parks, preserves, and protected lands. Know the rules where you are.
      </li>
      <li>
        <strong>Respecting property.</strong> A pin on the map doesn't grant
        permission to enter private land. Confirm access before harvesting.
      </li>
    </ul>
    <div class="actions">
      <button type="button" on:click={accept}>I understand</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex; align-items: center; justify-content: center;
    z-index: 2500;
    padding: 1rem;
  }
  .modal {
    background: white;
    border-radius: 0.5rem;
    padding: 1.25rem 1.4rem 1.1rem;
    width: 100%;
    max-width: 26rem;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3);
  }
  h2 { margin: 0 0 0.5rem; color: #1f2a1f; font-size: 1.15rem; }
  .lead { margin: 0 0 0.75rem; font-size: 0.92rem; color: #2a322a; }
  ul {
    list-style: none;
    padding: 0;
    margin: 0 0 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    font-size: 0.88rem;
    color: #2a322a;
    line-height: 1.4;
  }
  li {
    border-left: 3px solid #3a5a3a;
    padding-left: 0.6rem;
  }
  strong { color: #1f2a1f; }
  .actions { display: flex; justify-content: flex-end; }
  .actions button {
    background: #3a5a3a;
    color: white;
    border: 0;
    padding: 0.55rem 1.1rem;
    border-radius: 0.3rem;
    font-size: 0.95rem;
    cursor: pointer;
  }
  .actions button:hover { background: #2c4a2c; }
</style>
