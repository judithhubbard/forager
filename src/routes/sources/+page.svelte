<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$lib/utils/nav';
  import { supabase } from '$lib/supabase';

  type ImportSource = {
    id: string;
    name: string;
    url: string | null;
    license: string | null;
    description: string | null;
  };

  let sources: ImportSource[] = [];
  let loading = true;
  let error = '';

  onMount(async () => {
    try {
      const { data, error: e } = await supabase
        .from('import_sources')
        .select('id, name, url, license, description')
        .order('name');
      if (e) throw e;
      sources = (data ?? []) as ImportSource[];
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not load sources.';
    } finally {
      loading = false;
    }
  });

  function back() {
    if (history.length > 1) history.back();
    else goto('/');
  }
</script>

<header>
  <button class="back" on:click={back} aria-label="Back">← Back</button>
  <h1>Data sources</h1>
</header>

<main>
  <p class="lead">
    Forager bootstraps from open municipal and academic plant
    inventories. Every imported dataset is credited below; the public
    map adds new cities over time as more inventories are scraped.
  </p>

  <h2>Imported datasets</h2>
  {#if loading}
    <p class="hint">Loading…</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else if sources.length === 0}
    <p class="hint">No imported datasets yet.</p>
  {:else}
    <ul class="sources">
      {#each sources as s}
        <li>
          <strong>
            {#if s.url}
              <a href={s.url} target="_blank" rel="noopener">{s.name}</a>
            {:else}
              {s.name}
            {/if}
          </strong>
          {#if s.license}<span class="license"> · {s.license}</span>{/if}
          {#if s.description}
            <p class="desc">{s.description}</p>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  <h2>Map &amp; geocoding</h2>
  <ul class="sources">
    <li>
      <strong>Map tiles</strong> — © OpenStreetMap contributors, served
      by the
      <a href="https://www.hotosm.org/" target="_blank" rel="noopener">Humanitarian OpenStreetMap Team</a>
      and (satellite layer) Esri / Maxar / Earthstar Geographics.
    </li>
    <li>
      <strong>Address search</strong> — geocoding by
      <a href="https://nominatim.openstreetmap.org/" target="_blank" rel="noopener">Nominatim</a>;
      data © OpenStreetMap contributors.
    </li>
  </ul>

  <h2>Weather</h2>
  <ul class="sources">
    <li>
      <strong>Recent rainfall + historical daily weather</strong> —
      <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a>
      (CC BY 4.0). Used for the rainfall chip in the corner of the
      map and for the daily rain bars + temperature line on the Year
      history page. Open-Meteo aggregates from national weather
      services including
      <a href="https://www.weather.gov/" target="_blank" rel="noopener">NOAA / NWS</a>,
      DWD (Germany), ECMWF, and others.
    </li>
  </ul>

  <h2>Phenology</h2>
  <ul class="sources">
    <li>
      <strong>Default harvest windows</strong> — approximate per-species
      flowering / ripening day-of-year ranges keyed to USDA hardiness
      zones. Compiled from USDA, USA-NPN, Cooperative Extension
      bulletins, and foraging field guides; refined over time from
      observations logged on Forager. Edit the defaults for your zone
      on the <em>Harvest windows</em> page.
    </li>
    <li>
      <strong>USDA hardiness zone lookup</strong> — current
      implementation is a latitude-band heuristic. A future migration
      replaces it with the
      <a href="https://prism.oregonstate.edu/" target="_blank" rel="noopener">PRISM Climate Group</a>
      shapefile (public domain).
    </li>
  </ul>

  <h2>Species data</h2>
  <ul class="sources">
    <li>
      <strong>Taxonomy &amp; range</strong> — partly drawn from
      <a href="https://plants.usda.gov/" target="_blank" rel="noopener">USDA PLANTS</a>
      (public domain).
    </li>
    <li>
      <strong>Edibility &amp; preparation</strong> — facts pulled from
      <a href="https://www.wikidata.org/" target="_blank" rel="noopener">Wikidata</a>
      (CC0); prose written or rewritten by Forager editors. We do not
      ingest text from non-commercial-only sources (PFAF, Falling
      Fruit) — they are referenced for fact-checking only.
    </li>
  </ul>
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
  .back { background: transparent; border: 0; color: #3a5a3a; font-size: 0.9rem; cursor: pointer; }
  main { padding: 1.25rem 1rem 3rem; max-width: 38rem; margin: 0 auto; line-height: 1.5; color: #1f2a1f; }
  .lead { color: #4a554a; margin: 0 0 1.25rem; }
  .hint { color: #6b7a6b; }
  .error { color: #b03030; }
  h2 { color: #3a5a3a; font-size: 1rem; margin: 1.5rem 0 0.5rem; }
  ul.sources {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }
  ul.sources li {
    border-left: 3px solid #3a5a3a;
    padding-left: 0.7rem;
    background: #fbfdfa;
    border-radius: 0 0.25rem 0.25rem 0;
    padding: 0.5rem 0.7rem;
  }
  ul.sources li strong { color: #1f2a1f; }
  .license { color: #6b7a6b; font-size: 0.85rem; }
  .desc { margin: 0.25rem 0 0; font-size: 0.9rem; color: #4a554a; }
  a { color: #3a5a3a; }
</style>
