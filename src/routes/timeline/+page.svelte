<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$lib/utils/nav';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { activeRegion } from '$lib/stores/activeRegion';
  import { session } from '$lib/stores/auth';
  import { listByRegion, getEffective, type PinEffective } from '$lib/services/pinService';
  import { listAll as listSpecies, type Species } from '$lib/services/speciesService';
  import { listByPin as listObservations, type ObservationWithUser } from '$lib/services/observationService';
  import { supabase } from '$lib/supabase';
  import { historicalWeather, type DailyWeather } from '$lib/services/weatherService';

  type WindowRow = { stage: string; start_doy: number; end_doy: number };

  /** Earthy palette — must match /windows + the pin mini-timeline so
   *  the same data reads consistently across views. */
  const STAGE_COLORS: Record<string, string> = {
    flowering: '#9b7fb2',
    green:     '#6b9442',
    ripening:  '#b87a2f',
    ripe:      '#8e2828',
    past:      '#7a7368'
  };

  $: pinId = $page.url.searchParams.get('pin') ?? '';

  let pin: PinEffective | null = null;
  let species: Species | null = null;
  let observations: ObservationWithUser[] = [];
  let windows: WindowRow[] = [];
  let weather: DailyWeather[] = [];
  let regionPins: PinEffective[] = []; // for the pin picker
  let loading = true;
  let weatherLoading = false;
  let error = '';

  $: if (pinId) void load(pinId);
  // Load picker options when no pin specified.
  $: if (!pinId) void loadPicker();

  async function loadPicker() {
    if (!$activeRegion) return;
    try {
      regionPins = await listByRegion($activeRegion.id);
    } catch (e) {
      console.error('[timeline] picker load failed', e);
    }
  }

  async function load(id: string) {
    loading = true;
    error = '';
    pin = null;
    species = null;
    observations = [];
    windows = [];
    weather = [];
    try {
      pin = await getEffective(id);
      if (!pin) {
        error = 'Pin not found.';
        return;
      }
      const [allSpecies, obs] = await Promise.all([
        listSpecies(),
        listObservations(id)
      ]);
      species = pin.species_id ? (allSpecies.find((s) => s.id === pin?.species_id) ?? null) : null;
      observations = obs;

      // Load harvest windows for this species (via the active region
      // so user-overridden windows take precedence).
      if (pin.species_id && pin.region_id) {
        const { data: w } = await supabase
          .from('species_fruiting_windows')
          .select('stage, start_doy, end_doy')
          .eq('species_id', pin.species_id)
          .eq('region_id', pin.region_id);
        windows = (w ?? []) as WindowRow[];
      }

      // Determine the year span to render: from the earliest
      // observation's year (or 3 years ago if no observations) to
      // the current year.
      const currentYear = new Date().getFullYear();
      const earliestYear = obs.length > 0
        ? Math.min(...obs.map((o) => new Date(o.observed_at!).getFullYear()))
        : currentYear - 2;
      const startDate = `${earliestYear}-01-01`;
      const endDate = `${currentYear}-12-31`;

      // Weather fetch is the slow part — show the page and lazy-load.
      loading = false;
      if (pin.lng != null && pin.lat != null) {
        weatherLoading = true;
        try {
          weather = await historicalWeather(pin.lng, pin.lat, startDate, endDate);
        } catch (e) {
          console.warn('[timeline] weather fetch failed', e);
        } finally {
          weatherLoading = false;
        }
      }
      return;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not load timeline.';
    } finally {
      loading = false;
    }
  }

  function back() {
    if (history.length > 1) history.back();
    else goto('/');
  }

  function pickPin(id: string) {
    goto(`/timeline?pin=${id}`);
  }

  // Years to render: earliest obs year → current year, descending.
  $: years = (() => {
    const y = new Set<number>();
    const cur = new Date().getFullYear();
    for (let i = cur - 2; i <= cur; i++) y.add(i);
    for (const o of observations) {
      const yr = new Date(o.observed_at!).getFullYear();
      if (!isNaN(yr)) y.add(yr);
    }
    return Array.from(y).sort((a, b) => b - a);
  })();

  // Helpers for SVG layout — fixed viewBox, scales with width via CSS.
  const W = 1000;
  const H = 130;
  const PAD_L = 4, PAD_R = 4;
  const AXIS_H = 14;
  const BAND_Y = AXIS_H + 2;
  const BAND_H = 24;
  const OBS_Y = BAND_Y + BAND_H + 2;
  const OBS_H = 14;
  const RAIN_Y = OBS_Y + OBS_H + 4;
  const RAIN_H = 26;
  const TEMP_Y = RAIN_Y + RAIN_H + 6;
  const TEMP_H = 30;
  const PLOT_W = W - PAD_L - PAD_R;

  function doyToX(doy: number): number {
    return PAD_L + ((doy - 1) / 365) * PLOT_W;
  }

  // Month-letter axis. Doy of the 1st of each month (non-leap; close
  // enough for the human-readable axis).
  const MONTH_STARTS = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
  const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

  function dateToDoy(iso: string): number {
    const d = new Date(iso);
    const start = new Date(d.getFullYear(), 0, 0);
    return Math.floor((d.getTime() - start.getTime()) / 86400000);
  }

  function obsTicksFor(year: number) {
    return observations
      .filter((o) => o.observed_at && new Date(o.observed_at).getFullYear() === year)
      .map((o) => ({
        doy: dateToDoy(o.observed_at!),
        stage: o.stage as string | null,
        quality: o.quality_rating
      }));
  }

  function weatherFor(year: number) {
    return weather.filter((d) => d.date.startsWith(String(year)));
  }

  /** Pre-compute per-year scalars used by the SVG template. Done in
   *  a function rather than inline {@const} blocks because Svelte's
   *  {@const} parser doesn't accept the TS type-predicate syntax we
   *  need to narrow temp_max_c from (number | null) to number. */
  function computeYearStats(rows: DailyWeather[]) {
    const tempVals: number[] = [];
    let maxRain = 5;
    for (const r of rows) {
      if (r.temp_max_c != null) tempVals.push(r.temp_max_c);
      if (r.rain_mm > maxRain) maxRain = r.rain_mm;
    }
    const tempMin = tempVals.length ? Math.min(...tempVals) : 0;
    const tempMax = tempVals.length ? Math.max(...tempVals) : 30;
    const tempRange = Math.max(1, tempMax - tempMin);
    return { maxRain, tempMin, tempMax, tempRange, tempVals };
  }

  /** Build the SVG `points` attribute for the daily max-temp polyline.
   *  Inline {@const} can't express the non-null narrowing cleanly, so
   *  we compute the string up front. */
  function tempPolyPoints(
    rows: DailyWeather[],
    tempMin: number,
    tempRange: number
  ): string {
    const parts: string[] = [];
    for (const d of rows) {
      if (d.temp_max_c == null) continue;
      const x = doyToX(dateToDoy(d.date));
      const y = TEMP_Y + TEMP_H - ((d.temp_max_c - tempMin) / tempRange) * TEMP_H;
      parts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return parts.join(' ');
  }

  /** Today's day-of-year for the current-year strip. */
  $: todayDoy = dateToDoy(new Date().toISOString().slice(0, 10));
  $: currentYear = new Date().getFullYear();
</script>

<header>
  <button class="back" on:click={back} aria-label="Back">← Back</button>
  <h1>Year history</h1>
</header>

<main>
  {#if !pinId}
    <p class="lead">Pick a pin to see its year-by-year history.</p>
    {#if !$session}
      <p class="hint">Sign in to choose from your pins, or open a pin from the map and click "Year history".</p>
    {:else if regionPins.length === 0}
      <p class="hint">No pins in your region yet.</p>
    {:else}
      <ul class="picker">
        {#each regionPins as p}
          {#if p.id}
            <li>
              <button on:click={() => pickPin(p.id ?? '')}>
                {p.display_name ?? '(unnamed pin)'}
                <span class="picker-loc">{p.lat?.toFixed(4)}, {p.lng?.toFixed(4)}</span>
              </button>
            </li>
          {/if}
        {/each}
      </ul>
    {/if}
  {:else if loading}
    <p class="hint">Loading…</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else if pin && species}
    <!-- Plant info card -->
    <section class="plant">
      <div class="plant-head">
        <h2>{species.common_name}</h2>
        <p class="sci">{species.scientific_name}</p>
      </div>
      {#if species.aliases?.length}
        <p class="aliases">Also known as: {species.aliases.join(', ')}</p>
      {/if}
      {#if species.forage_parts?.length}
        <div class="row">
          <span class="row-label">Edible:</span>
          <span class="chips">
            {#each species.forage_parts as part}
              <span class="chip">{part.replace(/_/g, ' ')}</span>
            {/each}
          </span>
        </div>
      {/if}
      {#if species.preparation_methods?.length}
        <div class="row">
          <span class="row-label">Uses:</span>
          <span class="chips">
            {#each species.preparation_methods as m}
              <span class="chip method">{m.replace(/_/g, ' ')}</span>
            {/each}
          </span>
        </div>
      {/if}
      {#if species.usage_notes}<p class="prose">{species.usage_notes}</p>{/if}
      {#if species.harvest_tips}<p class="prose"><strong>Harvest tips:</strong> {species.harvest_tips}</p>{/if}
      {#if species.toxicity_notes}<p class="prose warn"><strong>Toxicity:</strong> {species.toxicity_notes}</p>{/if}
      {#if species.safety_notes}<p class="prose warn"><strong>Safety:</strong> {species.safety_notes}</p>{/if}
      <p class="more">
        <a href={base + '/species/' + species.id}>Full species page →</a>
        ·
        <a href={base + '/pins/' + pin.id}>Pin detail →</a>
      </p>
    </section>

    <!-- Legend -->
    <div class="legend-bar">
      <span class="leg-item">
        <span class="leg-band" style="background: {STAGE_COLORS.flowering}"></span> flowering
      </span>
      <span class="leg-item">
        <span class="leg-band" style="background: {STAGE_COLORS.green}"></span> green
      </span>
      <span class="leg-item">
        <span class="leg-band" style="background: {STAGE_COLORS.ripening}"></span> ripening
      </span>
      <span class="leg-item">
        <span class="leg-band" style="background: {STAGE_COLORS.ripe}"></span> ripe
      </span>
      <span class="leg-item">
        <span class="leg-tick" style="background: #1a4a66"></span> rain
      </span>
      <span class="leg-item">
        <svg width="20" height="10"><line x1="0" y1="5" x2="20" y2="5" stroke="#d57100" stroke-width="2"/></svg>
        max temp
      </span>
    </div>

    {#if weatherLoading}
      <p class="hint">Loading weather…</p>
    {/if}

    <!-- Year strips, newest first -->
    <div class="years">
      {#each years as year}
        {@const yObs = obsTicksFor(year)}
        {@const yWeather = weatherFor(year)}
        {@const yStats = computeYearStats(yWeather)}
        {@const maxRain = yStats.maxRain}
        {@const tempMin = yStats.tempMin}
        {@const tempMax = yStats.tempMax}
        {@const tempRange = yStats.tempRange}
        {@const tempVals = yStats.tempVals}
        <section class="year-row" class:current={year === currentYear}>
          <div class="year-label">
            {year}
            {#if year === currentYear}<span class="cur-tag">current</span>{/if}
          </div>
          <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" class="year-svg">
            <!-- Month axis -->
            {#each MONTH_STARTS as ms, i}
              <text
                x={doyToX(ms) + 2}
                y={11}
                font-size="10"
                fill="#6b7a6b"
              >{MONTH_LETTERS[i]}</text>
              <line
                x1={doyToX(ms)} y1={AXIS_H}
                x2={doyToX(ms)} y2={H}
                stroke="#e1e8e1" stroke-width="0.5"
              />
            {/each}

            <!-- Window bands (faded background) -->
            {#each windows as w}
              <rect
                x={doyToX(w.start_doy)}
                y={BAND_Y}
                width={Math.max(2, doyToX(w.end_doy) - doyToX(w.start_doy))}
                height={BAND_H}
                fill={STAGE_COLORS[w.stage] ?? '#999'}
                opacity="0.28"
              />
            {/each}

            <!-- Observation ticks for this pin in this year -->
            {#each yObs as o}
              <rect
                x={doyToX(o.doy) - 1.5}
                y={OBS_Y}
                width="3"
                height={OBS_H}
                fill={STAGE_COLORS[o.stage ?? ''] ?? '#1f2a1f'}
                stroke="#1f2a1f"
                stroke-width="0.4"
              >
                <title>{o.stage} · DOY {o.doy}{o.quality != null ? ` · quality ${o.quality}` : ''}</title>
              </rect>
            {/each}

            <!-- Daily rain bars -->
            {#each yWeather as d}
              {#if d.rain_mm > 0.05}
                {@const barH = Math.min(RAIN_H, (d.rain_mm / maxRain) * RAIN_H)}
                <rect
                  x={doyToX(dateToDoy(d.date))}
                  y={RAIN_Y + (RAIN_H - barH)}
                  width="1.5"
                  height={barH}
                  fill="#1a4a66"
                  opacity="0.85"
                >
                  <title>{d.date} · {d.rain_mm.toFixed(1)}mm rain</title>
                </rect>
              {/if}
            {/each}

            <!-- Daily max-temp polyline -->
            {#if tempVals.length > 0}
              <polyline
                points={tempPolyPoints(yWeather, tempMin, tempRange)}
                fill="none"
                stroke="#d57100"
                stroke-width="1"
                opacity="0.85"
              />
            {/if}

            <!-- Today marker on the current-year strip -->
            {#if year === currentYear}
              <line
                x1={doyToX(todayDoy)} y1={AXIS_H}
                x2={doyToX(todayDoy)} y2={H}
                stroke="#c14a3a" stroke-width="1" stroke-dasharray="2,2"
              />
            {/if}

            <!-- Lane labels (right edge) -->
            <text x={W - PAD_R - 1} y={BAND_Y + BAND_H / 2 + 3} text-anchor="end" font-size="9" fill="#8a948a">windows</text>
            <text x={W - PAD_R - 1} y={OBS_Y + OBS_H / 2 + 3} text-anchor="end" font-size="9" fill="#8a948a">obs</text>
            <text x={W - PAD_R - 1} y={RAIN_Y + RAIN_H - 2} text-anchor="end" font-size="9" fill="#8a948a">rain</text>
            <text x={W - PAD_R - 1} y={TEMP_Y + TEMP_H - 2} text-anchor="end" font-size="9" fill="#8a948a">temp</text>
          </svg>
        </section>
      {/each}
    </div>
  {/if}
</main>

<style>
  header {
    display: flex; align-items: center; gap: 1rem;
    padding: 0.5rem 1rem; background: white;
    border-bottom: 1px solid #e1e8e1;
    height: 56px; box-sizing: border-box;
  }
  header h1 { margin: 0; font-size: 1.05rem; color: #3a5a3a; }
  .back { background: transparent; border: 0; color: #3a5a3a; font-size: 0.9rem; cursor: pointer; }
  main { padding: 1rem; max-width: 64rem; margin: 0 auto; color: #1f2a1f; }
  .lead { color: #4a554a; }
  .hint { color: #6b7a6b; }
  .error { color: #b03030; }

  .picker { list-style: none; padding: 0; margin: 1rem 0 0; display: flex; flex-direction: column; gap: 0.4rem; }
  .picker button {
    display: flex; justify-content: space-between; gap: 1rem;
    width: 100%; text-align: left;
    background: white; border: 1px solid #c7d0c7; border-radius: 0.35rem;
    padding: 0.55rem 0.75rem; cursor: pointer; font-size: 0.92rem;
  }
  .picker button:hover { background: #f5f8f5; }
  .picker-loc { color: #6b7a6b; font-size: 0.78rem; }

  .plant {
    background: white;
    border: 1px solid #c7d0c7;
    border-radius: 0.45rem;
    padding: 0.85rem 1rem 1rem;
    margin-bottom: 1rem;
  }
  .plant-head h2 { margin: 0; color: #3a5a3a; font-size: 1.1rem; }
  .sci { margin: 0.1rem 0 0; font-style: italic; color: #4a554a; font-size: 0.92rem; }
  .aliases { color: #6b7a6b; font-size: 0.85rem; margin: 0.4rem 0 0.5rem; }
  .row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.4rem; margin: 0.35rem 0; font-size: 0.88rem; }
  .row-label { color: #6b7a6b; font-size: 0.8rem; }
  .chips { display: inline-flex; flex-wrap: wrap; gap: 0.3rem; }
  .chip {
    background: #eef3ed; border: 1px solid #d4ddd2; color: #1f2a1f;
    padding: 0.05rem 0.45rem; border-radius: 0.45rem; font-size: 0.8rem;
  }
  .chip.method { background: #fff4e3; border-color: #e8d3a6; }
  .prose { margin: 0.45rem 0 0; line-height: 1.45; font-size: 0.92rem; }
  .prose.warn { color: #7a3a3a; }
  .more { margin-top: 0.85rem; font-size: 0.88rem; }
  .more a { color: #3a5a3a; }

  .legend-bar {
    display: flex; flex-wrap: wrap; gap: 0.85rem;
    padding: 0.5rem 0.7rem; margin-bottom: 0.5rem;
    background: #fbfdfa; border: 1px solid #e1e8e1; border-radius: 0.35rem;
    font-size: 0.78rem; color: #4a554a;
    align-items: center;
  }
  .leg-item { display: inline-flex; align-items: center; gap: 0.3rem; }
  .leg-band {
    display: inline-block; width: 1rem; height: 0.55rem; border-radius: 1px;
    opacity: 0.7;
  }
  .leg-tick { display: inline-block; width: 0.25rem; height: 0.85rem; }

  .years { display: flex; flex-direction: column; gap: 0.5rem; }
  .year-row {
    background: white;
    border: 1px solid #e1e8e1;
    border-radius: 0.35rem;
    padding: 0.4rem 0.5rem 0.4rem 0.6rem;
    display: grid;
    grid-template-columns: 4.5rem 1fr;
    align-items: center;
    gap: 0.5rem;
  }
  .year-row.current { border-color: #3a5a3a; background: #fbfdfa; }
  .year-label {
    font-weight: 700; color: #3a5a3a;
    font-size: 1.05rem;
    display: flex; flex-direction: column; gap: 0.2rem;
  }
  .cur-tag { font-size: 0.7rem; font-weight: 500; color: #6b7a6b; }
  .year-svg {
    width: 100%;
    height: 7rem;
    display: block;
  }
</style>
