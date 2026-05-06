<script lang="ts">
  import { goto } from '$lib/utils/nav';
</script>

<header>
  <button class="back" on:click={() => goto('/')}>← Back</button>
  <h1>How to use Forager</h1>
</header>

<main>
  <h2>The map</h2>
  <ul>
    <li><strong>Tap a pin</strong> to open its detail panel.</li>
    <li><strong>Long-press</strong> on an empty spot of the map (right-click on desktop) to drop a new pin at that location.</li>
    <li><strong>Tap the crosshair</strong> at the top-right to center the map on your current location (HTTPS only).</li>
    <li>Marker color = forage category (red-orange fruit, brown nut, purple mushroom, green other).</li>
    <li><strong>One ring</strong> around a pin = ripe in its predicted window today. <strong>Two rings</strong> = within ±10 days of that window.</li>
    <li><strong>Faded</strong> markers are gone, dormant, or inaccessible.</li>
  </ul>

  <h2>Filters</h2>
  <ul>
    <li><strong>Species</strong> — checkbox panel grouped by genus (Serviceberry, Hickory, …) with category tabs.</li>
    <li><strong>Show</strong> — narrow by status: Active / Possibly ripe today / Confirmed ripe this year / Confirmed harvest history / Best harvest ≥ N★.</li>
  </ul>

  <h2>Logging a harvest</h2>
  <ul>
    <li>Open a pin, tap <strong>✓ Verify harvest</strong> to log a confirmed harvest with date and 1–5 stars.</li>
    <li><strong>🚫 No harvest</strong> records that you visited but didn't get any (won't count toward harvest history).</li>
    <li>Date supports any past year — pick Year, Month/Year, or full Day/Month/Year.</li>
  </ul>

  <h2>Hazards &amp; access</h2>
  <ul>
    <li>Add per-pin tags for poison ivy, ticks, sick / diseased trees, fenced areas, out-of-reach branches, etc.</li>
    <li>Pins tagged <strong>Inaccessible / Out of reach / Fenced / Private property</strong> render as transparent on the map.</li>
  </ul>

  <h2>Tools menu (≡)</h2>
  <ul>
    <li><strong>Activity</strong> — recent observations across the region.</li>
    <li><strong>Harvest windows</strong> — view the year-long timeline of fruiting stages. Click any colored bar to edit its dates.</li>
    <li><strong>Sign out</strong>.</li>
  </ul>
</main>

<style>
  header { display: flex; align-items: center; gap: 1rem; padding: 0.5rem 1rem; background: white; border-bottom: 1px solid #e1e8e1; height: 56px; box-sizing: border-box; }
  header h1 { margin: 0; font-size: 1.05rem; color: #3a5a3a; }
  .back { background: transparent; border: 0; color: #3a5a3a; font-size: 0.9rem; cursor: pointer; }
  main { padding: 1.25rem 1rem 3rem; max-width: 36rem; margin: 0 auto; line-height: 1.55; color: #1f2a1f; }
  h2 { color: #3a5a3a; font-size: 1rem; margin: 1.5rem 0 0.5rem; }
  ul { padding-left: 1.25rem; }
</style>
