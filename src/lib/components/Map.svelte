<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { readable } from 'svelte/store';
  import { base } from '$app/paths';
  import 'leaflet/dist/leaflet.css';
  import type { PinEffective } from '$lib/services/pinService';
  import { recentRain, formatMm } from '$lib/services/weatherService';
  import { formatElapsed, autoTrackTitle } from '$lib/utils/formatTime';
  import { nearestMetro } from '$lib/utils/metros';
  import { getMetroTotals } from '$lib/services/metroTotalsService';
  import { track } from '$lib/services/uxTracker';
  import {
    recording,
    start as startRec,
    pause as pauseRec,
    resume as resumeRec,
    discard as discardRec
  } from '$lib/stores/recording';

  type ForageCategory = 'fruit' | 'bramble' | 'nut' | 'mushroom' | 'other' | 'unknown';

  /** Optional category resolver, normally computed in +page.svelte from
   *  the species' forage_parts. If omitted, all pins get color 'unknown'. */
  export let categoryOf: (pin: PinEffective) => ForageCategory = () => 'unknown';

  /** Optional fill-color override. When provided, takes precedence over
   *  the category-default color. Used by the parent to color pins by
   *  species group rather than by category. */
  export let colorOf: ((pin: PinEffective) => string) | null = null;

  /** Optional hover-tooltip resolver. Returns plain text shown on mouseover. */
  export let labelOf: (pin: PinEffective) => string = (p) =>
    p.display_name ?? '(unnamed pin)';

  /** When true, the locate button is hidden — used while the pin detail
   *  panel is open so it doesn't collide with the panel's close button. */
  export let hideLocate: boolean = false;

  /** When true, the next click on empty map area fires mapTap (so the
   *  parent can open the drop-pin flow at that coordinate). The map
   *  also gets a crosshair cursor as a visual cue. Used by the desktop
   *  "+ new pin" flow and by the move-pin flow; on mobile the long-press
   *  gesture stays the primary entry point. */
  export let placing: boolean = false;
  /** Customizable hint text shown above the map while in `placing`
   *  mode. Defaults to the new-pin wording. */
  export let placingHint: string = 'Click on the map to place the pin · Esc to cancel';

  /** Currently-selected pin (whose detail panel is open). Drawn with a
   *  highlight ring so the user can see which pin on the map they're
   *  looking at — especially useful when several pins cluster. */
  export let selectedPinId: string | null = null;

  /** Which tile layer to render. Picker lives in the tools menu. */
  type Basemap = 'osm-hot' | 'satellite';
  export let basemap: Basemap = 'osm-hot';
  const BASEMAPS: Record<
    Basemap,
    { url: string; attribution: string; maxZoom: number }
  > = {
    'osm-hot': {
      url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
      attribution: '© OpenStreetMap, Humanitarian OSM Team',
      maxZoom: 19
    },
    // Esri WorldImagery — high-res aerial, crisp tiles up to zoom 19
    // for most populated areas. Imagery is mixed-vintage (some tiles
    // can be winter for any given location), but it supports zoom-in
    // detail for spotting individual trees, which the lower-zoom
    // sources (USGS NAIP, Sentinel-2) cannot.
    satellite: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, USDA, USGS',
      maxZoom: 19
    }
  };
  let tileLayer: import('leaflet').TileLayer | undefined;
  let lastBasemap: Basemap | null = null;
  $: if (map && basemap && basemap !== lastBasemap) applyBasemap(basemap);
  async function applyBasemap(b: Basemap) {
    const L = await import('leaflet');
    if (!map) return;
    lastBasemap = b;
    const cfg = BASEMAPS[b];
    if (tileLayer) tileLayer.remove();
    tileLayer = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: cfg.maxZoom
    }).addTo(map);
  }

  export let pins: PinEffective[] = [];
  export let center: [number, number] = [42.4534, -76.4836]; // Cornell campus default
  export let zoom: number = 14;

  /** Aggregated cluster points (Phase 2 anon view). Rendered as
   *  count-labeled circles. When a cluster is clicked the map zooms
   *  in by 2 levels onto the centroid — repeat clicks drill down to
   *  individual pins. Type lives in pinService; redeclared minimally
   *  here so the prop typechecks without circular import shape. */
  type ClusterPoint = {
    cluster_id: number | null;
    count_pins: number;
    centroid_lng: number;
    centroid_lat: number;
    representative_species_id: string | null;
  };
  export let clusters: ClusterPoint[] = [];


  /** Foraging heatmap points: flat [lat, lng] pairs from the user's
   *  uploaded tracks. Rendered as a leaflet.heat density layer when
   *  non-empty. Computed in +page.svelte and gated by
   *  $settings.showHeatmap. */
  export let heatPoints: Array<[number, number]> = [];

  /** Pre-aggregated density buckets from the public-layer
   *  pin_density_grid. Each bucket is a cell-center coordinate +
   *  exact count for the cell. Rendered with opacity proportional
   *  to log(count_pins) so dense areas appear darker — a real
   *  heatmap from pre-computed data, not a per-viewport fetch. */
  type DensityBucket = {
    count_pins: number;
    centroid_lng: number;
    centroid_lat: number;
    cell_eps: number;
  };
  export let pinDensityBuckets: DensityBucket[] = [];

  /** Show the live track-recorder controls + path overlay. Parent
   *  passes true for signed-in viewers; signed-out viewers don't
   *  have a place to save tracks to. */
  export let showRecorder: boolean = false;

  /** Saved-track polylines the user has chosen to keep visible on
   *  the map. Each entry is rendered as a colored line; color is
   *  derived from `startedAt` so the user can see at a glance
   *  which tracks are recent (red) vs old (dark blue). */
  export let displayedTracks: Array<{
    id: string;
    points: Array<[number, number]>;
    startedAt?: string | null;
  }> = [];

  /** When true, tracks render with the red→blue recency gradient.
   *  When false, all tracks render solid red — useful when comparing
   *  two routes' shapes and the gradient steals attention from
   *  the lines themselves. Toggled from the /tracks page. */
  export let colorTracksByDate: boolean = true;
  /** When true, fetch and render the USDA Plant Hardiness Zones
   *  overlay (one-time fetch from /usda-zones.geojson, ~2 MB on the
   *  wire / ~600 KB gzipped). Lazy-loaded — toggle off keeps the
   *  initial map paint unaffected. */
  export let showZones: boolean = false;
  /** Show the soft glow around pins whose species is currently
   *  edible. Defaults true; toggled from the Layers panel. */
  export let showEdibleRings: boolean = true;

  /** Show the past-7-day rainfall chip. Off-by-default would feel
   *  too hidden for a useful signal, so default true; user can flip
   *  off in Layers when they want more map space. */
  export let showRainfall: boolean = true;

  /** Set of species_ids that have any invasive flag (community-flagged
   *  as undesirable). Pins of these species render with a warning-red
   *  stroke. Empty set = no invasive treatment. */
  export let invasiveSpeciesIds: Set<string> = new Set();
  /** Set of species_ids that are NOT forageable (inedible invasives —
   *  tree of heaven, Norway maple, English ivy, etc.). Pins of these
   *  species get an extra-muted fill so they read as "do not eat,
   *  remove" rather than "harvest me." Always a subset of
   *  invasiveSpeciesIds (catalog discipline: only flagged invasives
   *  get forageable=false). */
  export let nonForagableSpeciesIds: Set<string> = new Set();

  /** Setting this prop animates the map to the given location. Parent
   *  passes a fresh object on each desired fly (e.g. after a geocode
   *  result is picked); we never null it back out — Svelte fires the
   *  reactive block on each new reference. */
  export let flyTo: { lng: number; lat: number; zoom?: number } | null = null;
  let lastFlyTo: typeof flyTo = null;
  $: if (map && flyTo && flyTo !== lastFlyTo) {
    lastFlyTo = flyTo;
    map.flyTo([flyTo.lat, flyTo.lng], flyTo.zoom ?? 14, { duration: 0.9 });
  }

  const dispatch = createEventDispatcher<{
    pinClick: { pinId: string };
    mapTap: { lng: number; lat: number };
    /** Fired (debounced ~300ms) after the user finishes panning or
     *  zooming. The parent uses this to refetch the public-pin
     *  layer for the new viewport. bbox is [west, south, east, north]. */
    viewportChange: { bbox: [number, number, number, number]; zoom: number };
    /** Fired when the user hits Save in the recorder overlay. The
     *  parent supplies region context + persists via the same
     *  importParsedTrack pipeline as file uploads. */
    recordSave: { title: string };
    /** Fired when the user taps the placement-hint banner, asking to
     *  cancel the current placing/moving flow. Parent handles by
     *  clearing placingPin + movingPinId. */
    cancelPlacing: null;
  }>();

  let mapEl: HTMLDivElement;
  let map: import('leaflet').Map | undefined;
  let markerLayer: import('leaflet').LayerGroup | undefined;
  /** Per-pin entries inside markerLayer. Lets renderPins diff
   *  against the previous render: pins whose signature is unchanged
   *  just have their latlng updated (cheap), pins whose signature
   *  is new get rebuilt, and pins that have left the visible set
   *  get removed. Avoids the clearLayers + rebuild-everything
   *  storm on every click that the audit flagged. */
  type PinEntry = {
    group: import('leaflet').LayerGroup;
    signature: string;
    lat: number;
    lng: number;
    pinId: string;
  };
  const pinEntries = new Map<string, PinEntry>();
  /** Selection ring lives in its own layer so flipping the selected
   *  pin doesn't touch any of the regular pin entries. */
  let selectionLayer: import('leaflet').LayerGroup | undefined;
  let lastSelectedId: string | null = null;
  let clusterLayer: import('leaflet').LayerGroup | undefined;
  let userMarker: import('leaflet').LayerGroup | undefined;
  /** Polyline drawn from the live recorder's buffered points so the
   *  user can watch their track grow as they walk. Recreated only
   *  when the polyline doesn't exist yet; subsequent updates set
   *  latlngs in place to avoid layer churn. */
  let recordPolyline: import('leaflet').Polyline | undefined;
  /** Heat layer — built from the user's track points as overlapping
   *  low-opacity circle markers. preferCanvas:true on the map means
   *  this renders to a single canvas, so even ~10k circles stay
   *  performant; we down-sample if the input is much bigger. */
  let heatGroup: import('leaflet').LayerGroup | undefined;
  /** Per-track polylines drawn on top of the basemap so the user can
   *  see entire saved tracks as colored lines (separate from the
   *  in-progress recording polyline above and from the density
   *  heatmap below). One Polyline layer per track id. */
  const trackLayers = new Map<string, import('leaflet').Polyline>();
  /** Cached leaflet module — set once in onMount so renderPins can
   *  run fully synchronously. Without this, every render had to
   *  re-resolve `import('leaflet')` (cached but still microtask-async),
   *  which left a brief frame where clearLayers had already wiped
   *  markers but the new ones hadn't yet been added — visible as a
   *  blink during startup when pins arrived in multiple ticks. */
  let LCache: typeof import('leaflet') | undefined;

  // Surface geolocation state so the user sees what's happening when they
  // tap the locate button — silent failures were a recurring source of
  // "the button does nothing" reports.
  let locating = false;
  let locationError = '';
  /** Live current map zoom (rounded). Bound to the small zoom chip
   *  in the corner. Updated on every zoomend so the indicator
   *  tracks the actual zoom rather than the initial prop. */
  let currentZoom: number | null = null;
  /** Build-time-injected git short SHA. Pulled into a local const
   *  so svelte-check can resolve the global declared in app.d.ts. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // __BUILD_REV__ is a vite-define macro replaced at build time. Use
  // the bare identifier (not a property access on globalThis) so the
  // replacement actually happens; previously we read via globalThis
  // and always got "dev". See vite.config.ts.
  const buildRev: string =
    typeof __BUILD_REV__ !== 'undefined' ? __BUILD_REV__ : 'dev';

  // Persistent rain chip in the corner of the map: shows the past
  // 7 days of rainfall at the map's current center. Rain is broadly
  // useful for foragers — anyone deciding whether to head out. The
  // weatherService cache is keyed at ~11km granularity so panning
  // around the same area is essentially free. Updates after every
  // moveend (300ms debounced via the existing viewport timer).
  let rainTotalMm: number | null = null;
  let rainAt: { lng: number; lat: number } | null = null;
  async function refreshMapRain(lng: number, lat: number) {
    // Skip if we already have rain for the same ~11km cell.
    if (
      rainAt &&
      Math.abs(rainAt.lng - lng) < 0.05 &&
      Math.abs(rainAt.lat - lat) < 0.05 &&
      rainTotalMm !== null
    ) return;
    try {
      const r = await recentRain(lng, lat, 7);
      rainTotalMm = r.total_mm;
      rainAt = { lng, lat };
    } catch {
      // Network blip — leave the chip showing the previous value.
    }
  }

  // Coarse pointer (touch device) gets larger hit target.
  const isTouch =
    typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  // Reactive update of markers when `pins`, the selected pin, or the
  // color resolver changes. LCache must be set (we cache the
  // dynamically-imported leaflet module on mount so renderPins can
  // run fully synchronously and avoid the clear-then-add flash).
  // colorOf is passed explicitly into renderPins so the Svelte
  // compiler tracks it as a real reactive dependency — a `void colorOf`
  // hint inside the block was fragile across Svelte versions.
  $: if (map && markerLayer && LCache) {
    // Track invasive sets explicitly so toggling a flag in the
    // pin-detail panel re-renders the marker stroke + fill
    // immediately.
    void invasiveSpeciesIds;
    void nonForagableSpeciesIds;
    renderPins(pins, selectedPinId, colorOf, categoryOf);
  }
  // Cluster numbered-dot rendering re-wired in migration 58 +
  // commit 090b721: at zoom 13-15 the parent sends per-cell cluster
  // points (count + centroid + representative species), and we
  // render them as count-bubbles (multi-pin) or small dots
  // (single-pin). Reactive on the clusters prop so updates from
  // a viewport change actually paint.
  $: if (map && clusterLayer && LCache) {
    renderClusters(clusters);
  }
  let pinHeatGroup: import('leaflet').LayerGroup | undefined;
  /** Per-metro pin totals, lazily fetched on first heatmap render and
   *  cached 24h. Used in cell tooltips so each cell within a metro
   *  shows the metro-wide total rather than just that cell's count. */
  let metroTotals: Record<string, number> = {};
  $: if (map && LCache) renderPinHeat(pinDensityBuckets);

  // USDA hardiness zone overlay. Polygon GeoJSON cached after first
  // fetch; toggle on/off just adds/removes the layer.
  let zonesLayer: import('leaflet').GeoJSON | undefined;
  let zonesGeoJsonCache: GeoJSON.FeatureCollection | null = null;
  $: if (map && LCache) renderZones(showZones);
  // Density visualization via overlapping low-opacity circles. Not
  // a true Gaussian heatmap (we ditched the leaflet.heat plugin
  // for ESM compatibility) but visually similar — many overlapping
  // points → darker patch.
  $: if (map && LCache) renderHeat(heatPoints);
  // Saved-track polylines.
  $: if (map && LCache) renderTrackLayers(displayedTracks);

  /** Min/max started_at across the *currently displayed* tracks, in
   *  ms epoch. Drives the recency-gradient color scale and the
   *  legend swatch. Updated by renderTrackLayers; reactive bindings
   *  in the template read these directly. */
  let trackTimeMin: number | null = null;
  let trackTimeMax: number | null = null;
  let trackTimeCount = 0;

  /** Color a track by recency: newest = red (hue 0°), oldest = dark
   *  blue (hue 240°). Using a relative scale across the visible set
   *  keeps the gradient legible regardless of how the user filters.
   *  Tracks with no started_at fall back to a neutral brown so they
   *  don't claim a position on the gradient. */
  function colorForRecency(
    startedAt: string | null | undefined,
    minMs: number | null,
    maxMs: number | null
  ): string {
    if (!startedAt) return '#7a4a10';
    const ts = Date.parse(startedAt);
    if (!Number.isFinite(ts) || minMs == null || maxMs == null) return '#7a4a10';
    if (maxMs === minMs) return 'hsl(0, 75%, 48%)'; // single track or all same date → red
    // Newest at the top of the range (t=0, red); oldest at the
    // bottom (t=1, blue). Slight darkening at the older end gives
    // a sense of fade.
    const t = Math.max(0, Math.min(1, (maxMs - ts) / (maxMs - minMs)));
    const hue = t * 240;
    const lightness = 50 - t * 12;
    return `hsl(${hue.toFixed(0)}, 75%, ${lightness.toFixed(0)}%)`;
  }

  function renderTrackLayers(tracks: Array<{ id: string; points: Array<[number, number]>; startedAt?: string | null }>) {
    if (!map || !LCache) return;
    const L = LCache;
    const wantedIds = new Set(tracks.map((t) => t.id));
    for (const [id, layer] of trackLayers) {
      if (!wantedIds.has(id)) {
        layer.remove();
        trackLayers.delete(id);
      }
    }
    // Compute the current time range so colors are relative to
    // the displayed set. min/max are stored on the component so
    // the legend swatch can mirror them.
    let lo: number | null = null;
    let hi: number | null = null;
    let n = 0;
    for (const t of tracks) {
      if (!t.startedAt) continue;
      const ms = Date.parse(t.startedAt);
      if (!Number.isFinite(ms)) continue;
      n++;
      if (lo == null || ms < lo) lo = ms;
      if (hi == null || ms > hi) hi = ms;
    }
    trackTimeMin = lo;
    trackTimeMax = hi;
    trackTimeCount = n;

    for (const t of tracks) {
      if (t.points.length < 2) continue;
      const color = colorTracksByDate
        ? colorForRecency(t.startedAt, lo, hi)
        : '#c14a3a';
      const existing = trackLayers.get(t.id);
      if (existing) {
        existing.setLatLngs(t.points);
        // Always re-apply the color: the relative gradient shifts
        // whenever a track is added, removed, or its filter window
        // changes, so a previously-orange track might need to
        // become red because the older one was hidden.
        existing.setStyle({ color });
      } else {
        const poly = L.polyline(t.points, {
          color,
          weight: 3,
          opacity: 0.85,
          lineJoin: 'round',
          lineCap: 'round',
          interactive: false
        }).addTo(map);
        trackLayers.set(t.id, poly);
      }
    }
  }

  /** Friendly relative-time label for the legend endpoints, e.g.
   *  "today", "3 days ago", "2 mo ago", "1 yr ago". Avoids dragging
   *  in a date library for two strings. */
  function relTime(ms: number | null): string {
    if (ms == null) return '';
    const diff = Date.now() - ms;
    if (diff < 0) return 'today';
    const day = 86_400_000;
    const days = diff / day;
    if (days < 1) return 'today';
    if (days < 2) return 'yesterday';
    if (days < 14) return `${Math.round(days)} days ago`;
    if (days < 60) return `${Math.round(days / 7)} wk ago`;
    if (days < 365) return `${Math.round(days / 30)} mo ago`;
    return `${(days / 365).toFixed(days < 730 ? 1 : 0)} yr ago`;
  }
  $: trackLegendNewest = relTime(trackTimeMax);
  $: trackLegendOldest = relTime(trackTimeMin);
  $: showTrackLegend = colorTracksByDate && trackTimeCount >= 2;
  /** When all visible tracks are from the same day the gradient
   *  collapses (newest === oldest), and the legend would read
   *  'today · gradient · today' which is meaningless. Detect and
   *  render a single label in that case. */
  $: singleDateLegend =
    trackLegendNewest === trackLegendOldest;

  function renderHeat(points: Array<[number, number]>) {
    if (!map || !LCache) return;
    if (heatGroup) {
      heatGroup.remove();
      heatGroup = undefined;
    }
    if (points.length === 0) return;
    // Down-sample if the dataset is large enough to choke the
    // canvas renderer on lower-end devices.
    const MAX_RENDER = 8000;
    const step = points.length > MAX_RENDER ? Math.ceil(points.length / MAX_RENDER) : 1;
    const L = LCache;
    const group = L.layerGroup();
    for (let i = 0; i < points.length; i += step) {
      const [lat, lng] = points[i];
      L.circleMarker([lat, lng], {
        radius: 9,
        stroke: false,
        fillColor: '#1a4a66',
        fillOpacity: 0.18,
        interactive: false
      }).addTo(group);
    }
    heatGroup = group;
    group.addTo(map);
  }

  // Live track polyline: redraw on every store update.
  $: if (map && LCache) updateRecordedPath($recording.points);

  function updateRecordedPath(points: Array<{ lat: number; lng: number }>) {
    if (!map || !LCache) return;
    const L = LCache;
    const latlngs = points.map((p) => [p.lat, p.lng] as [number, number]);
    if (latlngs.length === 0) {
      if (recordPolyline) {
        recordPolyline.remove();
        recordPolyline = undefined;
      }
      return;
    }
    if (recordPolyline) {
      recordPolyline.setLatLngs(latlngs);
    } else {
      recordPolyline = L.polyline(latlngs, {
        color: '#c14a3a',
        weight: 4,
        opacity: 0.85,
        lineJoin: 'round',
        lineCap: 'round',
        interactive: false
      }).addTo(map);
    }
  }

  // Recorder overlay state — local to the controls UI.
  let recSaving = false;
  let recError = '';
  /** Elapsed-time label, recomputed by a top-level $: reactive
   *  whenever either the recording state or the wall-clock store
   *  changes. The earlier @const-inside-template approach didn't
   *  reliably re-evaluate when only $now changed — Svelte 4's
   *  reactivity for @const is tied to the surrounding block's
   *  invalidation, which doesn't always fire from a deep store
   *  subscription. A script-level reactive guarantees it. */
  let elapsedLabel = '0:00';
  $: {
    // While recording: tick from the wall clock for smooth seconds.
    // While paused/stopped: freeze at endedAt. The previous formula
    // used `endedAt ?? $now` unconditionally, so during recording
    // the timer froze between GPS fixes and jumped forward when one
    // arrived — visually broken even though elapsed time was right.
    if (!$recording.startedAt) {
      elapsedLabel = '0:00';
    } else {
      const endTs = $recording.status === 'recording'
        ? $now
        : ($recording.endedAt ?? $recording.startedAt);
      elapsedLabel = formatElapsed(endTs - $recording.startedAt);
    }
  }
  /** Wall-clock store, gated on recording state — only ticks while
   *  a recording is active. Earlier version ran a permanent 250ms
   *  setInterval whether or not anyone needed it; auditors flagged
   *  this as a constant background cost on every page load.
   *
   *  When recording starts: subscribe → start interval. When it
   *  stops: unsubscribe → clear interval. Visibility-snap kept so
   *  the counter doesn't stale after the user backgrounds the tab. */
  const now = readable(Date.now(), (set) => {
    let id: ReturnType<typeof setInterval> | null = null;
    let visListener: (() => void) | null = null;
    const unsubFromRecording = recording.subscribe((rec) => {
      const active = rec.status !== 'idle';
      if (active && id == null) {
        id = setInterval(() => set(Date.now()), 250);
        visListener = () => {
          if (typeof document !== 'undefined' && !document.hidden) set(Date.now());
        };
        if (typeof document !== 'undefined') {
          document.addEventListener('visibilitychange', visListener);
        }
        set(Date.now());
      } else if (!active && id != null) {
        clearInterval(id);
        id = null;
        if (visListener && typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', visListener);
          visListener = null;
        }
      }
    });
    return () => {
      unsubFromRecording();
      if (id != null) clearInterval(id);
      if (visListener && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', visListener);
      }
    };
  });
  function clickStop() {
    if ($recording.points.length < 2) {
      // No usable trip — just discard silently.
      discardRec();
      return;
    }
    recError = '';
    recSaving = true;
    dispatch('recordSave', { title: autoTrackTitle($recording.startedAt) });
  }
  /** Called by the parent after a successful save so the recorder
   *  resets cleanly. */
  export function clearRecorder(): void {
    recError = '';
    recSaving = false;
    discardRec();
  }

  /** Place / replace the user-location marker at (lat, lng).
   *  Shared between locate-me (one-shot) and the recording-track
   *  reactive (continuous, follows the user as they walk).
   *  accuracyM optional — only drawn as a halo if usable. */
  function placeUserMarker(
    latitude: number,
    longitude: number,
    accuracyM: number | null
  ): void {
    if (!map || !LCache) return;
    const L = LCache;
    if (userMarker) userMarker.remove();
    const svgRenderer = L.svg({ pane: 'user-location' });
    const group = L.layerGroup();
    if (accuracyM != null && Number.isFinite(accuracyM) && accuracyM > 0 && accuracyM < 1000) {
      L.circle([latitude, longitude], {
        radius: accuracyM,
        color: '#3a8df0',
        fillColor: '#3a8df0',
        fillOpacity: 0.12,
        weight: 1,
        opacity: 0.5,
        interactive: false,
        pane: 'user-location',
        renderer: svgRenderer
      }).addTo(group);
    }
    L.circleMarker([latitude, longitude], {
      radius: 11,
      color: '#ffffff',
      fillColor: '#ffffff',
      fillOpacity: 1,
      weight: 0,
      interactive: false,
      pane: 'user-location',
      renderer: svgRenderer
    }).addTo(group);
    L.circleMarker([latitude, longitude], {
      radius: 7,
      color: '#1a64d6',
      fillColor: '#1f7af5',
      fillOpacity: 1,
      weight: 1.5,
      interactive: false,
      pane: 'user-location',
      renderer: svgRenderer
    }).addTo(group);
    group.addTo(map);
    userMarker = group;
  }

  // While a recording is active, keep the user-location marker
  // pinned to the latest GPS point streamed into the recording
  // store. Otherwise the dot stays at wherever the locate-me button
  // last fired and the user appears 'stuck' as they walk.
  $: if ($recording.status === 'recording' && $recording.points.length > 0) {
    const last = $recording.points[$recording.points.length - 1];
    placeUserMarker(last.lat, last.lng, last.accuracy_m ?? null);
  }

  async function locateMe() {
    if (!map) return;
    track('locate_me_clicked');
    if (!navigator.geolocation) {
      locationError = 'This browser does not support geolocation.';
      track('locate_me_unsupported');
      return;
    }
    locating = true;
    locationError = '';
    const t0 = Date.now();
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        locating = false;
        if (!map) return;
        const { latitude, longitude } = pos.coords;
        // Preserve the user's current zoom if they were already
        // zoomed in (≥13). Earlier code force-set zoom to 15 every
        // time, which yanked users out of street-level views back
        // to ~neighborhood. Now: pan only if already at street
        // level; zoom in to 15 only if currently zoomed out.
        const curZoom = map.getZoom();
        const targetZoom = curZoom >= 13 ? curZoom : 15;
        map.setView([latitude, longitude], targetZoom);
        placeUserMarker(latitude, longitude, pos.coords.accuracy ?? null);
        track('locate_me_success', {
          latency_ms: Date.now() - t0,
          accuracy_m: pos.coords.accuracy != null ? Math.round(pos.coords.accuracy) : null,
          // Position-age compared to call: 0 means fresh; non-zero means
          // browser served a cached fix (we ask for maximumAge=0 but
          // some browsers serve cache anyway).
          age_ms: Math.max(0, Date.now() - pos.timestamp)
        });
      },
      (err) => {
        locating = false;
        // PERMISSION_DENIED=1, POSITION_UNAVAILABLE=2, TIMEOUT=3
        const reason =
          err.code === 1 ? 'Location permission was denied — check the lock icon ↑ in the address bar.'
          : err.code === 2 ? 'Could not determine location.'
          : err.code === 3 ? 'Location request timed out.'
          : err.message || 'Could not get location.';
        locationError = reason;
        console.warn('[Map] geolocation failed:', err.code, err.message);
        track('locate_me_failed', { code: err.code, latency_ms: Date.now() - t0 });
        // Auto-clear the error after a few seconds so it doesn't linger.
        setTimeout(() => {
          if (locationError === reason) locationError = '';
        }, 6000);
      },
      // maximumAge: 0 forbids the browser from returning a cached
      // fix — without it, mobile browsers commonly serve a position
      // from minutes ago, so the user-dot doesn't move when they
      // tap locate-me after walking. timeout: 15s gives slow GPS
      // hardware time to actually deliver a fresh fix.
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  /** Diff-based renderer. Pins whose visual signature didn't change
   *  keep their existing Leaflet layers (we just setLatLng if they
   *  moved). New pins build a fresh layer group; gone pins are
   *  removed. The selection ring is handled by renderSelection so
   *  toggling the open pin doesn't touch any of the regular markers.
   *
   *  Earlier version did markerLayer.clearLayers() + rebuild-all on
   *  every reactive run, which the audit flagged as a major source
   *  of map churn on every click and species-toggle. */
  /** Above this pin count we drop the per-category divIcon (DOM-rendered
   *  SVG) and use a plain canvas circleMarker for each pin. Lose the
   *  shape distinction, keep color + click target. At dense zoom the
   *  shapes are tiny visual noise anyway, and the DOM cost was the
   *  dominant render-time spike. ~3x faster paint at z14+ over Hamilton-
   *  density viewports. */
  const DENSE_PIN_THRESHOLD = 500;

  function renderPins(
    currentPins: PinEffective[],
    selectedId: string | null,
    colorResolver: ((pin: PinEffective) => string) | null,
    catResolver: (pin: PinEffective) => ForageCategory
  ) {
    if (!markerLayer || !map || !LCache) return;
    const dense = currentPins.length > DENSE_PIN_THRESHOLD;
    const wanted = new Set<string>();
    for (const pin of currentPins) {
      if (!pin.id || pin.lat == null || pin.lng == null) continue;
      wanted.add(pin.id);
      const cat = catResolver(pin);
      const fill = colorResolver ? colorResolver(pin) : colorFor(pin);
      const sig = pinSignature(pin, fill, cat, dense);
      const existing = pinEntries.get(pin.id);
      if (existing && existing.signature === sig) {
        if (existing.lat !== pin.lat || existing.lng !== pin.lng) {
          existing.group.eachLayer((layer) => {
            const setter = layer as { setLatLng?: (ll: [number, number]) => void };
            if (setter.setLatLng) setter.setLatLng([pin.lat as number, pin.lng as number]);
          });
          existing.lat = pin.lat;
          existing.lng = pin.lng;
        }
      } else {
        if (existing) existing.group.remove();
        const group = buildPinLayerGroup(pin, cat, fill, dense);
        if (!group) continue;
        group.addTo(markerLayer);
        pinEntries.set(pin.id, {
          group,
          signature: sig,
          lat: pin.lat,
          lng: pin.lng,
          pinId: pin.id
        });
      }
    }
    // Drop pins no longer in the visible set.
    for (const [id, entry] of pinEntries) {
      if (!wanted.has(id)) {
        entry.group.remove();
        pinEntries.delete(id);
      }
    }
    renderSelection(selectedId);
  }

  /** Stable string fingerprint of every visual attribute that
   *  influences how a pin is drawn. Position is checked separately
   *  so a moved-but-otherwise-identical pin reuses its layers.
   *  `dense` is included so that crossing the DENSE_PIN_THRESHOLD
   *  forces all pins to rebuild in the new representation. */
  function pinSignature(pin: PinEffective, fill: string, cat: ForageCategory, dense: boolean): string {
    return [
      dense ? 'D' : 'S',
      cat,
      fill,
      pin.is_edible_strict ? 1 : 0,
      pin.is_edible_now ? 1 : 0,
      showEdibleRings ? 1 : 0,
      pin.effective_status ?? '',
      pin.is_inaccessible ? 1 : 0,
      pin.species_id && invasiveSpeciesIds.has(pin.species_id) ? 1 : 0,
      pin.species_id && nonForagableSpeciesIds.has(pin.species_id) ? 1 : 0,
      labelOf(pin)
    ].join('|');
  }

  /** Build the fresh per-pin layer group. Two modes:
   *  - sparse (≤ DENSE_PIN_THRESHOLD): ripeness rings, divIcon shape, hit target.
   *  - dense (> DENSE_PIN_THRESHOLD): single canvas circleMarker for the
   *    visible mark + click handler. No divIcon (DOM-rendered, expensive
   *    at scale), no per-category shape, no tooltip on hover. */
  function buildPinLayerGroup(
    pin: PinEffective,
    cat: ForageCategory,
    fill: string,
    dense: boolean
  ): import('leaflet').LayerGroup | null {
    if (!LCache || pin.lat == null || pin.lng == null || !pin.id) return null;
    const L = LCache;
    const lat = pin.lat;
    const lng = pin.lng;
    const isStrictRipe = pin.is_edible_strict === true;
    const isPossibly = pin.is_edible_now === true;
    const muted = pin.effective_status === 'gone' || pin.effective_status === 'dormant';
    const inaccessible = pin.is_inaccessible === true;
    const inedibleInvasive = pin.species_id ? nonForagableSpeciesIds.has(pin.species_id) : false;
    // Inedible invasives get a muted fill so they read as "remove"
    // rather than "harvest." Only applies when the pin isn't already
    // muted by status (gone/dormant) or inaccessibility, since those
    // are stronger signals.
    const fillOpacity = inaccessible ? 0.2 : muted ? 0.45 : inedibleInvasive ? 0.5 : 0.9;
    const baseR = isTouch ? 6 : 4.5;
    const group = L.layerGroup();
    const pinId = pin.id;

    if (dense) {
      // Single canvas circle: visible mark + click target combined.
      // Ripeness rings and per-category shape are skipped — at this
      // density they're either invisible noise or a perf hit we can't
      // afford. Hover tooltip IS bound because tooltip rendering is
      // on-demand (Leaflet only mounts one tooltip at a time), so it
      // doesn't scale with pin count. Inedible invasives get a thin
      // red ring so they're still visually flagged.
      const fillVisible = fillOpacity > 0.02 ? fill : 'transparent';
      const stroke = inedibleInvasive ? '#c84545' : '#1f2a1f';
      const strokeW = inedibleInvasive ? 1.0 : 0.5;
      const r = isTouch ? baseR + 1 : baseR;
      const dot = L.circleMarker([lat, lng], {
        radius: r,
        color: stroke,
        weight: strokeW,
        fillColor: fillVisible,
        fillOpacity,
        bubblingMouseEvents: false
      });
      dot.on('click', () => dispatch('pinClick', { pinId }));
      const label = labelOf(pin);
      if (label) {
        dot.bindTooltip(label, { direction: 'top', offset: [0, -2], sticky: true });
      }
      dot.addTo(group);
      return group;
    }

    if (showEdibleRings) {
      if (isStrictRipe) {
        // Soft warm-glow stack: a low-opacity wide aura behind the
        // pin, then a tighter brighter ring closer in. Reads as a
        // "this is glowing / fruiting now" cue without the busy
        // double-circle treatment of the prior version.
        L.circleMarker([lat, lng], {
          radius: baseR + 11, color: '#f5b042', fill: true, fillColor: '#fff1c4',
          weight: 0, fillOpacity: 0.32, interactive: false
        }).addTo(group);
        L.circleMarker([lat, lng], {
          radius: baseR + 5, color: '#e08a1a', fill: false,
          weight: 1.6, opacity: 0.85, interactive: false
        }).addTo(group);
      } else if (isPossibly) {
        // "Possibly edible" gets a softer single aura — fainter and
        // smaller than the strict-ripe glow, no ring stroke.
        L.circleMarker([lat, lng], {
          radius: baseR + 8, color: '#fcd58a', fill: true, fillColor: '#fff7e0',
          weight: 0, fillOpacity: 0.30, interactive: false
        }).addTo(group);
      }
    }

    const px = baseR * 2;
    const fillVisible = fillOpacity > 0.02 ? fill : 'transparent';
    const opacityCss = fillOpacity.toFixed(2);
    const isInvasive = pin.species_id ? invasiveSpeciesIds.has(pin.species_id) : false;
    // Reuse the inedibleInvasive computed earlier (it drove the muted
    // fillOpacity). Same Set, same lookup; pass through to shapeHtml
    // so the SVG draws a red ✗ over the category shape.
    const html = shapeHtml(cat, fillVisible, opacityCss, px, false, isInvasive, inedibleInvasive);
    L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'forager-shape',
        html,
        iconSize: [px + 4, px + 4],
        iconAnchor: [(px + 4) / 2, (px + 4) / 2]
      }),
      keyboard: false,
      interactive: false
    }).addTo(group);

    const hitR = isTouch ? baseR + 8 : baseR + 3;
    const hit = L.circleMarker([lat, lng], {
      radius: hitR,
      color: 'transparent',
      fillColor: '#000',
      fillOpacity: 0,
      opacity: 0,
      weight: 0,
      bubblingMouseEvents: false
    });
    hit.on('click', () => dispatch('pinClick', { pinId }));
    const label = labelOf(pin);
    if (label) {
      hit.bindTooltip(label, { direction: 'top', offset: [0, -2], sticky: true });
    }
    hit.addTo(group);
    return group;
  }

  /** Selected-pin highlight: two concentric rings drawn into a
   *  separate selection layer. Toggling selection only touches
   *  this layer — the regular pin entries don't churn. */
  function renderSelection(selectedId: string | null) {
    if (!map || !LCache) return;
    const L = LCache;
    if (selectedId === lastSelectedId) return;
    if (selectionLayer) {
      selectionLayer.clearLayers();
    } else {
      selectionLayer = L.layerGroup().addTo(map);
    }
    lastSelectedId = selectedId;
    if (!selectedId) return;
    const entry = pinEntries.get(selectedId);
    if (!entry) return;
    const baseR = isTouch ? 6 : 4.5;
    L.circleMarker([entry.lat, entry.lng], {
      radius: baseR + 13,
      color: '#1f6fe0',
      fill: false,
      weight: 1.5,
      opacity: 0.35,
      interactive: false
    }).addTo(selectionLayer);
    L.circleMarker([entry.lat, entry.lng], {
      radius: baseR + 7,
      color: '#1f6fe0',
      fill: false,
      weight: 2.5,
      opacity: 1,
      interactive: false
    }).addTo(selectionLayer);
  }

  /** Real heatmap: each density-grid cell renders as a filled
   *  rectangle covering its full geographic extent, color-graded
   *  on a yellow→orange→red scale by log(count_pins). Adjacent
   *  cells touch but never overlap; the visual is a continuous
   *  color mosaic, not overlapping dots. */
  function renderPinHeat(buckets: DensityBucket[]) {
    if (!map || !LCache) return;
    if (pinHeatGroup) {
      pinHeatGroup.remove();
      pinHeatGroup = undefined;
    }
    if (buckets.length === 0) return;
    // Fire-and-forget: first call populates metroTotals from the global
    // band-1 grid (cached 24h). Subsequent calls return immediately
    // from cache. Triggers a single re-render once it resolves.
    if (Object.keys(metroTotals).length === 0) {
      void getMetroTotals().then((t) => {
        metroTotals = t;
        if (map && LCache) renderPinHeat(pinDensityBuckets);
      });
    }
    const L = LCache;
    const group = L.layerGroup();
    for (const b of buckets) {
      const halfEps = b.cell_eps / 2;
      const bounds: [[number, number], [number, number]] = [
        [b.centroid_lat - halfEps, b.centroid_lng - halfEps],
        [b.centroid_lat + halfEps, b.centroid_lng + halfEps]
      ];
      const metro = nearestMetro(b.centroid_lat, b.centroid_lng);
      const tooltip = metro
        ? `${metro.name} · ${(metroTotals[metro.name] ?? b.count_pins).toLocaleString()} pins`
        : `${b.count_pins.toLocaleString()} pin${b.count_pins === 1 ? '' : 's'}`;
      L.rectangle(bounds, {
        fillColor: heatColor(b.count_pins),
        fillOpacity: 0.78,
        stroke: false,
        interactive: true
      })
        .bindTooltip(tooltip, { sticky: true, direction: 'top', opacity: 0.92 })
        .addTo(group);
    }
    pinHeatGroup = group;
    group.addTo(map);
  }

  /** USDA hardiness zone polygons rendered as a translucent overlay.
   *  Lazy-loaded: GeoJSON is fetched only when showZones flips on
   *  for the first time (cached in zonesGeoJsonCache afterward).
   *  Color ramp goes blue (cold zones, 3a) → green (mid, 6a) → red
   *  (warm, 11a) so the visual matches what users intuit about the
   *  map. Low fillOpacity keeps the basemap readable underneath. */
  async function renderZones(visible: boolean) {
    if (!map || !LCache) return;
    if (!visible) {
      if (zonesLayer) {
        map.removeLayer(zonesLayer);
        zonesLayer = undefined;
      }
      return;
    }
    if (zonesLayer) return; // already rendered
    if (!zonesGeoJsonCache) {
      try {
        // Fetch USDA (CONUS) + NRCan (Canada) in parallel and combine
        // into a single FeatureCollection. Properties are normalized
        // (both files use {zone, source}) so the same style/tooltip
        // logic handles either origin.
        const [usaRes, canRes] = await Promise.all([
          fetch(`${base}/usda-zones.geojson`),
          fetch(`${base}/canada-zones.geojson`)
        ]);
        const features: GeoJSON.Feature[] = [];
        if (usaRes.ok) {
          const usa = await usaRes.json();
          for (const f of usa.features ?? []) {
            f.properties = { ...(f.properties ?? {}), source: f.properties?.source ?? 'USDA-2023' };
            features.push(f);
          }
        }
        if (canRes.ok) {
          const can = await canRes.json();
          for (const f of can.features ?? []) features.push(f);
        }
        zonesGeoJsonCache = { type: 'FeatureCollection', features } as GeoJSON.FeatureCollection;
      } catch (err) {
        console.error('[Map] failed to load hardiness zones', err);
        return;
      }
    }
    if (!zonesGeoJsonCache) return;
    zonesLayer = LCache.geoJSON(zonesGeoJsonCache, {
      style: (f) => {
        const code = (f?.properties as { zone?: string } | null)?.zone ?? '';
        return {
          fillColor: zoneColor(code),
          fillOpacity: 0.25,
          color: zoneColor(code),
          opacity: 0.5,
          weight: 0.6
        };
      },
      onEachFeature: (f, layer) => {
        const props = f.properties as { zone?: string; source?: string } | null;
        const code = props?.zone ?? '?';
        const src = props?.source === 'NRCan-2024' ? 'NRCan' : 'USDA';
        layer.bindTooltip(`${src} Zone ${code}`, { sticky: true });
      }
    }).addTo(map);
  }

  /** Map zone code (e.g. '5b', '7a') to a perceptually-graded color.
   *  Numeric part [3..11] mapped to hue 240° (blue) → 0° (red). */
  function zoneColor(code: string): string {
    const n = parseInt(code, 10);
    if (!Number.isFinite(n)) return '#888';
    const t = Math.max(0, Math.min(1, (n - 3) / (11 - 3)));
    const hue = 240 * (1 - t); // blue cold, red warm
    return `hsl(${hue}, 70%, 50%)`;
  }

  /** Gold → orange → red color ramp. Tuned so even a single-pin
   *  cell reads as a clear gold-orange, not pale yellow that
   *  blends into the basemap. log10 scale: 1→t≈0.15, 10→t≈0.5,
   *  100→t≈0.95, 1000+→t=1.
   *  Hue 45 (gold) → 0 (red), lightness 58 → 42 to keep dense
   *  cells legible without going black. */
  function heatColor(count: number): string {
    const t = Math.min(1, Math.log10(count + 1) / 2.2);
    const hue = 45 - t * 45;
    const lightness = 58 - t * 16;
    return `hsl(${hue.toFixed(0)}, 92%, ${lightness.toFixed(0)}%)`;
  }


  /** Render aggregated cluster points: a labeled circle per cluster,
   *  sized roughly logarithmically by count_pins so 5 vs 5000 reads
   *  immediately. Click → fly to centroid + zoom in by 2 levels;
   *  the parent hears the resulting moveend and refetches at the
   *  finer-grained zoom (clusters break apart into individual pins
   *  once we cross the threshold in clusterEpsForZoom). */
  function renderClusters(currentClusters: ClusterPoint[]) {
    if (!clusterLayer || !map || !LCache) return;
    const L = LCache;
    const next = L.layerGroup();
    for (const c of currentClusters) {
      if (c.count_pins <= 1) {
        // Single-pin cell: render as a small colored circle. Without
        // PinEffective data we can't show ripeness rings or category
        // shape; use the same group-color as full pins so density-
        // map colors stay consistent across the cluster→individual
        // zoom transition. Click → fly to representative pin's
        // location at higher zoom (where the full pin marker
        // renders).
        const fakePin = {
          species_id: c.representative_species_id,
          status: 'active'
        } as unknown as PinEffective;
        const fill = colorOf ? colorOf(fakePin) : '#3a5a3a';
        const baseR = isTouch ? 4 : 3;
        const dot = L.circleMarker([c.centroid_lat, c.centroid_lng], {
          radius: baseR,
          color: '#1f2a1f',
          weight: 1,
          fillColor: fill,
          fillOpacity: 0.85,
          interactive: true
        });
        dot.on('click', () => {
          if (!map) return;
          const targetZoom = Math.min(map.getMaxZoom(), Math.max(16, map.getZoom() + 2));
          map.flyTo([c.centroid_lat, c.centroid_lng], targetZoom, { duration: 0.6 });
        });
        dot.addTo(next);
        continue;
      }
      // log-scaled radius: 2 → 12px, 10 → 18px, 100 → 24px,
      // 1000 → 30px, 10000 → 36px.
      const r = Math.min(36, 12 + Math.log10(c.count_pins) * 6);
      const html = `
        <div class="forager-cluster" style="width:${r * 2}px;height:${r * 2}px;line-height:${r * 2}px;">
          ${c.count_pins.toLocaleString()}
        </div>`;
      const m = L.marker([c.centroid_lat, c.centroid_lng], {
        icon: L.divIcon({
          className: 'forager-cluster-icon',
          html,
          iconSize: [r * 2, r * 2],
          iconAnchor: [r, r]
        }),
        keyboard: false
      });
      m.on('click', () => {
        if (!map) return;
        const targetZoom = Math.min(map.getMaxZoom(), map.getZoom() + 2);
        map.flyTo([c.centroid_lat, c.centroid_lng], targetZoom, { duration: 0.6 });
      });
      m.addTo(next);
    }
    clusterLayer.clearLayers();
    next.eachLayer((layer) => layer.addTo(clusterLayer!));
  }

  /** SVG-as-HTML body for the "shape" style: circle/square/triangle/diamond
   *  per category, all sized to fit the same bounding box as the circle
   *  marker so ripeness rings still surround the centroid cleanly.
   *  When `dotted` is true, the stroke is dashed instead of solid —
   *  used for public-dataset pins so they're visibly distinct from
   *  the user's own/group pins on the same map. */
  function shapeHtml(
    cat: ForageCategory,
    fill: string,
    opacity: string,
    px: number,
    dotted: boolean = false,
    invasive: boolean = false,
    inedibleInvasive: boolean = false
  ): string {
    const box = px + 4;
    const cx = box / 2;
    const cy = box / 2;
    const r = px / 2;
    // Dark stroke + thin white halo via drop-shadow gives contrast on
    // both light tiles (the dark stroke pops) and dark tiles (the
    // white halo separates the shape from the background).
    // Invasive species get a warm warning-red stroke + heavier width
    // so they read as "watch out" at a glance without disturbing
    // shape-by-category or color-by-group encoding.
    const stroke = invasive ? '#b03030' : '#1f2a1f';
    const sw = invasive ? 2.2 : 1.4;
    // 2,1.6 dash pattern is small enough to read on a 12px shape but
    // large enough to be obviously NOT a solid stroke at a glance.
    const dashAttr = dotted ? ' stroke-dasharray="2,1.6"' : '';
    const haloFilter = 'drop-shadow(0 0 1px white) drop-shadow(0 0 1px white)';
    let body: string;
    switch (cat) {
      case 'fruit':
        body = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dashAttr}/>`;
        break;
      case 'nut': {
        const s = r * 1.85; // square side
        const x = cx - s / 2;
        const y = cy - s / 2;
        body = `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="1.2" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dashAttr}/>`;
        break;
      }
      case 'mushroom': {
        const h = r * 2;
        const w = h * 1.05;
        const top = cy - h / 2;
        const bot = cy + h / 2;
        const left = cx - w / 2;
        const right = cx + w / 2;
        body = `<polygon points="${cx},${top} ${right},${bot} ${left},${bot}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"${dashAttr}/>`;
        break;
      }
      case 'other': {
        const s = r * 1.25;
        body = `<polygon points="${cx},${cy - s * 1.1} ${cx + s},${cy} ${cx},${cy + s * 1.1} ${cx - s},${cy}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"${dashAttr}/>`;
        break;
      }
      case 'bramble': {
        // 5-pointed star — brambles get a distinct shape from tree fruit.
        const outer = r * 1.15;
        const inner = outer * 0.45;
        const pts: string[] = [];
        for (let i = 0; i < 10; i++) {
          const ang = -Math.PI / 2 + (i * Math.PI) / 5;
          const rad = i % 2 === 0 ? outer : inner;
          pts.push(`${(cx + rad * Math.cos(ang)).toFixed(2)},${(cy + rad * Math.sin(ang)).toFixed(2)}`);
        }
        body = `<polygon points="${pts.join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"${dashAttr}/>`;
        break;
      }
      default:
        body = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dashAttr}/>`;
    }
    // Inedible invasives get a red ✗ overlay drawn on top of the
    // shape — clear "do not consume, remove" signal at a glance.
    // The X is white-haloed (dropped via the SVG-level filter) so
    // it stays readable against any species fill color.
    let xMark = '';
    if (inedibleInvasive) {
      const xR = r * 0.78;
      const xc1 = (cx - xR).toFixed(2);
      const xc2 = (cx + xR).toFixed(2);
      const yc1 = (cy - xR).toFixed(2);
      const yc2 = (cy + xR).toFixed(2);
      xMark =
        `<line x1="${xc1}" y1="${yc1}" x2="${xc2}" y2="${yc2}" stroke="#b03030" stroke-width="2.2" stroke-linecap="round"/>` +
        `<line x1="${xc1}" y1="${yc2}" x2="${xc2}" y2="${yc1}" stroke="#b03030" stroke-width="2.2" stroke-linecap="round"/>`;
    }
    return `<svg width="${box}" height="${box}" viewBox="0 0 ${box} ${box}" style="opacity:${opacity};filter:${haloFilter};">${body}${xMark}</svg>`;
  }

  /** Color is by forage category. Status overlays handled via opacity +
   *  ripe-now overlays in renderPins. Palette matches the
   *  colorForCategoryFallback used in symbology.ts so the legend and
   *  the "by category" marker-color setting stay consistent. */
  function colorFor(pin: PinEffective): string {
    const cat = categoryOf(pin);
    switch (cat) {
      case 'fruit':    return '#e41a1c'; // red
      case 'bramble':  return '#ffd400'; // yellow
      case 'nut':      return '#1f78b4'; // blue
      case 'mushroom': return '#984ea3'; // purple
      case 'other':    return '#4daf4a'; // green
      default:         return '#999999';
    }
  }

  onMount(async () => {
    const L = await import('leaflet');
    LCache = L; // unblocks renderPins so it can run synchronously
    // Heatmap plugin disabled while we investigate a hydration
    // issue introduced by the dynamic import. The toggle in the
    // tools menu still flips, but rendering is a no-op for now.

    map = L.map(mapEl, {
      zoomControl: true,
      attributionControl: true,
      // Render vector layers (CircleMarker etc) on a single canvas instead
      // of as individual SVG nodes. Big speedup with thousands of markers.
      preferCanvas: true,
      // Cap map zoom at the tile layers' native max (19). Without this
      // users could scroll-wheel zoom past 19 and the tile layer would
      // serve nothing — basemap goes blank.
      maxZoom: 19
    }).setView(center, zoom);

    // Tile layer is set by the reactive applyBasemap above as soon as
    // `map` exists, so no need for a hardcoded layer here.

    markerLayer = L.layerGroup().addTo(map);
    clusterLayer = L.layerGroup().addTo(map);
    // Dedicated SVG pane for the GPS location marker. Without this,
    // the marker shares the canvas with tracks / heatmap / pins and
    // gets painted-over depending on draw order. The user always
    // wants to see where they are, so we lift it into a pane that
    // sits above markerPane (600) and overlayPane (400).
    if (!map.getPane('user-location')) {
      const pane = map.createPane('user-location');
      pane.style.zIndex = '650';
      pane.style.pointerEvents = 'none';
    }
    renderPins(pins, selectedPinId, colorOf, categoryOf);
    renderClusters(clusters);

    // Debounced viewport-change emission. The parent listens to this
    // and refetches the public-pin layer for the new bbox + zoom.
    // 300ms is long enough to absorb a continuous pan but short
    // enough that a deliberate move-and-stop feels responsive.
    let viewportTimer: ReturnType<typeof setTimeout> | null = null;
    const fireViewportChange = () => {
      if (!map) return;
      const b = map.getBounds();
      const bbox: [number, number, number, number] = [
        b.getWest(),
        b.getSouth(),
        b.getEast(),
        b.getNorth()
      ];
      const z = map.getZoom();
      currentZoom = Math.round(z);
      dispatch('viewportChange', { bbox, zoom: z });
      const c = map.getCenter();
      void refreshMapRain(c.lng, c.lat);
    };
    map.on('moveend zoomend', () => {
      if (viewportTimer) clearTimeout(viewportTimer);
      viewportTimer = setTimeout(fireViewportChange, 300);
    });
    // Fire once after the map is genuinely ready so the parent
    // gets the initial viewport. The earlier setTimeout(_, 100)
    // sometimes ran before Leaflet had sized the container, so
    // map.getBounds() returned a degenerate bbox and the first
    // fetch returned zero pins (the next user-zoom would then
    // fire moveend with the proper bbox and finally load data —
    // 'I have to zoom to trigger it'). whenReady fires once the
    // map is loaded and sized; size invalidation forces a re-layout
    // in case the container's CSS settled after Leaflet measured.
    map.whenReady(() => {
      if (!map) return;
      map.invalidateSize();
      fireViewportChange();
    });

    // Long-press (or right-click on desktop) on empty map area: emit
    // mapTap. Marker clicks still don't bubble here. Using contextmenu
    // instead of click avoids accidentally dropping pins on phones
    // where regular taps are too easy to fire.
    //
    // SKIP when already in placing/moving mode — a regular click is
    // the right gesture there, and a parallel contextmenu fire from
    // an ambiguous touch (briefly long-pressed instead of tapped)
    // would either move the pin twice or open the drop-pin modal
    // after a move just completed. Was a documented mobile bug.
    map.on('contextmenu', (e) => {
      if (placing) return;
      dispatch('mapTap', { lng: e.latlng.lng, lat: e.latlng.lat });
    });

    // Placement mode: a regular click on empty map area picks the
    // coordinate. The transparent hit-target circles on each pin have
    // bubblingMouseEvents: false, so pin clicks don't get hijacked.
    map.on('click', (e) => {
      if (!placing) return;
      dispatch('mapTap', { lng: e.latlng.lng, lat: e.latlng.lat });
    });

    // Auto-locate on first map load (best-effort, browser will silently
    // refuse if permission is already denied or context is non-secure).
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      // Defer so the map has time to settle before we pan it.
      setTimeout(() => locateMe(), 250);
    }

    // Re-locate when the page becomes visible again. On mobile, the user
    // typically opens the app, locks the phone, walks somewhere, then
    // unlocks — at that point the marker is stale. visibilitychange
    // fires on unlock; pageshow fires on bfcache restore. Both should
    // refresh the dot without requiring the user to tap the locate
    // button. Only fires when permission is already granted (re-prompt
    // on every wake would be obnoxious).
    const refreshIfVisible = async () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState !== 'visible') return;
      if (!navigator.geolocation || !navigator.permissions) return;
      try {
        const p = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        if (p.state === 'granted') locateMe();
      } catch {
        // Older browsers without permissions API: skip auto-refresh.
      }
    };
    document.addEventListener('visibilitychange', refreshIfVisible);
    window.addEventListener('pageshow', refreshIfVisible);
    autoRefreshCleanup = () => {
      document.removeEventListener('visibilitychange', refreshIfVisible);
      window.removeEventListener('pageshow', refreshIfVisible);
    };
  });

  let autoRefreshCleanup: (() => void) | null = null;

  onDestroy(() => {
    autoRefreshCleanup?.();
    if (map) map.remove();
  });
