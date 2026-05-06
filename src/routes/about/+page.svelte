<script lang="ts">
  import { goto } from '$lib/utils/nav';
  import { base } from '$app/paths';
</script>

<header>
  <button class="back" on:click={() => goto('/')}>← Back</button>
  <h1>About Forager</h1>
</header>

<main>
  <p>
    Forager is a community foraging map. The public layer is built from
    open municipal and academic tree inventories — a growing list of
    cities is included today, with more added as their data becomes
    accessible.
  </p>
  <p>
    Signed-in users get a personal watchlist and ripeness alerts.
    <a href={base + '/register'}>Forager Pro</a> adds private pin
    dropping, observation logging with photos, year-over-year
    journaling, and track / heatmap recording.
  </p>
  <p>
    See <a href={base + '/sources'}>Data sources</a> for the full list
    of contributing datasets and licenses, or
    <a href="https://github.com/judithhubbard/forager" target="_blank" rel="noopener">the source repo</a>
    for design notes.
  </p>

  <h2>Forage responsibly</h2>
  <p>
    Forager is a record-keeping tool, not a guarantee. You — not
    Forager, not whoever logged the pin — are responsible for:
  </p>
  <ul class="disclaimer">
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
</main>

<style>
  header { display: flex; align-items: center; gap: 1rem; padding: 0.5rem 1rem; background: white; border-bottom: 1px solid #e1e8e1; height: 56px; box-sizing: border-box; }
  header h1 { margin: 0; font-size: 1.05rem; color: #3a5a3a; }
  .back { background: transparent; border: 0; color: #3a5a3a; font-size: 0.9rem; cursor: pointer; }
  main { padding: 1.25rem 1rem; max-width: 36rem; margin: 0 auto; line-height: 1.5; color: #1f2a1f; }
  h2 { color: #3a5a3a; font-size: 1rem; margin: 1.5rem 0 0.5rem; }
  ul.disclaimer { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  ul.disclaimer li { border-left: 3px solid #3a5a3a; padding-left: 0.7rem; }
  a { color: #3a5a3a; }
</style>
