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
    /** 'day' | 'month' | 'year'. Only day-precision observations get
     *  rendered as ticks on the timeline — a "ripe in 2024" entry
     *  should not be pinned to Jan 1. */
    observed_precision: string | null;
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
      // SELECT * so the query keeps working whether or not migration
      // 20260506000023 (which adds observed_precision to the view)
      // has been applied yet. If the column is missing, the
      // precision filter falls through to the null path and all
      // observations are kept.
      supabase
        .from('v_observation_with_pin')
        .select('*')
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
      : currentYear - MIN_HISTORY_YEARS;
    const earliest = Math.min(earliestObsYear, currentYear - MIN_HISTORY_YEARS);
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

  /** Forage category for a species — same logic as +page.svelte so
   *  the timeline lanes group like the map filter panel: fruit
   *  trees, then brambles, then nuts, then mushrooms, then other. */
  type SpeciesCat = 'fruit' | 'bramble' | 'nut' | 'mushroom' | 'other';
  const CAT_ORDER: SpeciesCat[] = ['fruit', 'bramble', 'nut', 'mushroom', 'other'];
  function categoryOfSpecies(s: Species): SpeciesCat {
    if (s.scientific_name.startsWith('Rubus')) return 'bramble';
    const parts = s.forage_parts ?? [];
    if (parts.includes('mushroom')) return 'mushroom';
    if (parts.includes('nut')) return 'nut';
    if (parts.includes('fruit')) return 'fruit';
    return 'other';
  }

  function dateToDoy(iso: string): number {
    const d = new Date(iso);
    const start = new Date(d.getFullYear(), 0, 0);
    return Math.floor((d.getTime() - start.getTime()) / 86400000);
  }

  // SVG layout — viewBox-scaled to the row's full width. Left
  // padding is bigger than right because we want the y-axis scale
  // labels (rain mm, temp °F) on the left side, away from the
  // species-name labels on the right.
  const W = 1000;
  // Wider left padding to fit a rotated 'rain' / 'temp' track label
  // on the far left + numeric scale labels (25mm, 104°F, etc.) to
  // its right, without colliding.
  const PAD_L = 56;
  const PAD_R = 6;
  const AXIS_H = 14;
  const LANE_H = 9;        // per-species band; many lanes per region
  const LANE_GAP = 1;
  const RAIN_H = 40;       // dedicated bar-chart lane (top)
  const TEMP_H = 50;       // dedicated min/max lane (below rain)
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
  /** °C thresholds that split the temperature polygon into three
   *  perceptual zones: cool (below freezing → cold blue), warm
   *  (above freezing through 80°F → amber), hot (above 80°F → red). */
  const FREEZE_C = 0;        // 32°F
  const HOT_C = (80 - 32) * 5 / 9; // 80°F ≈ 26.7°C

  function doyToX(doy: number): number {
    return PAD_L + ((doy - 1) / 365) * PLOT_W;
  }

  const MONTH_STARTS = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
  const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

  /** Number of historical years to always include even when the
   *  user has no observations that far back — useful for seeing
   *  weather context from previous seasons. */
  const MIN_HISTORY_YEARS = 4;

  function yearsFor(rt: RegionTimeline): number[] {
    const y = new Set<number>();
    const cur = new Date().getFullYear();
    for (let i = 0; i <= MIN_HISTORY_YEARS; i++) y.add(cur - i);
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
      // Order: category (fruit → bramble → nut → mushroom → other),
      // then group label within the category, then species name.
      const ca = CAT_ORDER.indexOf(categoryOfSpecies(sa));
      const cb = CAT_ORDER.indexOf(categoryOfSpecies(sb));
      if (ca !== cb) return ca - cb;
      const ga = groupOf(sa);
      const gb = groupOf(sb);
      if (ga !== gb) return ga.localeCompare(gb);
      return sa.common_name.localeCompare(sb.common_name);
    });
  }

  function obsInYearForSpecies(rt: RegionTimeline, year: number, speciesId: string): ObsRow[] {
    return rt.observations.filter(
      (o) =>
        o.species_id === speciesId &&
        o.observed_at &&
        // Only day-precision obs get rendered as ticks. Year/month
        // precision should not be misleadingly pinned to Jan 1 or
        // the first of the month.
        (o.observed_precision == null || o.observed_precision === 'day') &&
        new Date(o.observed_at).getFullYear() === year
    );
  }

  function windowsForSpecies(rt: RegionTimeline, speciesId: string): WindowRow[] {
    return rt.windows.filter((w) => w.species_id === speciesId);
  }

  function weatherInYear(rt: RegionTimeline, year: number): DailyWeather[] {
    return rt.weather.filter((d) => d.date.startsWith(String(year)));
  }

  /** Day-of-year averages computed across all PAST years' weather
   *  (excluding the current year). Drives the "typical year"
   *  overlay on the current-year strip, so the user can see at a
   *  glance whether 2026 is running warm/wet/dry vs the historical
   *  pattern. */
  type DoyAvg = { rain_mm: number; temp_max_c: number | null; temp_min_c: number | null };
  function computeDoyAverages(rt: RegionTimeline, currentYear: number): Map<number, DoyAvg> {
    const acc = new Map<
      number,
      { rainSum: number; rainCount: number; maxSum: number; maxCount: number; minSum: number; minCount: number }
    >();
    for (const d of rt.weather) {
      const yr = parseInt(d.date.slice(0, 4), 10);
      if (isNaN(yr) || yr === currentYear) continue;
      const doy = dateToDoy(d.date);
      let a = acc.get(doy);
      if (!a) {
        a = { rainSum: 0, rainCount: 0, maxSum: 0, maxCount: 0, minSum: 0, minCount: 0 };
        acc.set(doy, a);
      }
      a.rainSum += d.rain_mm;
      a.rainCount += 1;
      if (d.temp_max_c != null) {
        a.maxSum += d.temp_max_c;
        a.maxCount += 1;
      }
      if (d.temp_min_c != null) {
        a.minSum += d.temp_min_c;
        a.minCount += 1;
      }
    }
    const out = new Map<number, DoyAvg>();
    for (const [doy, a] of acc) {
      out.set(doy, {
        rain_mm: a.rainCount ? a.rainSum / a.rainCount : 0,
        temp_max_c: a.maxCount ? a.maxSum / a.maxCount : null,
        temp_min_c: a.minCount ? a.minSum / a.minCount : null
      });
    }
    return out;
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

  /** Convert a °C value to a y-pixel inside the temp track, using
   *  the fixed −20…40°C scale. Values outside the range clip. */
  function tempToY(c: number, yStart: number): number {
    const clipped = Math.max(TEMP_LO_C, Math.min(TEMP_HI_C, c));
    return yStart + TEMP_H - ((clipped - TEMP_LO_C) / TEMP_RANGE_C) * TEMP_H;
  }

  /** One rect per day per temperature zone the day's range touches.
   *  Each rect is independent — no polygon connecting points across
   *  gaps in the data, so out-of-order rows or missing days can't
   *  produce zigzag artifacts. Days are split into up to three
   *  colored bands: cool (below 32°F), warm (32–80°F), hot (above
   *  80°F).
   *
   *  Returns shape: { x, y, w, h, zone } per rect. */
  type TempRect = { x: number; y: number; w: number; h: number; zone: 'cool' | 'warm' | 'hot' };
  function tempDayRects(rows: DailyWeather[], yStart: number): TempRect[] {
    const out: TempRect[] = [];
    const yHotEdge = tempToY(HOT_C, yStart);
    const yFreezeEdge = tempToY(FREEZE_C, yStart);
    const dayW = PLOT_W / 365 + 0.6;
    for (const d of rows) {
      if (d.temp_max_c == null || d.temp_min_c == null) continue;
      const hi = Math.max(d.temp_max_c, d.temp_min_c);
      const lo = Math.min(d.temp_max_c, d.temp_min_c);
      const yTop = tempToY(hi, yStart);
      const yBot = tempToY(lo, yStart);
      if (yBot - yTop < 0.2) continue;
      const xCenter = doyToX(dateToDoy(d.date));
      const x = xCenter - dayW / 2;
      // Hot zone: y between yTop and yHotEdge (smaller y = higher temp)
      if (hi > HOT_C) {
        const top = yTop;
        const bot = Math.min(yHotEdge, yBot);
        if (bot > top) out.push({ x, y: top, w: dayW, h: bot - top, zone: 'hot' });
      }
      // Warm zone: between yHotEdge and yFreezeEdge
      if (hi > FREEZE_C && lo < HOT_C) {
        const top = Math.max(yHotEdge, yTop);
        const bot = Math.min(yFreezeEdge, yBot);
        if (bot > top) out.push({ x, y: top, w: dayW, h: bot - top, zone: 'warm' });
      }
      // Cool zone: y between yFreezeEdge and yBot
      if (lo < FREEZE_C) {
        const top = Math.max(yFreezeEdge, yTop);
        const bot = yBot;
        if (bot > top) out.push({ x, y: top, w: dayW, h: bot - top, zone: 'cool' });
      }
    }
    return out;
  }
  const ZONE_COLOR: Record<TempRect['zone'], string> = {
    cool: '#3a6b8b',
    warm: '#e8a560',
    hot: '#d04a3a'
  };

  /** Polygon spanning the average min→max temperature band across
   *  the year (computed from past years). Continuous data — no gaps,
   *  so a single polygon is safe. Drawn faint behind the current
   *  year's actual rects so deviations are visible. */
  function avgTempPolygon(
    doyAvg: Map<number, DoyAvg> | null,
    yStart: number
  ): string {
    if (!doyAvg) return '';
    const pairs = Array.from(doyAvg.entries())
      .filter(([, a]) => a.temp_max_c != null && a.temp_min_c != null)
      .sort((a, b) => a[0] - b[0]);
    if (pairs.length === 0) return '';
    const top: string[] = [];
    const bot: string[] = [];
    for (const [doy, a] of pairs) {
      const x = doyToX(doy);
      top.push(`${x.toFixed(1)},${tempToY(a.temp_max_c as number, yStart).toFixed(1)}`);
      bot.push(`${x.toFixed(1)},${tempToY(a.temp_min_c as number, yStart).toFixed(1)}`);
    }
    bot.reverse();
    return [...top, ...bot].join(' ');
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
        <span class="leg-tick" style="background: #1a4a66"></span> rain
      </span>
      <span class="leg-item">
        <span class="leg-band" style="background: #d04a3a"></span> &gt;80°F
      </span>
      <span class="leg-item">
        <span class="leg-band" style="background: #e8a560"></span> 32–80°F
      </span>
      <span class="leg-item">
        <span class="leg-band" style="background: #3a6b8b"></span> &lt;32°F
      </span>
      <span class="leg-item leg-sep">|</span>
      <span class="leg-item">
        <span class="leg-band" style="background: #9aa6a3; opacity: 0.45;"></span>
        typical year (current strip only)
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
          {#if rt.center}
            <span class="region-meta weather-loc">
              Weather from
              <a
                href={`https://www.openstreetmap.org/?mlat=${rt.center.lat.toFixed(4)}&mlon=${rt.center.lng.toFixed(4)}&zoom=11`}
                target="_blank"
                rel="noopener"
                title="Open this lookup point on OSM"
              >{rt.center.lat.toFixed(3)}°, {rt.center.lng.toFixed(3)}°</a>
              (centroid of {rt.regionName} pins)
            </span>
          {/if}
        </header>

    <div class="years">
      {#each yearsFor(rt) as year}
        {@const yWeather = weatherInYear(rt, year)}
        {@const lanesH = allSids.length * (LANE_H + LANE_GAP)}
        {@const rainY = AXIS_H + 4}
        {@const tempY = rainY + RAIN_H + TRACK_GAP}
        {@const lanesY = tempY + TEMP_H + TRACK_GAP}
        {@const totalH = lanesY + lanesH + 6}
        {@const yHi = tempToY(TEMP_HI_C, tempY)}
        {@const y80 = tempToY(HOT_C, tempY)}
        {@const y32 = tempToY(FREEZE_C, tempY)}
        {@const yLo = tempToY(TEMP_LO_C, tempY)}
        {@const tempRects = tempDayRects(yWeather, tempY)}
        {@const doyAvg = year === currentYear ? computeDoyAverages(rt, currentYear) : null}
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

            <!-- Rain track at top: dedicated bar-chart lane.
                 Fixed 25mm/day cap so a single big winter event
                 doesn't make all the summer bars invisible. -->
            <rect
              x={PAD_L} y={rainY} width={PLOT_W} height={RAIN_H}
              fill="#f3f8fc" stroke="#dde7ee" stroke-width="0.5"
            />
            <!-- Average-year overlay: faint rain bars from past years
                 averaged per day-of-year, drawn under the current
                 year's actual bars so deviations stand out. -->
            {#if doyAvg}
              {#each Array.from(doyAvg.entries()) as [doy, avg]}
                {#if avg.rain_mm > 0.05}
                  {@const aBarH = Math.min(RAIN_H - 2, (Math.min(avg.rain_mm, RAIN_CAP_MM) / RAIN_CAP_MM) * (RAIN_H - 2))}
                  <rect
                    x={doyToX(doy) - 1.0}
                    y={rainY + (RAIN_H - aBarH)}
                    width="2.2"
                    height={aBarH}
                    fill="#88a8c0"
                    opacity="0.45"
                  />
                {/if}
              {/each}
            {/if}
            <!-- Track-name "rain" rotated 90° on the far left, then
                 numeric scale labels right-aligned at PAD_L − 3 -->
            <text
              transform={`rotate(-90 10 ${rainY + RAIN_H / 2})`}
              x="10" y={rainY + RAIN_H / 2 + 3}
              text-anchor="middle" font-size="10"
              fill="#1a4a66" font-weight="600"
            >rain</text>
            <text x={PAD_L - 3} y={rainY + 8} text-anchor="end" font-size="8" fill="#8a948a">25 mm</text>
            <text x={PAD_L - 3} y={rainY + RAIN_H / 2 + 3} text-anchor="end" font-size="8" fill="#8a948a">12</text>
            <text x={PAD_L - 3} y={rainY + RAIN_H - 2} text-anchor="end" font-size="8" fill="#8a948a">0</text>
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
                  <title>{d.date} · {d.rain_mm.toFixed(1)} mm ({(d.rain_mm / 25.4).toFixed(2)} in)</title>
                </rect>
              {/if}
            {/each}

            <!-- Temp track: per-day min→max polygon, color-zoned by
                 temperature. Cool (below freezing) in dark blue,
                 warm (32–80°F) in amber, hot (above 80°F) in red.
                 Faint horizontal lines at the freezing and 80°F
                 thresholds for reference. -->
            <rect
              x={PAD_L} y={tempY} width={PLOT_W} height={TEMP_H}
              fill="#fbf9f3" stroke="#e8e3d4" stroke-width="0.5"
            />
            {#if doyAvg}
              {@const avgPoly = avgTempPolygon(doyAvg, tempY)}
              {#if avgPoly}
                <polygon points={avgPoly} fill="#9aa6a3" opacity="0.25" />
              {/if}
            {/if}
            {#if tempRects.length > 0}
              {#each tempRects as r}
                <rect
                  x={r.x} y={r.y} width={r.w} height={r.h}
                  fill={ZONE_COLOR[r.zone]}
                  opacity="0.85"
                />
              {/each}
              <!-- Threshold reference lines on top of the bars -->
              <line x1={PAD_L} y1={y32} x2={W - PAD_R} y2={y32} stroke="#5e7a8b" stroke-width="0.6" stroke-dasharray="3,2" opacity="0.6" />
              <line x1={PAD_L} y1={y80} x2={W - PAD_R} y2={y80} stroke="#a04030" stroke-width="0.5" stroke-dasharray="3,2" opacity="0.45" />
            {/if}
            <!-- Track-name "temp" rotated 90°; numeric scale labels
                 right-aligned to its right -->
            <text
              transform={`rotate(-90 10 ${tempY + TEMP_H / 2})`}
              x="10" y={tempY + TEMP_H / 2 + 3}
              text-anchor="middle" font-size="10"
              fill="#7a4a10" font-weight="600"
            >temp</text>
            <text x={PAD_L - 3} y={yHi + 8} text-anchor="end" font-size="8" fill="#a04030">104°F</text>
            <text x={PAD_L - 3} y={y80 + 3} text-anchor="end" font-size="8" fill="#a04030">80°F</text>
            <text x={PAD_L - 3} y={y32 + 3} text-anchor="end" font-size="8" fill="#3a6b8b">32°F</text>
            <text x={PAD_L - 3} y={yLo - 1} text-anchor="end" font-size="8" fill="#3a6b8b">−4°F</text>

            <!-- All region species, one thin lane each. Window bands
                 + observation markers if present. -->
            {#each allSids as sid, idx}
              {@const laneY = lanesY + idx * (LANE_H + LANE_GAP)}
              {@const color = laneColor(sid)}
              {@const sw = windowsForSpecies(rt, sid)}
              {@const yObs = obsInYearForSpecies(rt, year, sid)}
              <rect x={PAD_L} y={laneY} width={PLOT_W} height={LANE_H} fill={color} opacity="0.06">
                <title>{speciesLabel(sid)}</title>
              </rect>
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
  .region-meta.weather-loc { font-size: 0.8rem; flex-basis: 100%; margin-top: 0.1rem; }
  .region-meta.weather-loc a { color: #3a5a3a; }
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