</script>

<div class="map-wrap" class:placing>
  <div bind:this={mapEl} class="map" />
  <!-- (Build SHA chip moved out of the map corner; the page-level
       filterbar in +page.svelte renders it inline next to the pin
       count, where it never collides with map controls.) -->
  {#if currentZoom != null}
    <div class="zoom-chip" title="Current zoom level">z{currentZoom}</div>
  {/if}
  {#if placing}
    <!-- Tappable banner: clicking anywhere on it cancels placement
         mode. Better UX than the old plain hint, especially on
         mobile where the user can otherwise forget they're in
         move-pin mode and accidentally relocate the wrong pin
         several taps later. -->
    <button
      type="button"
      class="placing-hint"
      on:click={() => dispatch('cancelPlacing', null)}
    >{placingHint}</button>
  {/if}
  <!-- Heatmap-mode hint. The map shows pre-aggregated density tiles
       at zoom < 13 instead of individual pins; without this, users
       who land on a wide view see colored squares and may not realize
       they need to zoom in to see the actual trees. Auto-hides once
       they cross the threshold. -->
  {#if currentZoom != null && currentZoom < 13 && pinDensityBuckets.length > 0}
    <div class="zoom-in-hint" role="status">
      Zoom in to see individual trees
    </div>
  {/if}
  {#if !hideLocate}
    <button
      class="locate"
      class:locating
      on:click={locateMe}
      disabled={locating}
      aria-label="Center map on my location"
    >
      {#if locating}
        <span class="spinner" aria-hidden="true"></span>
      {:else}
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <circle cx="12" cy="12" r="2.5" fill="currentColor" />
          <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1.6" />
          <line x1="12" y1="1.5" x2="12" y2="4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          <line x1="12" y1="20" x2="12" y2="22.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          <line x1="1.5" y1="12" x2="4" y2="12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          <line x1="20" y1="12" x2="22.5" y2="12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      {/if}
    </button>
  {/if}
  {#if locationError}
    <div class="loc-error" role="status">{locationError}</div>
  {/if}
  {#if showTrackLegend}
    <div class="track-legend" title="Tracks colored by date — newest red, oldest blue">
      {#if singleDateLegend}
        <span class="track-legend-bar single" aria-hidden="true"></span>
        <span class="track-legend-label">{trackLegendNewest}</span>
      {:else}
        <span class="track-legend-label">{trackLegendNewest}</span>
        <span class="track-legend-bar" aria-hidden="true"></span>
        <span class="track-legend-label">{trackLegendOldest}</span>
      {/if}
    </div>
  {/if}
  {#if showRainfall && rainTotalMm !== null}
    <div
      class="rain-overlay"
      class:dry={rainTotalMm < 5}
      class:wet={rainTotalMm >= 25}
      title="Rainfall in the last 7 days at the center of the visible map. Source: Open-Meteo."
    >
      🌧 {formatMm(rainTotalMm)} · last 7 days
    </div>
  {/if}
  {#if showRecorder}
    {#if $recording.status === 'idle'}
      <button class="rec-idle" on:click={startRec} title="Start recording a track">
        <span class="rec-dot-static"></span>
        Record
      </button>
    {:else}
      <button
        class="rec-active"
        class:rec-silent={$recording.gpsSilent}
        on:click={clickStop}
        disabled={recSaving}
        title={$recording.gpsSilent
          ? 'GPS lost — track has stopped recording. Tap to stop and save what you have.'
          : $recording.status === 'recording'
            ? 'Recording — tap to stop and save.'
            : 'Paused — tap to stop and save.'}
      >
        {#if $recording.gpsSilent}
          <span class="rec-warn-icon" aria-hidden="true">⚠</span>
        {:else if $recording.status === 'recording'}
          <span class="rec-dot-pulse" aria-hidden="true"></span>
        {:else}
          <span class="rec-paused-icon" aria-hidden="true">⏸</span>
        {/if}
        <span class="rec-elapsed">{elapsedLabel}</span>
        <span class="rec-stop-icon" aria-hidden="true">⏹</span>
      </button>
      {#if $recording.error}
        <div class="rec-error-overlay" role="status">{$recording.error}</div>
      {/if}
      {#if recError}
        <div class="rec-error-overlay" role="status">{recError}</div>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .map-wrap {
    position: relative;
    width: 100%;
    /* Fills remaining vertical space when the parent is a flex
     * column (see .map-page in +page.svelte). Older code used a
     * hardcoded calc(100vh - 100px), which broke once the
     * SignupBanner appeared above the map for anon viewers — the
     * banner pushed the map's bottom edge below the viewport so
     * the attribution + zoom chip were invisible. */
    flex: 1 1 auto;
    min-height: 0;
  }
  .map {
    width: 100%;
    height: 100%;
  }
  /* Crosshair cursor while placing a new pin so the user knows clicks
     are armed. Targets the global Leaflet container class because the
     SVG/canvas overlays paint above .map. */
  .map-wrap.placing :global(.leaflet-container) { cursor: crosshair; }
  /* Placement-mode banner — now a real button so the user can tap
     it to cancel. Persistent + high-contrast so it's harder to
     forget you're in move/place mode (was a documented mobile
     bug). Includes an explicit ✕ affordance. */
  .placing-hint {
    position: absolute;
    top: 0.75rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1100;
    background: #3a5a3a;
    color: white;
    padding: 0.55rem 1.1rem 0.55rem 0.95rem;
    border: 0;
    border-radius: 0.45rem;
    font-size: 0.88rem;
    font-family: inherit;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.25);
    cursor: pointer;
    max-width: calc(100% - 1.5rem);
    text-align: center;
    /* Bigger tap target on touch — Apple HIG says 44px. */
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .placing-hint::after {
    content: '✕';
    opacity: 0.85;
    font-weight: 600;
    margin-left: 0.2rem;
  }
  .placing-hint:hover { background: #2f4a2f; }
  .placing-hint:active { background: #284028; }
  /* Bottom-center hint that surfaces when the map is in heatmap mode
     (zoom < 13). Auto-disappears once the user zooms in far enough
     that individual pins are rendered. Subtle styling so it doesn't
     compete with the colored heatmap behind it. */
  .zoom-in-hint {
    position: absolute;
    bottom: 1.25rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1100;
    background: rgba(58, 90, 58, 0.92);
    color: white;
    padding: 0.45rem 0.95rem;
    border-radius: 999px;
    font-size: 0.85rem;
    font-weight: 500;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
    pointer-events: none;
    backdrop-filter: blur(2px);
    /* Fade in/out smoothly when toggled. */
    animation: zoom-in-hint-fade 0.25s ease-out;
  }
  @keyframes zoom-in-hint-fade {
    from { opacity: 0; transform: translateX(-50%) translateY(4px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
  @media (max-width: 640px) {
    .zoom-in-hint {
      bottom: 1rem;
      font-size: 0.8rem;
      padding: 0.4rem 0.85rem;
    }
  }
  .locate {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    /* Above the pin-detail side panel (z-index 700). */
    z-index: 1100;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    border: 1px solid #c7d0c7;
    background: white;
    color: #3a5a3a;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }
  .locate:active {
    background: #eaf2ea;
  }
  .locate.locating { cursor: progress; }
  .locate:disabled { opacity: 1; }
  .spinner {
    display: inline-block;
    width: 1rem;
    height: 1rem;
    border: 2px solid #c7d0c7;
    border-top-color: #3a5a3a;
    border-radius: 50%;
    animation: locspin 0.8s linear infinite;
  }
  @keyframes locspin {
    to { transform: rotate(360deg); }
  }
  /* Leaflet inserts divIcons outside our scoped CSS, so target them via
     :global. The shape itself is decorative — actual taps go to the
     transparent hit-target circle layered on top in renderPins. */
  :global(.forager-shape) {
    pointer-events: none;
    background: transparent;
    border: 0;
  }
  :global(.forager-cluster-icon) {
    background: transparent;
    border: 0;
  }
  :global(.forager-cluster) {
    border-radius: 50%;
    background: rgba(58, 90, 58, 0.85);
    color: white;
    font-weight: 600;
    text-align: center;
    font-size: 0.78rem;
    border: 2px solid rgba(255, 255, 255, 0.9);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
    cursor: pointer;
    user-select: none;
  }
  :global(.forager-cluster:hover) {
    background: rgba(58, 90, 58, 1);
  }
  .loc-error {
    position: absolute;
    top: 3.5rem;
    right: 0.75rem;
    z-index: 1100;
    max-width: 18rem;
    background: #fff5f5;
    border: 1px solid #d6a3a3;
    color: #a02323;
    padding: 0.45rem 0.65rem;
    border-radius: 0.35rem;
    font-size: 0.8rem;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  }
  /* Bottom-left overlay — Leaflet's zoom buttons own the top-left
     and the locate button owns the top-right, so the bottom-left
     is the only corner without a permanent UI element. (Bottom-
     right is Leaflet's attribution.) */
  .rain-overlay {
    position: absolute;
    bottom: 0.75rem;
    left: 0.75rem;
    z-index: 1100;
    background: #e3eff5;
    border: 1px solid #a8cde0;
    color: #1a4a66;
    padding: 0.3rem 0.65rem;
    border-radius: 0.4rem;
    font-size: 0.82rem;
    font-weight: 500;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
    pointer-events: auto;
  }
  .rain-overlay.dry { background: #fdf4e3; border-color: #e8c97a; color: #7a4a10; }
  .rain-overlay.wet { background: #d4e9f5; border-color: #6fa9d0; color: #0e3b58; }

  /* Recency-color legend for displayed tracks. Lives below the
     locate button (top-right) since the bottom-left is already
     stacked with rain + recorder + status legend. Only visible
     when ≥2 tracks are showing — a single track has no gradient
     to interpret. */
  /* Build SHA chip — top-left, just below Leaflet's zoom controls.
     The bottom-right slot is taken by the new-pin FAB on desktop;
     the bottom-left stack has the rain pill / recorder / track
     legend; top-right has the locate button. Top-left has only
     the small +/- zoom buttons. Build SHA chip moved out of the
     map and into the page-level filterbar — this CSS is left here
     in case Map.svelte ever needs a local build chip again, but
     no element currently has the .build-chip class. */
  .build-chip { display: none; }

  /* Zoom-level chip. Bottom-right, lifted above the new-pin FAB
     (which is a 3.25rem circle at bottom: 1.25rem on desktop) so
     the chip stays visible while the user is dropping pins. On
     mobile the FAB is hidden, but this position is fine — still
     above Leaflet's attribution row. */
  .zoom-chip {
    position: absolute;
    bottom: 5rem;
    right: 0.5rem;
    z-index: 600;
    padding: 0.18rem 0.5rem;
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid #d0d8d0;
    border-radius: 0.3rem;
    font-size: 0.78rem;
    color: #4a554a;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }

  /* Track recency legend. Sits in the bottom-left stack just
     above the recorder pill so it visually associates with the
     track-recording controls. z-index 600 puts it under the
     pin-detail panel (z-700), so opening that panel covers the
     legend instead of the legend covering the panel like the old
     z-1100 did. Position re-checks both rec states (idle is at
     bottom 3.5rem, active is taller) — sit at 6rem so we clear
     either. */
  .track-legend {
    position: absolute;
    bottom: 6rem;
    left: 0.75rem;
    z-index: 600;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.25rem 0.55rem;
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid #d0d8d0;
    border-radius: 0.4rem;
    font-size: 0.7rem;
    color: #4a554a;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
    pointer-events: none;
  }
  .track-legend-bar {
    display: inline-block;
    width: 56px;
    height: 6px;
    border-radius: 3px;
    /* Match colorForRecency: hue 0 (red) → 240 (blue), with the
       same lightness fade applied at the older end. */
    background: linear-gradient(
      to right,
      hsl(0, 75%, 50%),
      hsl(120, 75%, 44%),
      hsl(240, 75%, 38%)
    );
  }
  /* Single-date case (all visible tracks from the same day): show
     a small solid red swatch instead of the gradient, since 'newest
     vs oldest' isn't meaningful. */
  .track-legend-bar.single {
    width: 12px;
    background: hsl(0, 75%, 50%);
  }
  .track-legend-label {
    white-space: nowrap;
    color: #4a554a;
  }

  /* Recorder lives bottom-left — small unobtrusive pill so the map
     stays visible during a foraging walk. Stacks above the rain
     chip so they don't collide. The active state shows a pulsing
     red dot + elapsed time + a stop icon, single-tap to save. */
  .rec-idle, .rec-active {
    position: absolute;
    left: 0.75rem;
    bottom: 3.5rem;
    z-index: 1100;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.7rem;
    border-radius: 0.4rem;
    border: 1px solid #c7d0c7;
    background: white;
    color: #3a5a3a;
    font-size: 0.85rem;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18);
    cursor: pointer;
    line-height: 1;
  }
  .rec-idle:hover { background: #f0f5ef; }
  .rec-active {
    border-color: #c14a3a;
    background: #fff3f0;
    color: #1f2a1f;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .rec-active:hover { background: #ffe9e3; }
  .rec-active:disabled { opacity: 0.65; cursor: default; }
  .rec-dot-static {
    width: 0.6rem; height: 0.6rem; border-radius: 50%;
    background: #c14a3a;
    flex-shrink: 0;
  }
  .rec-dot-pulse {
    width: 0.6rem; height: 0.6rem; border-radius: 50%;
    background: #c14a3a;
    flex-shrink: 0;
    animation: rec-pulse 1.4s infinite;
    box-shadow: 0 0 0 0 rgba(193, 74, 58, 0.6);
  }
  @keyframes rec-pulse {
    0% { box-shadow: 0 0 0 0 rgba(193, 74, 58, 0.6); }
    70% { box-shadow: 0 0 0 6px rgba(193, 74, 58, 0); }
    100% { box-shadow: 0 0 0 0 rgba(193, 74, 58, 0); }
  }
  .rec-paused-icon { color: #7a4a10; }
  .rec-stop-icon { color: #b03030; font-size: 0.95rem; }
  /* GPS-silent state: amber pill so the broken state is visually
   * distinct from healthy recording (red pulse) and paused (gray). */
  .rec-active.rec-silent {
    background: #fff3d9;
    border-color: #d8a058;
    color: #5e3920;
  }
  .rec-active.rec-silent:hover { background: #ffe9c0; }
  .rec-warn-icon {
    color: #c98a4a;
    font-size: 0.95rem;
    flex-shrink: 0;
  }
  .rec-error-overlay {
    position: absolute;
    left: 0.75rem;
    bottom: 6.25rem;
    z-index: 1100;
    max-width: 18rem;
    background: #fff5f5;
    border: 1px solid #d6a3a3;
    color: #a02323;
    padding: 0.4rem 0.6rem;
    border-radius: 0.35rem;
    font-size: 0.78rem;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  }
  @media (max-width: 640px) {
    .locate {
      width: 2.85rem;
      height: 2.85rem;
      font-size: 1.25rem;
    }
    .loc-error { top: 3.85rem; max-width: 15rem; }
  }
</style>
