<script lang="ts">
  import { goto } from '$lib/utils/nav';
</script>

<header>
  <button class="back" on:click={() => goto('/')}>← Back</button>
  <h1>About Forager</h1>
</header>

<main>
  <p>
    Forager is a private, mobile-friendly map of forageable plants. It bootstraps
    from public datasets (Cornell Campus Tree Inventory, City of Ithaca Tree
    Inventory, Cornell Botanic Gardens) and lets you add your own pins, log
    harvests, attach photos, and tag hazards or access notes.
  </p>
  <p>
    The app is invitation-only; data is scoped to a single region (Ithaca, NY).
    See <a href="https://github.com/judithhubbard/forager" target="_blank" rel="noopener">the source repo</a>
    for design notes.
  </p>

  <h2>Forage responsibly</h2>
  <p>
    Forager is a personal record-keeping tool, not a guarantee. You — not Forager,
    not whoever logged the pin — are responsible for:
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

  <h2>Data attribution</h2>
  <ul>
    <li>
      <strong>Cornell Campus Tree Inventory</strong> — via
      <a href="https://cugir.library.cornell.edu/catalog/cugir-009100" target="_blank" rel="noopener">CUGIR cugir-009100</a>.
    </li>
    <li>
      <strong>City of Ithaca Tree Inventory</strong> — via the
      <a href="https://data-ithacany.opendata.arcgis.com/datasets/city-managed-trees" target="_blank" rel="noopener">City of Ithaca open data portal</a>.
    </li>
    <li>
      <strong>Cornell Botanic Gardens</strong> plant collection — scraped from the
      <a href="https://cornell.gardenexplorer.org/" target="_blank" rel="noopener">Garden Explorer</a> public records.
    </li>
    <li>
      <strong>Map tiles</strong> — © OpenStreetMap contributors.
    </li>
  </ul>
</main>

<style>
  header { display: flex; align-items: center; gap: 1rem; padding: 0.5rem 1rem; background: white; border-bottom: 1px solid #e1e8e1; height: 56px; box-sizing: border-box; }
  header h1 { margin: 0; font-size: 1.05rem; color: #3a5a3a; }
  .back { background: transparent; border: 0; color: #3a5a3a; font-size: 0.9rem; cursor: pointer; }
  main { padding: 1.25rem 1rem; max-width: 36rem; margin: 0 auto; line-height: 1.5; color: #1f2a1f; }
  h2 { color: #3a5a3a; font-size: 1rem; margin: 1.5rem 0 0.5rem; }
  ul { padding-left: 1.25rem; }
  ul.disclaimer { list-style: none; padding-left: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  ul.disclaimer li { border-left: 3px solid #3a5a3a; padding-left: 0.7rem; }
  a { color: #3a5a3a; }
</style>
