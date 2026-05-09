<script lang="ts">
  import { goto } from '$lib/utils/nav';
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import { getGlobalStats, formatPinCount, type GlobalStats } from '$lib/services/statsService';

  let stats: GlobalStats | null = null;
  onMount(async () => { stats = await getGlobalStats(); });

  $: fetchedRel = (() => {
    if (!stats) return '';
    const ms = Date.now() - new Date(stats.fetched_at).getTime();
    if (ms < 60_000) return 'just now';
    if (ms < 3_600_000) return Math.floor(ms / 60_000) + ' min ago';
    if (ms < 86_400_000) return Math.floor(ms / 3_600_000) + 'h ago';
    return Math.floor(ms / 86_400_000) + 'd ago';
  })();
</script>

<header>
  <button class="back" on:click={() => goto('/')}>← Back</button>
  <h1>About Forager</h1>
</header>

<main>
  {#if stats && stats.total_pins > 0}
    <div class="stats-card">
      <div class="stats-grid">
        <div class="stat">
          <div class="stat-value">{formatPinCount(stats.total_pins)}</div>
          <div class="stat-label">trees + plants</div>
        </div>
        <div class="stat">
          <div class="stat-value">{stats.total_species.toLocaleString()}</div>
          <div class="stat-label">foragable species</div>
        </div>
        <div class="stat">
          <div class="stat-value">{stats.total_cities.toLocaleString()}</div>
          <div class="stat-label">data sources</div>
        </div>
      </div>
      <p class="stats-fresh muted">As of {fetchedRel} · refreshes daily.</p>
    </div>
  {/if}

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
  .stats-card {
    background: #f0f5ef;
    border-radius: 0.4rem;
    padding: 0.85rem 1rem;
    margin-bottom: 1.25rem;
  }
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
    gap: 0.85rem;
  }
  .stat-value {
    color: #3a5a3a;
    font-size: 1.5rem;
    font-weight: 600;
    line-height: 1.1;
  }
  .stat-label {
    color: #4a554a;
    font-size: 0.85rem;
    margin-top: 0.15rem;
  }
  .stats-fresh {
    margin: 0.6rem 0 0;
    font-size: 0.78rem;
    color: #6b7a6b;
  }
  .muted { color: #6b7a6b; }
</style>
