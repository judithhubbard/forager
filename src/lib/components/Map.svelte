<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import 'leaflet/dist/leaflet.css';
  import type { PinEffective } from '$lib/services/pinService';

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
   *  "+ new pin" flow; on mobile the long-press gesture stays the
   *  primary entry point. */
  export let placing: boolean = false;

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

  const dispatch = createEventDispatcher<{
    pinClick: { pinId: string };
    mapTap: { lng: number; lat: number };
  }>();

  let mapEl: HTMLDivElement;
  let map: import('leaflet').Map | undefined;
  let markerLayer: import('leaflet').LayerGroup | undefined;
  let userMarker: import('leaflet').CircleMarker | undefined;

  // Surface geolocation state so the user sees what's happening when they
  // tap the locate button — silent failures were a recurring source of
  // "the button does nothing" reports.
  let locating = false;
  let locationError = '';

  // Coarse pointer (touch device) gets larger hit target.
  const isTouch =
    typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  // Reactive update of markers when `pins`, the selected pin, or the
  // color resolver changes.
  $: if (map && markerLayer) {
    void colorOf; // keep colorOf in the dependency set
    renderPins(pins, selectedPinId);
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
    selectedId: string | null
  ) {
    if (!markerLayer || !map) return;
    markerLayer.clearLayers();
    import('leaflet').then((L) => {
      if (!markerLayer) return;
      for (const pin of currentPins) {
        if (pin.lat == null || pin.lng == null) continue;
        const fill = colorOf ? colorOf(pin) : colorFor(pin);
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
          }).addTo(markerLayer);
          L.circleMarker([pin.lat, pin.lng], {
            radius: baseR + 7,
            color: '#1f6fe0',
            fill: false,
            weight: 2.5,
            opacity: 1,
            interactive: false
          }).addTo(markerLayer);
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
          }).addTo(markerLayer);
          L.circleMarker([pin.lat, pin.lng], {
            radius: baseR + 8.5,
            color: '#d57100',
            fill: false,
            weight: 1.6,
            opacity: 0.65,
            interactive: false
          }).addTo(markerLayer);
        } else if (isPossibly) {
          L.circleMarker([pin.lat, pin.lng], {
            radius: baseR + 4,
            color: '#d57100',
            fill: false,
            weight: 1.2,
            opacity: 0.55,
            dashArray: '3,3',
            interactive: false
          }).addTo(markerLayer);
        }

        // Main pin marker — shape varies by category (●■▲◆ for
        // fruit/nut/mushroom/other, ★ for brambles), filled with the
        // group color. Rendered as a non-interactive divIcon; the
        // transparent hit-target circle below captures clicks.
        const cat = categoryOf(pin);
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
        marker.addTo(markerLayer);

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
        hit.addTo(markerLayer);
      }
    });
  }

  /** SVG-as-HTML body for the "shape" style: circle/square/triangle/diamond
   *  per category, all sized to fit the same bounding box as the circle
   *  marker so ripeness rings still surround the centroid cleanly. */
  function shapeHtml(
    cat: ForageCategory,
    fill: string,
    opacity: string,
    px: number
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
    const haloFilter = 'drop-shadow(0 0 1px white) drop-shadow(0 0 1px white)';
    let body: string;
    switch (cat) {
      case 'fruit':
        body = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
        break;
      case 'nut': {
        const s = r * 1.85; // square side
        const x = cx - s / 2;
        const y = cy - s / 2;
        body = `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="1.2" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
        break;
      }
      case 'mushroom': {
        const h = r * 2;
        const w = h * 1.05;
        const top = cy - h / 2;
        const bot = cy + h / 2;
        const left = cx - w / 2;
        const right = cx + w / 2;
        body = `<polygon points="${cx},${top} ${right},${bot} ${left},${bot}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
        break;
      }
      case 'other': {
        const s = r * 1.25;
        body = `<polygon points="${cx},${cy - s * 1.1} ${cx + s},${cy} ${cx},${cy + s * 1.1} ${cx - s},${cy}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
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
        body = `<polygon points="${pts.join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
        break;
      }
      default:
        body = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
    }
    return `<svg width="${box}" height="${box}" viewBox="0 0 ${box} ${box}" style="opacity:${opacity};filter:${haloFilter};">${body}</svg>`;
  }

  /** Color is by forage category. Status overlays handled via opacity +
   *  ripe-now overlays in renderPins. */
  function colorFor(pin: PinEffective): string {
    const cat = categoryOf(pin);
    switch (cat) {
      case 'fruit':    return '#c14a3a'; // red-orange (cherries, mulberries)
      case 'bramble':  return '#5a2440'; // dark berry (raspberries, blackberries)
      case 'nut':      return '#7a5230'; // brown (hickories, hazelnuts, chestnuts)
      case 'mushroom': return '#8a4ea0'; // purple (morels, chanterelles)
      case 'other':    return '#6ba040'; // green (ramps, asparagus, mint, anything else)
      default:         return '#6b7a6b'; // unknown / no species
    }
  }

  onMount(async () => {
    const L = await import('leaflet');

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
    renderPins(pins, selectedPinId);

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
    <div class="placing-hint" role="status">Click on the map to place the pin · Esc to cancel</div>
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
  @media (max-width: 640px) {
    .locate {
      width: 2.85rem;
      height: 2.85rem;
      font-size: 1.25rem;
    }
    .loc-error { top: 3.85rem; max-width: 15rem; }
  }
</style>
