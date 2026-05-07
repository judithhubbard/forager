<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { readable } from 'svelte/store';
  import 'leaflet/dist/leaflet.css';
  import type { PinEffective } from '$lib/services/pinService';
  import { recentRain, formatMm } from '$lib/services/weatherService';
  import { formatElapsed, autoTrackTitle } from '$lib/utils/formatTime';
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
  $: if (map && basemap) applyBasemap(basemap);
  async function applyBasemap(b: Basemap) {
    const L = await import('leaflet');
    if (!map) return;
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

  /** Show the live track-recorder controls + path overlay. Parent
   *  passes true for signed-in viewers; signed-out viewers don't
   *  have a place to save tracks to. */
  export let showRecorder: boolean = false;

  /** Saved-track polylines the user has chosen to keep visible on
   *  the map. Each entry is rendered as a colored line. The id is
   *  used to keep individual layers stable across re-renders. */
  export let displayedTracks: Array<{
    id: string;
    points: Array<[number, number]>;
  }> = [];

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
  }>();

  let mapEl: HTMLDivElement;
  let map: import('leaflet').Map | undefined;
  let markerLayer: import('leaflet').LayerGroup | undefined;
  let clusterLayer: import('leaflet').LayerGroup | undefined;
  let userMarker: import('leaflet').CircleMarker | undefined;
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
    renderPins(pins, selectedPinId, colorOf, categoryOf);
  }
  // Same atomic-swap pattern for the cluster layer so cluster count
  // dots update in sync with whatever the parent fetched for the
  // current viewport.
  $: if (map && clusterLayer && LCache) {
    renderClusters(clusters);
  }
  // Density visualization via overlapping low-opacity circles. Not
  // a true Gaussian heatmap (we ditched the leaflet.heat plugin
  // for ESM compatibility) but visually similar — many overlapping
  // points → darker patch.
  $: if (map && LCache) renderHeat(heatPoints);
  // Saved-track polylines.
  $: if (map && LCache) renderTrackLayers(displayedTracks);

  /** Pick a stable track color from the id hash so the same track
   *  comes back the same color across reloads. Five colors, all
   *  high-contrast against both light and satellite basemaps. */
  function colorForTrackId(id: string): string {
    const palette = ['#c14a3a', '#3a8db0', '#7a4a10', '#5a8a3a', '#984ea3'];
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return palette[h % palette.length];
  }

  function renderTrackLayers(tracks: Array<{ id: string; points: Array<[number, number]> }>) {
    if (!map || !LCache) return;
    const L = LCache;
    const wantedIds = new Set(tracks.map((t) => t.id));
    // Drop layers for tracks no longer in the displayed set.
    for (const [id, layer] of trackLayers) {
      if (!wantedIds.has(id)) {
        layer.remove();
        trackLayers.delete(id);
      }
    }
    // Add or update the rest.
    for (const t of tracks) {
      if (t.points.length < 2) continue;
      const existing = trackLayers.get(t.id);
      if (existing) {
        existing.setLatLngs(t.points);
      } else {
        const poly = L.polyline(t.points, {
          color: colorForTrackId(t.id),
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
    const ms = $recording.startedAt
      ? ($recording.endedAt ?? $now) - $recording.startedAt
      : 0;
    elapsedLabel = formatElapsed(ms);
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

  async function locateMe() {
    if (!map) return;
    if (!navigator.geolocation) {
      locationError = 'This browser does not support geolocation.';
      return;
    }
    locating = true;
    locationError = '';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        locating = false;
        if (!map) return;
        const { latitude, longitude } = pos.coords;
        map.setView([latitude, longitude], 15);
        if (userMarker) userMarker.remove();
        // Lazy import L only inside async/onMount to avoid SSR issues.
        import('leaflet').then((leaflet) => {
          if (!map) return;
          userMarker = leaflet.circleMarker([latitude, longitude], {
            radius: 8,
            color: '#1a64d6',
            fillColor: '#3a8df0',
            fillOpacity: 0.8,
            weight: 2
          }).addTo(map);
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
        // Auto-clear the error after a few seconds so it doesn't linger.
        setTimeout(() => {
          if (locationError === reason) locationError = '';
        }, 6000);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function renderPins(
    currentPins: PinEffective[],
    selectedId: string | null,
    colorResolver: ((pin: PinEffective) => string) | null,
    catResolver: (pin: PinEffective) => ForageCategory
  ) {
    if (!markerLayer || !map || !LCache) return;
    const L = LCache;
    // Build the new marker batch into a fresh layer first, then swap
    // it in via clear+addAll. The new markers exist before the old
    // ones disappear, eliminating the brief "no pins" flash that
    // happened when clearLayers ran sync but the marker loop was
    // inside an async leaflet import.
    const next = L.layerGroup();
    {
      for (const pin of currentPins) {
        if (pin.lat == null || pin.lng == null) continue;
        const fill = colorResolver ? colorResolver(pin) : colorFor(pin);
        const isSelected = !!selectedId && pin.id === selectedId;
        const isStrictRipe = pin.is_ripe_strict === true;
        const isPossibly = pin.is_ripe_now === true; // already widened by the buffer
        const muted =
          pin.effective_status === 'gone' || pin.effective_status === 'dormant';
        const inaccessible = pin.is_inaccessible === true;
        const fillOpacity = inaccessible ? 0.2 : muted ? 0.45 : 0.9;
        const strokeOpacity = inaccessible ? 0.6 : muted ? 0.8 : 1.0;
        const baseR = isTouch ? 6 : 4.5;

        // Selected-pin highlight ring (drawn first so it sits below).
        if (isSelected) {
          L.circleMarker([pin.lat, pin.lng], {
            radius: baseR + 13,
            color: '#1f6fe0',
            fill: false,
            weight: 1.5,
            opacity: 0.35,
            interactive: false
          }).addTo(next);
          L.circleMarker([pin.lat, pin.lng], {
            radius: baseR + 7,
            color: '#1f6fe0',
            fill: false,
            weight: 2.5,
            opacity: 1,
            interactive: false
          }).addTo(next);
        }

        // Add ripeness rings BEFORE the main marker (so they render
        // beneath it). Strict ripe gets the bold double-ring treatment to
        // really pop; "possibly ripe" (in the ±10-day buffer but not
        // strictly inside the window) gets a single faint dashed ring
        // that suggests "maybe" without competing with strict ripe pins.
        if (isStrictRipe) {
          L.circleMarker([pin.lat, pin.lng], {
            radius: baseR + 4,
            color: '#d57100',
            fill: false,
            weight: 2.5,
            opacity: 1.0,
            interactive: false
          }).addTo(next);
          L.circleMarker([pin.lat, pin.lng], {
            radius: baseR + 8.5,
            color: '#d57100',
            fill: false,
            weight: 1.6,
            opacity: 0.65,
            interactive: false
          }).addTo(next);
        } else if (isPossibly) {
          L.circleMarker([pin.lat, pin.lng], {
            radius: baseR + 4,
            color: '#d57100',
            fill: false,
            weight: 1.2,
            opacity: 0.55,
            dashArray: '3,3',
            interactive: false
          }).addTo(next);
        }

        // Main pin marker — shape varies by category (●■▲◆ for
        // fruit/nut/mushroom/other, ★ for brambles), filled with the
        // group color. Rendered as a non-interactive divIcon; the
        // transparent hit-target circle below captures clicks.
        // (Public-vs-personal differentiation is communicated through
        // the chip in the detail panel and the tooltip suffix; the
        // dashed-stroke experiment was hard to read at 12px so we
        // dropped it. shapeHtml still accepts a dotted flag for
        // future use.)
        const cat = catResolver(pin);
        const px = baseR * 2;
        const fillVisible = fillOpacity > 0.02 ? fill : 'transparent';
        const opacityCss = fillOpacity.toFixed(2);
        const html = shapeHtml(cat, fillVisible, opacityCss, px);
        const marker = L.marker([pin.lat, pin.lng], {
          icon: L.divIcon({
            className: 'forager-shape',
            html,
            iconSize: [px + 4, px + 4],
            iconAnchor: [(px + 4) / 2, (px + 4) / 2]
          }),
          keyboard: false,
          interactive: false
        });
        marker.addTo(next);

        // On touch devices the visual marker is too small for a finger
        // (≈12px diameter). Layer a transparent, larger circle on top
        // that captures the tap and the hover. Tooltip binds here too —
        // the hit-target is always on top, so it catches mouseover for
        // every symbol style without depending on whether the visual
        // marker is interactive (divIcon variants are not).
        const hitR = isTouch ? baseR + 8 : baseR + 3;
        const hit = L.circleMarker([pin.lat, pin.lng], {
          radius: hitR,
          color: 'transparent',
          fillColor: '#000',
          fillOpacity: 0,
          opacity: 0,
          weight: 0,
          bubblingMouseEvents: false
        });
        hit.on('click', () => {
          if (pin.id) dispatch('pinClick', { pinId: pin.id });
        });
        const label = labelOf(pin);
        if (label) {
          hit.bindTooltip(label, { direction: 'top', offset: [0, -2], sticky: true });
        }
        hit.addTo(next);
      }
    }
    // Atomic swap: clear the old layer and immediately attach the
    // already-built `next` group's children to it. The map never
    // sees an empty marker layer.
    markerLayer.clearLayers();
    next.eachLayer((layer) => layer.addTo(markerLayer!));
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
      // Single-pin "cluster" = render as a real pin, not a count
      // dot (less visual noise at borderline zooms).
      if (c.count_pins <= 1) continue;
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
    dotted: boolean = false
  ): string {
    const box = px + 4;
    const cx = box / 2;
    const cy = box / 2;
    const r = px / 2;
    // Dark stroke + thin white halo via drop-shadow gives contrast on
    // both light tiles (the dark stroke pops) and dark tiles (the
    // white halo separates the shape from the background).
    const stroke = '#1f2a1f';
    const sw = 1.4;
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
    return `<svg width="${box}" height="${box}" viewBox="0 0 ${box} ${box}" style="opacity:${opacity};filter:${haloFilter};">${body}</svg>`;
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
      preferCanvas: true
    }).setView(center, zoom);

    // Tile layer is set by the reactive applyBasemap above as soon as
    // `map` exists, so no need for a hardcoded layer here.

    markerLayer = L.layerGroup().addTo(map);
    clusterLayer = L.layerGroup().addTo(map);
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
      dispatch('viewportChange', { bbox, zoom: map.getZoom() });
      const c = map.getCenter();
      void refreshMapRain(c.lng, c.lat);
    };
    map.on('moveend zoomend', () => {
      if (viewportTimer) clearTimeout(viewportTimer);
      viewportTimer = setTimeout(fireViewportChange, 300);
    });
    // Fire once after first render so the parent gets the initial
    // viewport without waiting for a user pan.
    setTimeout(fireViewportChange, 100);

    // Long-press (or right-click on desktop) on empty map area: emit
    // mapTap. Marker clicks still don't bubble here. Using contextmenu
    // instead of click avoids accidentally dropping pins on phones
    // where regular taps are too easy to fire.
    map.on('contextmenu', (e) => {
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
  });

  onDestroy(() => {
    if (map) map.remove();
  });
</script>

<div class="map-wrap" class:placing>
  <div bind:this={mapEl} class="map" />
  {#if placing}
    <div class="placing-hint" role="status">{placingHint}</div>
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
  {#if rainTotalMm !== null}
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
        on:click={clickStop}
        disabled={recSaving}
        title={$recording.status === 'recording'
          ? 'Recording — tap to stop and save.'
          : 'Paused — tap to stop and save.'}
      >
        {#if $recording.status === 'recording'}
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
    /* Header (56) + filter bar (~44) ≈ 100. Use flex-fill if more bars get added. */
    height: calc(100vh - 100px);
  }
  .map {
    width: 100%;
    height: 100%;
  }
  /* Crosshair cursor while placing a new pin so the user knows clicks
     are armed. Targets the global Leaflet container class because the
     SVG/canvas overlays paint above .map. */
  .map-wrap.placing :global(.leaflet-container) { cursor: crosshair; }
  .placing-hint {
    position: absolute;
    top: 0.75rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1100;
    background: #3a5a3a;
    color: white;
    padding: 0.4rem 0.85rem;
    border-radius: 0.35rem;
    font-size: 0.85rem;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
    pointer-events: none;
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
