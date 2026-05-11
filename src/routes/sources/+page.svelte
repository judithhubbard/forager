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

  <!-- Section jump-links so users can see at a glance which kinds
       of data feed the app. The long "Imported datasets" list
       (one row per municipal tree inventory) used to dominate the
       page and bury the other categories below. -->
  <nav class="toc" aria-label="Sections on this page">
    <a href="#imported">Tree inventories{#if !loading && sources.length}<span class="toc-count">({sources.length})</span>{/if}</a>
    <a href="#map">Map &amp; geocoding</a>
    <a href="#weather">Weather</a>
    <a href="#zones">Hardiness zones</a>
    <a href="#phenology">Phenology</a>
    <a href="#species">Species data</a>
  </nav>

  <details class="ds-section" id="imported">
    <summary>
      <h2>Tree inventories</h2>
      {#if !loading && sources.length > 0}<span class="hint"> · {sources.length} sources</span>{/if}
    </summary>
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
  </details>

  <h2 id="map">Map &amp; geocoding</h2>
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

  <h2 id="weather">Weather</h2>
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

  <h2 id="zones">Plant Hardiness Zones</h2>
  <ul class="sources">
    <li>
      <strong>USDA Plant Hardiness Zone polygons</strong> — currently
      based on the 2012 USDA map via the public-domain
      <a href="https://github.com/kgjenkins/ophz" target="_blank" rel="noopener">OPHZ</a>
      vector reconstruction. Used for point-in-zone lookup on every
      pin and for the optional zone overlay on the map. We're in the
      process of upgrading to the
      <a href="https://prism.oregonstate.edu/projects/plant_hardiness_zones.php" target="_blank" rel="noopener">2023 USDA / PRISM update</a>
      (public domain), which shifts much of the eastern US warmer by
      ~½ zone — so e.g. Ithaca went from 5b to 6a. Phenology windows
      will then key off the updated zone.
    </li>
  </ul>

  <h2 id="phenology">Phenology</h2>
  <p class="hint" style="margin: 0 0 0.5rem">
    Per-species harvest day-of-year ranges keyed to USDA hardiness
    zones. Curated rows draw from multiple sources, then a regional
    slope model projects each species across all the zones where
    it grows. Sources listed alphabetically.
  </p>
  <ul class="sources">
    <li>
      <strong>Audubon Mushroom Field Guide</strong> — fall-flush
      timing for choice edible mushrooms (hen of the woods, lion's
      mane, oyster, etc.). Used as a regional anchor for cool-
      temperate Northeast.
    </li>
    <li>
      <strong>California Rare Fruit Growers (CRFG)</strong> — fruit
      ripening windows for warm-zone species (avocado, cherimoya,
      feijoa, loquat, mango, papaya, sapote). Used as a regional
      anchor for zones 9a–10b.
    </li>
    <li>
      <strong>Cornell Cooperative Extension</strong> — Northeast
      tree-fruit, stone-fruit, and small-fruit timing. Used for
      Cornell's home-zone (Ithaca 5b/6a) curation.
    </li>
    <li>
      <strong>Cornell Maple Program</strong> — sap-run timing for
      Acer saccharum / A. nigrum / A. rubrum across Northeast
      latitude band.
    </li>
    <li>
      <strong>Forager Chef + Eat The Weeds</strong> — wild-foraging
      timing references for spring ephemerals, mushrooms, and
      late-fall foragable species.
    </li>
    <li>
      <strong><a href="https://www.inaturalist.org/" target="_blank" rel="noopener">iNaturalist</a></strong>
      (CC BY-NC where individual photos require attribution; observation
      timestamps are CC0 facts) — Fruiting-stage observation
      distributions per species per climate zone. Used for the
      empirical p15-p85 tail-trim windows shown on the calibration
      viewer next to the curated rows. iNat Fruiting is left-shifted
      by reporter attention (people post first sightings of ripe
      fruit), so we publish the inner-70% percentile range, not the
      raw extremes.
    </li>
    <li>
      <strong>Mushroom Expert</strong> — peak-flush timing for
      saprotrophic and mycorrhizal mushrooms (chicken-of-woods,
      morels, chanterelles, black trumpet).
    </li>
    <li>
      <strong><a href="https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals" target="_blank" rel="noopener">NOAA US Climate Normals 1991–2020</a></strong>
      (public domain) — frost-date normals driving the
      <code>frost-offset</code> confidence tier for species whose
      harvest is anchored to first / last frost (hardy nuts, hardy
      kiwi, persimmon).
    </li>
    <li>
      <strong>NC State Cooperative Extension</strong> — Carolinas /
      Mid-Atlantic regional anchors for species that fruit on a
      different timeline than the cool-temperate Northeast (a
      common cause of regional model divergence).
    </li>
    <li>
      <strong>Northeast Mycological Federation</strong> — peer-
      reviewed mushroom regional timing for NE/Midwest.
    </li>
    <li>
      <strong>Oregon State / WSU Extension</strong> — PNW maritime-
      climate windows (hazelnut, walnut, fall-fruiting Pleurotus,
      maritime mushroom species).
    </li>
    <li>
      <strong>UC ANR (UC Agriculture &amp; Natural Resources)</strong> —
      California statewide cultivar-mix envelopes (Japanese plum
      Jun–Sep, citrus, almond, persimmon, fig). Used as a regional
      anchor for zones 8b–10a, where California's commercial cultivar
      diversity makes a single linear slope insufficient.
    </li>
    <li>
      <strong>UF/IFAS (University of Florida)</strong> — Florida /
      Gulf-coast subtropical fruit and warm-zone palm timing. Used
      as a regional anchor for zones 9a–11a.
    </li>
    <li>
      <strong>USA National Phenology Network (USA-NPN)</strong> —
      plant-phenology observation network. Reference for species
      whose published phenology comes from coordinated volunteer
      observations.
    </li>
    <li>
      <strong>USDA PLANTS Database</strong> (public domain) — native
      range polygons used to constrain which zones a species can
      plausibly fruit in.
    </li>
  </ul>

  <h2 id="species">Species data</h2>
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
  /* Section TOC — pill-button row at the top so the user sees every
     data-type category before being buried in the long tree-inventory
     list. */
  .toc {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 0 0 1.25rem;
  }
  .toc a {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.3rem 0.65rem;
    background: #ebf2e7;
    border: 1px solid #cfdcc6;
    border-radius: 999px;
    color: #3a5a3a;
    text-decoration: none;
    font-size: 0.85rem;
  }
  .toc a:hover { background: #dde8d4; }
  .toc-count {
    color: #6b7a6b;
    font-size: 0.78rem;
  }
  /* Collapsible "Tree inventories" section. With 200+ entries it
     used to dominate the page; collapsed by default + a count badge
     gives users a clear preview without forcing them past it. */
  details.ds-section {
    margin: 1rem 0;
    border: 1px solid #e1e8e1;
    border-radius: 0.4rem;
    background: white;
  }
  details.ds-section > summary {
    cursor: pointer;
    padding: 0.5rem 0.75rem;
    list-style: none;
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
  }
  details.ds-section > summary::-webkit-details-marker { display: none; }
  details.ds-section > summary::before {
    content: '▸';
    color: #6b7a6b;
    margin-right: 0.25rem;
    transition: transform 0.15s ease;
    display: inline-block;
  }
  details.ds-section[open] > summary::before { transform: rotate(90deg); }
  details.ds-section > summary h2 {
    display: inline;
    margin: 0;
  }
  details.ds-section > :not(summary) {
    padding: 0 0.75rem 0.75rem;
  }
</style>
