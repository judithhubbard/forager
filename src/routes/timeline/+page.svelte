<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$lib/utils/nav';
  import { base } from '$app/paths';
  import { activeRegion } from '$lib/stores/activeRegion';
  import { session } from '$lib/stores/auth';
  import { listByRegion, type PinEffective } from '$lib/services/pinService';
  import { listAll as listSpecies, type Species } from '$lib/services/speciesService';
  import { supabase } from '$lib/supabase';
  import { historicalWeather, type DailyWeather } from '$lib/services/weatherService';
  import { colorForGroup } from '$lib/utils/symbology';

  /** A single observation row from v_observation_with_pin trimmed to
   *  what the timeline consumes. */
  type ObsRow = {
    id: string;
    observed_at: string;
    stage: string | null;
    species_id: string | null;
    species_common_name: string | null;
    pin_id: string | null;
    pin_display_name: string | null;
    quality_rating: number | null;
  };
  type WindowRow = {
    species_id: string;
    stage: string;
    start_doy: number;
    end_doy: number;
  };

  let observations: ObsRow[] = [];
  let speciesById: Record<string, Species> = {};
  let windows: WindowRow[] = [];
  let weather: DailyWeather[] = [];
  let center: { lng: number; lat: number } | null = null;
  let loading = true;
  let weatherLoading = false;
  let error = '';

  /** Loads when an active region resolves. Anon viewers without a
   *  region see the picker / explainer. */
  $: if ($activeRegion) void loadRegion($activeRegion.id);

  async function loadRegion(regionId: string) {
    loading = true;
    error = '';
    try {
      const [obsRows, allSpecies, winRows, regionPins] = await Promise.all([
        supabase
          .from('v_observation_with_pin')
          .select(
            'id, observed_at, stage, species_id, species_common_name, pin_id, pin_display_name, quality_rating'
          )
          .eq('pin_region_id', regionId)
          .order('observed_at', { ascending: false })
          .limit(5000),
        listSpecies(),
        supabase
          .from('species_fruiting_windows')
          .select('species_id, stage, start_doy, end_doy')
          .eq('region_id', regionId),
        listByRegion(regionId)
      ]);
      observations = (obsRows.data ?? []) as ObsRow[];
      speciesById = Object.fromEntries(allSpecies.map((s) => [s.id, s]));
      windows = (winRows.data ?? []) as WindowRow[];

      // Region centroid for weather: average all pin coords.
      const valid = regionPins.filter(
        (p): p is PinEffective & { lng: number; lat: number } =>
          p.lng != null && p.lat != null
      );
      if (valid.length > 0) {
        center = {
          lng: valid.reduce((a, p) => a + p.lng, 0) / valid.length,
          lat: valid.reduce((a, p) => a + p.lat, 0) / valid.length
        };
      }
      loading = false;

      // Lazy weather load.
      if (center) {
        weatherLoading = true;
        const currentYear = new Date().getFullYear();
        const earliestObsYear = observations.length
          ? Math.min(
              ...observations
                .filter((o) => o.observed_at)
                .map((o) => new Date(o.observed_at).getFullYear())
            )
          : currentYear - 2;
        const earliest = Math.min(earliestObsYear, currentYear - 2);
        try {
          weather = await historicalWeather(
            center.lng,
            center.lat,
            `${earliest}-01-01`,
            `${currentYear}-12-31`
          );
        } catch (e) {
          console.warn('[timeline] weather fetch failed', e);
        } finally {
          weatherLoading = false;
        }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not load timeline.';
      loading = false;
    }
  }

  function back() {
    if (history.length > 1) history.back();
    else goto('/');
  }

  /** Earthy palette — must match /windows + the pin mini-timeline. */
  const STAGE_COLORS: Record<string, string> = {
    flowering: '#9b7fb2',
    green:     '#6b9442',
    ripening:  '#b87a2f',
    ripe:      '#8e2828',
    past:      '#7a7368'
  };

  /** Group label per genus — copy of the logic in +page.svelte so the
   *  timeline lanes carry the same color as the map markers. */
  const GROUP_LABELS: Record<string, string> = {
    Amelanchier: 'Serviceberry', Asimina: 'Pawpaw', Carya: 'Hickory',
    Castanea: 'Chestnut', Cornus: 'Cornelian cherry', Corylus: 'Hazelnut',
    Diospyros: 'Persimmon', Juglans: 'Walnut', Malus: 'Apple / Pear',
    Pyrus: 'Apple / Pear', Morus: 'Mulberry', Prunus: 'Cherry / Plum',
    Ribes: 'Currant', Rubus: 'Bramble', Sambucus: 'Elderberry',
    Vaccinium: 'Blueberry', Elaeagnus: 'Autumn olive', Vitis: 'Grape',
    Cantharellus: 'Mushroom', Morchella: 'Mushroom',
    Allium: 'Other', Asparagus: 'Other', Mentha: 'Other'
  };
  function groupOf(s: Species): string {
    if (s.scientific_name === 'Prunus dulcis') return 'Almond';
    if (s.scientific_name.startsWith('Rubus ')) return s.common_name;
    const genus = s.scientific_name.split(/\s+/)[0];
    return GROUP_LABELS[genus] ?? genus;
  }

  function dateToDoy(iso: string): number {
    const d = new Date(iso);
    const start = new Date(d.getFullYear(), 0, 0);
    return Math.floor((d.getTime() - start.getTime()) / 86400000);
  }

  // SVG layout — viewBox-scaled to the row's full width.
  const W = 1000;
  const PAD_L = 4, PAD_R = 4;
  const AXIS_H = 14;
  const LANE_H = 9;        // per-species thin band
  const LANE_GAP = 1;
  const RAIN_H = 24;
  const TEMP_H = 26;
  const PLOT_W = W - PAD_L - PAD_R;

  function doyToX(doy: number): number {
    return PAD_L + ((doy - 1) / 365) * PLOT_W;
  }

  const MONTH_STARTS = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
  const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

  /** Per-year breakdown: which species got observed and the row for
   *  each lane. */
  $: years = (() => {
    const y = new Set<number>();
    const cur = new Date().getFullYear();
    y.add(cur);
    for (const o of observations) {
      if (!o.observed_at) continue;
      const yr = new Date(o.observed_at).getFullYear();
      if (!isNaN(yr)) y.add(yr);
    }
    return Array.from(y).sort((a, b) => b - a);
  })();

  function speciesIdsInYear(year: number): string[] {
    const set = new Set<string>();
    for (const o of observations) {
      if (!o.observed_at || !o.species_id) continue;
      if (new Date(o.observed_at).getFullYear() === year) set.add(o.species_id);
    }
    // Sort lanes by group label so related species cluster.
    return Array.from(set).sort((a, b) => {
      const sa = speciesById[a];
      const sb = speciesById[b];
      if (!sa || !sb) return 0;
      return groupOf(sa).localeCompare(groupOf(sb)) || sa.common_name.localeCompare(sb.common_name);
    });
  }

  function obsInYearForSpecies(year: number, speciesId: string): ObsRow[] {
    return observations.filter(
      (o) =>
        o.species_id === speciesId &&
        o.observed_at &&
        new Date(o.observed_at).getFullYear() === year
    );
  }

  function windowsForSpecies(speciesId: string): WindowRow[] {
    return windows.filter((w) => w.species_id === speciesId);
  }

  function laneColor(speciesId: string): string {
    const s = speciesById[speciesId];
    if (!s) return '#999';
    return colorForGroup(groupOf(s));
  }

  function speciesLabel(speciesId: string): string {
    const s = speciesById[speciesId];
    return s ? s.common_name : '?';
  }

  function weatherFor(year: number) {
    return weather.filter((d) => d.date.startsWith(String(year)));
  }
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
  function tempPolyPoints(
    rows: DailyWeather[],
    yStart: number,
    tempMin: number,
    tempRange: number
  ): string {
    const parts: string[] = [];
    for (const d of rows) {
      if (d.temp_max_c == null) continue;
      const x = doyToX(dateToDoy(d.date));
      const y = yStart + TEMP_H - ((d.temp_max_c - tempMin) / tempRange) * TEMP_H;
      parts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return parts.join(' ');
  }

  $: todayDoy = dateToDoy(new Date().toISOString().slice(0, 10));
  $: currentYear = new Date().getFullYear();
</script>

<header>
  <button class="back" on:click={back} aria-label="Back">← Back</button>
  <h1>Year history</h1>
  {#if $activeRegion}
    <span class="region-tag">{$activeRegion.name}</span>
  {/if}
</header>

<main>
  {#if !$activeRegion}
    <p class="lead">Sign in and pick a region to see year-by-year history.</p>
    {#if !$session}
      <p class="hint"><a href={base + '/register'}>Sign up free</a> to track your foraging activity over time.</p>
    {/if}
  {:else if loading}
    <p class="hint">Loading…</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else}
    <p class="lead">
      Aggregated across all pins in <strong>{$activeRegion.name}</strong> ·
      {observations.length} observation{observations.length === 1 ? '' : 's'}
      {#if weatherLoading}<span class="hint"> · loading weather…</span>{/if}
    </p>

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
      <span class="leg-item leg-sep">|</span>
      <span class="leg-item">
        <span class="leg-tick" style="background: #1a4a66"></span> rain
      </span>
      <span class="leg-item">
        <svg width="20" height="10"><line x1="0" y1="5" x2="20" y2="5" stroke="#d57100" stroke-width="2"/></svg>
        max temp
      </span>
      <span class="leg-item leg-sep">|</span>
      <span class="leg-item leg-hint">Hover a tick for species + date</span>
    </div>

    <div class="years">
      {#each years as year}
        {@const sids = speciesIdsInYear(year)}
        {@const yWeather = weatherFor(year)}
        {@const yStats = computeYearStats(yWeather)}
        {@const lanesH = sids.length * (LANE_H + LANE_GAP)}
        {@const rainY = AXIS_H + 4 + lanesH + 6}
        {@const tempY = rainY + RAIN_H + 4}
        {@const totalH = tempY + TEMP_H + 4}
        <section class="year-row" class:current={year === currentYear}>
          <div class="year-label">
            {year}
            {#if year === currentYear}<span class="cur-tag">current</span>{/if}
            <span class="lane-count">{sids.length} species</span>
          </div>
          <svg viewBox="0 0 {W} {totalH}" preserveAspectRatio="none" class="year-svg" style="height: {totalH * 0.85}px;">
            <!-- Month axis -->
            {#each MONTH_STARTS as ms, i}
              <text x={doyToX(ms) + 2} y={11} font-size="10" fill="#6b7a6b">{MONTH_LETTERS[i]}</text>
              <line x1={doyToX(ms)} y1={AXIS_H} x2={doyToX(ms)} y2={totalH} stroke="#e1e8e1" stroke-width="0.5" />
            {/each}

            <!-- Per-species lanes: faded window band + observation ticks -->
            {#each sids as sid, idx}
              {@const laneY = AXIS_H + 4 + idx * (LANE_H + LANE_GAP)}
              {@const color = laneColor(sid)}
              {@const sw = windowsForSpecies(sid)}
              {@const yObs = obsInYearForSpecies(year, sid)}
              <!-- Lane base (very faint fill so empty lanes still show) -->
              <rect x={PAD_L} y={laneY} width={PLOT_W} height={LANE_H} fill={color} opacity="0.06" />
              <!-- Stage-colored window bands, transparent -->
              {#each sw as w}
                <rect
                  x={doyToX(w.start_doy)}
                  y={laneY}
                  width={Math.max(2, doyToX(w.end_doy) - doyToX(w.start_doy))}
                  height={LANE_H}
                  fill={STAGE_COLORS[w.stage] ?? color}
                  opacity="0.32"
                />
              {/each}
              <!-- Observation markers -->
              {#each yObs as o}
                <rect
                  x={doyToX(dateToDoy(o.observed_at)) - 1.4}
                  y={laneY - 0.5}
                  width="2.8"
                  height={LANE_H + 1}
                  fill={STAGE_COLORS[o.stage ?? ''] ?? color}
                  stroke="#1f2a1f"
                  stroke-width="0.4"
                >
                  <title>{speciesLabel(sid)} · {o.stage ?? '—'} · {o.observed_at?.slice(0, 10) ?? ''}{o.quality_rating != null ? ` · quality ${o.quality_rating}` : ''}{o.pin_display_name ? ` · ${o.pin_display_name}` : ''}</title>
                </rect>
              {/each}
              <!-- Right-edge species label -->
              <text x={W - PAD_R - 1} y={laneY + LANE_H - 1.5} text-anchor="end" font-size="8" fill="#4a554a">
                {speciesLabel(sid)}
              </text>
            {/each}

            <!-- Rain bars -->
            {#each yWeather as d}
              {#if d.rain_mm > 0.05}
                {@const barH = Math.min(RAIN_H, (d.rain_mm / yStats.maxRain) * RAIN_H)}
                <rect
                  x={doyToX(dateToDoy(d.date))}
                  y={rainY + (RAIN_H - barH)}
                  width="1.5"
                  height={barH}
                  fill="#1a4a66"
                  opacity="0.85"
                >
                  <title>{d.date} · {d.rain_mm.toFixed(1)}mm rain</title>
                </rect>
              {/if}
            {/each}
            <text x={W - PAD_R - 1} y={rainY + RAIN_H - 2} text-anchor="end" font-size="9" fill="#8a948a">rain</text>

            <!-- Temp polyline -->
            {#if yStats.tempVals.length > 0}
              <polyline
                points={tempPolyPoints(yWeather, tempY, yStats.tempMin, yStats.tempRange)}
                fill="none"
                stroke="#d57100"
                stroke-width="1"
                opacity="0.85"
              />
            {/if}
            <text x={W - PAD_R - 1} y={tempY + TEMP_H - 2} text-anchor="end" font-size="9" fill="#8a948a">temp</text>

            <!-- Today marker on the current-year strip -->
            {#if year === currentYear}
              <line
                x1={doyToX(todayDoy)} y1={AXIS_H}
                x2={doyToX(todayDoy)} y2={totalH}
                stroke="#c14a3a" stroke-width="1" stroke-dasharray="2,2"
              />
            {/if}
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
  .region-tag {
    padding: 0.15rem 0.55rem;
    border: 1px solid #c7d0c7;
    background: #f5f8f5;
    border-radius: 0.35rem;
    font-size: 0.78rem;
    color: #3a5a3a;
  }
  .back { background: transparent; border: 0; color: #3a5a3a; font-size: 0.9rem; cursor: pointer; }
  main { padding: 1rem; max-width: 64rem; margin: 0 auto; color: #1f2a1f; }
  .lead { color: #4a554a; margin: 0 0 0.85rem; }
  .hint { color: #6b7a6b; }
  .error { color: #b03030; }

  .legend-bar {
    display: flex; flex-wrap: wrap; gap: 0.7rem;
    padding: 0.4rem 0.7rem; margin-bottom: 0.75rem;
    background: #fbfdfa; border: 1px solid #e1e8e1; border-radius: 0.35rem;
    font-size: 0.78rem; color: #4a554a;
    align-items: center;
  }
  .leg-item { display: inline-flex; align-items: center; gap: 0.3rem; }
  .leg-band  { display: inline-block; width: 1rem; height: 0.55rem; border-radius: 1px; opacity: 0.7; }
  .leg-tick  { display: inline-block; width: 0.25rem; height: 0.85rem; }
  .leg-sep   { color: #c7d0c7; }
  .leg-hint  { color: #6b7a6b; font-style: italic; }

  .years { display: flex; flex-direction: column; gap: 0.6rem; }
  .year-row {
    background: white;
    border: 1px solid #e1e8e1;
    border-radius: 0.35rem;
    padding: 0.45rem 0.5rem 0.5rem 0.65rem;
    display: grid;
    grid-template-columns: 5.5rem 1fr;
    align-items: start;
    gap: 0.6rem;
  }
  .year-row.current { border-color: #3a5a3a; background: #fbfdfa; }
  .year-label {
    font-weight: 700; color: #3a5a3a;
    font-size: 1.05rem;
    display: flex; flex-direction: column; gap: 0.2rem;
    padding-top: 0.1rem;
  }
  .cur-tag, .lane-count { font-size: 0.7rem; font-weight: 500; color: #6b7a6b; }
  .year-svg {
    width: 100%;
    display: block;
  }
</style>
