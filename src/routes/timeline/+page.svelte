<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$lib/utils/nav';
  import { base } from '$app/paths';
  import { myRegions, regionsLoading } from '$lib/stores/activeRegion';
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

  /** One per region the user belongs to. Each region has its own
   *  observations, harvest windows, weather centroid, and weather
   *  series — they don't share, since regions can be in different
   *  climates and the data would be misleading if combined. */
  type RegionTimeline = {
    regionId: string;
    regionName: string;
    observations: ObsRow[];
    windows: WindowRow[];
    weather: DailyWeather[];
    center: { lng: number; lat: number } | null;
    weatherLoading: boolean;
  };

  let speciesById: Record<string, Species> = {};
  let regionTimelines: RegionTimeline[] = [];
  let loading = true;
  let error = '';

  /** Reload all regions whenever the user's region list changes. */
  $: if (!$regionsLoading && $myRegions.length > 0) void loadAllRegions();

  async function loadAllRegions() {
    loading = true;
    error = '';
    try {
      const allSpecies = await listSpecies();
      speciesById = Object.fromEntries(allSpecies.map((s) => [s.id, s]));
      regionTimelines = await Promise.all(
        $myRegions.map((r) => loadOneRegion(r.id, r.name))
      );
      loading = false;
      // Lazy weather load per region — fire-and-forget so the species
      // lanes paint immediately while the historical weather call
      // (one Open-Meteo round-trip per region) settles in the
      // background.
      void Promise.all(regionTimelines.map((rt) => fetchWeatherFor(rt)));
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not load timeline.';
      loading = false;
    }
  }

  async function loadOneRegion(
    regionId: string,
    regionName: string
  ): Promise<RegionTimeline> {
    const [obsRows, winRows, regionPins] = await Promise.all([
      supabase
        .from('v_observation_with_pin')
        .select(
          'id, observed_at, stage, species_id, species_common_name, pin_id, pin_display_name, quality_rating'
        )
        .eq('pin_region_id', regionId)
        .order('observed_at', { ascending: false })
        .limit(5000),
      supabase
        .from('species_fruiting_windows')
        .select('species_id, stage, start_doy, end_doy')
        .eq('region_id', regionId),
      listByRegion(regionId)
    ]);
    const observations = (obsRows.data ?? []) as ObsRow[];
    const windows = (winRows.data ?? []) as WindowRow[];

    // Region centroid for weather lookup.
    const valid = regionPins.filter(
      (p): p is PinEffective & { lng: number; lat: number } =>
        p.lng != null && p.lat != null
    );
    let center: { lng: number; lat: number } | null = null;
    if (valid.length > 0) {
      center = {
        lng: valid.reduce((a, p) => a + p.lng, 0) / valid.length,
        lat: valid.reduce((a, p) => a + p.lat, 0) / valid.length
      };
    }
    return {
      regionId, regionName, observations, windows,
      weather: [], center, weatherLoading: !!center
    };
  }

  async function fetchWeatherFor(rt: RegionTimeline) {
    if (!rt.center) return;
    const currentYear = new Date().getFullYear();
    const earliestObsYear = rt.observations.length
      ? Math.min(
          ...rt.observations
            .filter((o) => o.observed_at)
            .map((o) => new Date(o.observed_at).getFullYear())
        )
      : currentYear - 2;
    const earliest = Math.min(earliestObsYear, currentYear - 2);
    try {
      const w = await historicalWeather(
        rt.center.lng, rt.center.lat,
        `${earliest}-01-01`, `${currentYear}-12-31`
      );
      regionTimelines = regionTimelines.map((r) =>
        r.regionId === rt.regionId
          ? { ...r, weather: w, weatherLoading: false }
          : r
      );
    } catch (e) {
      console.warn('[timeline] weather fetch failed for', rt.regionName, e);
      regionTimelines = regionTimelines.map((r) =>
        r.regionId === rt.regionId ? { ...r, weatherLoading: false } : r
      );
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
  const LANE_H = 9;        // per-species band; many lanes per region
  const LANE_GAP = 1;
  const RAIN_H = 36;       // dedicated bar-chart lane (top)
  const TEMP_H = 44;       // dedicated min/max lane (below rain)
  const TRACK_GAP = 6;     // breathing room between major tracks
  const PLOT_W = W - PAD_L - PAD_R;
  /** Fixed scale ceiling for rain bars (mm/day). Days above this
   *  clip at the top of the lane. Yearly auto-scale was misleading
   *  when one big winter snow event made all summer rain bars
   *  invisible — fixed cap keeps normal-day bars at readable
   *  heights all year. */
  const RAIN_CAP_MM = 25;
  /** Fixed temp range for the lane (°C) so winters don't squish
   *  summer swings. Values outside clip. -20°C ≈ -4°F, 40°C ≈ 104°F. */
  const TEMP_LO_C = -20;
  const TEMP_HI_C = 40;
  const TEMP_RANGE_C = TEMP_HI_C - TEMP_LO_C;

  function doyToX(doy: number): number {
    return PAD_L + ((doy - 1) / 365) * PLOT_W;
  }

  const MONTH_STARTS = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
  const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

  function yearsFor(rt: RegionTimeline): number[] {
    const y = new Set<number>();
    y.add(new Date().getFullYear());
    for (const o of rt.observations) {
      if (!o.observed_at) continue;
      const yr = new Date(o.observed_at).getFullYear();
      if (!isNaN(yr)) y.add(yr);
    }
    return Array.from(y).sort((a, b) => b - a);
  }

  /** Every species relevant to this region: anything with harvest
   *  windows defined for the region OR with at least one observation
   *  on a pin in the region. Sorted by group label so related
   *  species cluster (all Apple/Pear together, etc). */
  function regionSpeciesIds(rt: RegionTimeline): string[] {
    const set = new Set<string>();
    for (const w of rt.windows) set.add(w.species_id);
    for (const o of rt.observations) {
      if (o.species_id) set.add(o.species_id);
    }
    return Array.from(set).sort((a, b) => {
      const sa = speciesById[a];
      const sb = speciesById[b];
      if (!sa || !sb) return 0;
      return groupOf(sa).localeCompare(groupOf(sb)) || sa.common_name.localeCompare(sb.common_name);
    });
  }

  function obsInYearForSpecies(rt: RegionTimeline, year: number, speciesId: string): ObsRow[] {
    return rt.observations.filter(
      (o) =>
        o.species_id === speciesId &&
        o.observed_at &&
        new Date(o.observed_at).getFullYear() === year
    );
  }

  function windowsForSpecies(rt: RegionTimeline, speciesId: string): WindowRow[] {
    return rt.windows.filter((w) => w.species_id === speciesId);
  }

  function weatherInYear(rt: RegionTimeline, year: number): DailyWeather[] {
    return rt.weather.filter((d) => d.date.startsWith(String(year)));
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

  function hasWeatherData(rows: DailyWeather[]): boolean {
    return rows.some((d) => d.temp_max_c != null || d.rain_mm > 0);
  }

  /** Polyline points for either the daily max or the daily min temp,
   *  using the FIXED -20…40°C lane scale so winters don't squish
   *  summer swings. Values outside the range are clipped to the lane
   *  edges. */
  function tempPolyPoints(
    rows: DailyWeather[],
    yStart: number,
    field: 'max' | 'min'
  ): string {
    const parts: string[] = [];
    for (const d of rows) {
      const v = field === 'max' ? d.temp_max_c : d.temp_min_c;
      if (v == null) continue;
      const clipped = Math.max(TEMP_LO_C, Math.min(TEMP_HI_C, v));
      const x = doyToX(dateToDoy(d.date));
      const y = yStart + TEMP_H - ((clipped - TEMP_LO_C) / TEMP_RANGE_C) * TEMP_H;
      parts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return parts.join(' ');
  }

  /** Format temperature in °F (US convention) with one decimal. */
  function fmtTempF(c: number): string {
    return `${(c * 9 / 5 + 32).toFixed(1)}°F`;
  }

  $: todayDoy = dateToDoy(new Date().toISOString().slice(0, 10));
  $: currentYear = new Date().getFullYear();
</script>

<header>
  <button class="back" on:click={back} aria-label="Back">← Back</button>
  <h1>Year history</h1>
</header>

<main>
  {#if $regionsLoading || loading}
    <p class="hint">Loading…</p>
  {:else if $myRegions.length === 0}
    <p class="lead">Sign in and pick a region to see year-by-year history.</p>
    {#if !$session}
      <p class="hint"><a href={base + '/register'}>Sign up free</a> to track your foraging activity over time.</p>
    {/if}
  {:else if error}
    <p class="error">{error}</p>
  {:else}
    <p class="lead">
      Year-by-year history across {$myRegions.length === 1 ? 'your region' : `your ${$myRegions.length} regions`}.
      Each region has its own weather (climate varies; combining them would be misleading).
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
        <span class="leg-tick" style="background: #1a4a66"></span> rain (mm/day)
      </span>
      <span class="leg-item">
        <svg width="20" height="10"><line x1="0" y1="5" x2="20" y2="5" stroke="#d57100" stroke-width="2"/></svg>
        max temp
      </span>
      <span class="leg-item">
        <svg width="20" height="10"><line x1="0" y1="5" x2="20" y2="5" stroke="#3a8db0" stroke-width="2"/></svg>
        min temp
      </span>
      <span class="leg-item leg-sep">|</span>
      <span class="leg-item leg-hint">Hover a tick for species + date</span>
    </div>

    {#each regionTimelines as rt (rt.regionId)}
      {@const allSids = regionSpeciesIds(rt)}
      <section class="region-block">
        <header class="region-head">
          <h2>{rt.regionName}</h2>
          <span class="region-meta">
            {rt.observations.length} observation{rt.observations.length === 1 ? '' : 's'} · {allSids.length} species
            {#if rt.weatherLoading}<span class="hint"> · loading weather…</span>{/if}
          </span>
        </header>

    <div class="years">
      {#each yearsFor(rt) as year}
        {@const yWeather = weatherInYear(rt, year)}
        {@const lanesH = allSids.length * (LANE_H + LANE_GAP)}
        {@const rainY = AXIS_H + 4}
        {@const tempY = rainY + RAIN_H + TRACK_GAP}
        {@const lanesY = tempY + TEMP_H + TRACK_GAP}
        {@const totalH = lanesY + lanesH + 6}
        <section class="year-row" class:current={year === currentYear}>
          <div class="year-label">
            {year}
            {#if year === currentYear}<span class="cur-tag">current</span>{/if}
          </div>
          <svg viewBox="0 0 {W} {totalH}" preserveAspectRatio="none" class="year-svg" style="height: {totalH * 1.1}px;">
            <!-- Month axis -->
            {#each MONTH_STARTS as ms, i}
              <text x={doyToX(ms) + 2} y={11} font-size="10" fill="#6b7a6b">{MONTH_LETTERS[i]}</text>
              <line x1={doyToX(ms)} y1={AXIS_H} x2={doyToX(ms)} y2={totalH} stroke="#e1e8e1" stroke-width="0.5" />
            {/each}

            <!-- Rain track at top: dedicated bar-chart lane in blue.
                 Fixed 25mm/day cap so a single big winter event
                 doesn't make all the summer bars invisible. -->
            <rect
              x={PAD_L} y={rainY} width={PLOT_W} height={RAIN_H}
              fill="#f3f8fc" stroke="#dde7ee" stroke-width="0.5"
            />
            {#if !hasWeatherData(yWeather) && rt.weather.length === 0}
              <text x={W / 2} y={rainY + RAIN_H / 2 + 3} text-anchor="middle" font-size="9" fill="#8a948a" font-style="italic">
                {rt.weatherLoading ? 'loading weather…' : 'no weather data'}
              </text>
            {/if}
            {#each yWeather as d}
              {#if d.rain_mm > 0.05}
                {@const barH = Math.min(RAIN_H - 2, (Math.min(d.rain_mm, RAIN_CAP_MM) / RAIN_CAP_MM) * (RAIN_H - 2))}
                <rect
                  x={doyToX(dateToDoy(d.date)) - 1.0}
                  y={rainY + (RAIN_H - barH)}
                  width="2.2"
                  height={barH}
                  fill="#1a4a66"
                  opacity="0.92"
                >
                  <title>{d.date} · {d.rain_mm.toFixed(1)}mm ({(d.rain_mm / 25.4).toFixed(2)}")</title>
                </rect>
              {/if}
            {/each}
            <text x={PAD_L + 4} y={rainY + 11} font-size="10" fill="#1a4a66" font-weight="600">rain</text>
            <text x={W - PAD_R - 1} y={rainY + RAIN_H - 2} text-anchor="end" font-size="8" fill="#8a948a">
              0…{RAIN_CAP_MM}mm/day
            </text>

            <!-- Temp track: max (orange) + min (cool blue) polylines
                 on a fixed -20…40°C lane so winter doesn't squish
                 summer swings. -->
            <rect
              x={PAD_L} y={tempY} width={PLOT_W} height={TEMP_H}
              fill="#fbf9f3" stroke="#e8e3d4" stroke-width="0.5"
            />
            {#if hasWeatherData(yWeather)}
              <polyline
                points={tempPolyPoints(yWeather, tempY, 'min')}
                fill="none" stroke="#3a8db0" stroke-width="1.2" opacity="0.85"
              />
              <polyline
                points={tempPolyPoints(yWeather, tempY, 'max')}
                fill="none" stroke="#d57100" stroke-width="1.2" opacity="0.95"
              />
            {/if}
            <text x={PAD_L + 4} y={tempY + 11} font-size="10" fill="#7a4a10" font-weight="600">temp</text>
            <text x={W - PAD_R - 1} y={tempY + 11} text-anchor="end" font-size="8" fill="#7a4a10">
              104°F
            </text>
            <text x={W - PAD_R - 1} y={tempY + TEMP_H - 2} text-anchor="end" font-size="8" fill="#1a4a66">
              −4°F
            </text>

            <!-- All region species, one thin lane each. Window bands
                 + observation markers if present. -->
            {#each allSids as sid, idx}
              {@const laneY = lanesY + idx * (LANE_H + LANE_GAP)}
              {@const color = laneColor(sid)}
              {@const sw = windowsForSpecies(rt, sid)}
              {@const yObs = obsInYearForSpecies(rt, year, sid)}
              <rect x={PAD_L} y={laneY} width={PLOT_W} height={LANE_H} fill={color} opacity="0.06" />
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
              <text x={W - PAD_R - 1} y={laneY + LANE_H - 1.5} text-anchor="end" font-size="8" fill="#4a554a">
                {speciesLabel(sid)}
              </text>
            {/each}

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
      </section>
    {/each}
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

  .region-block {
    margin: 1rem 0 1.5rem;
    padding-top: 0.5rem;
    border-top: 2px solid #d4ddd2;
  }
  .region-block:first-of-type { border-top: 0; padding-top: 0; }
  .region-head {
    display: flex; align-items: baseline; gap: 0.85rem;
    flex-wrap: wrap; margin-bottom: 0.5rem;
  }
  .region-head h2 {
    margin: 0;
    color: #3a5a3a;
    font-size: 1.1rem;
  }
  .region-meta { color: #6b7a6b; font-size: 0.85rem; }
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
  .cur-tag { font-size: 0.7rem; font-weight: 500; color: #6b7a6b; }
  .year-svg {
    width: 100%;
    display: block;
  }
</style>
