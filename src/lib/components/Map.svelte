<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import 'leaflet/dist/leaflet.css';
  import type { PinEffective } from '$lib/services/pinService';

  type ForageCategory = 'fruit' | 'nut' | 'mushroom' | 'other' | 'unknown';

  /** Optional category resolver, normally computed in +page.svelte from
   *  the species' forage_parts. If omitted, all pins get color 'unknown'. */
  export let categoryOf: (pin: PinEffective) => ForageCategory = () => 'unknown';

  /** Optional hover-tooltip resolver. Returns plain text shown on mouseover. */
  export let labelOf: (pin: PinEffective) => string = (p) =>
    p.display_name ?? '(unnamed pin)';

  /** When true, the locate button is hidden — used while the pin detail
   *  panel is open so it doesn't collide with the panel's close button. */
  export let hideLocate: boolean = false;

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

  // Coarse pointer (touch device) gets larger hit target.
  const isTouch =
    typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  // Reactive update of markers when `pins` changes.
  $: if (map && markerLayer) renderPins(pins);

  async function locateMe() {
    if (!map || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
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
        console.warn('[Map] geolocation failed:', err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function renderPins(currentPins: PinEffective[]) {
    if (!markerLayer || !map) return;
    markerLayer.clearLayers();
    import('leaflet').then((L) => {
      if (!markerLayer) return;
      for (const pin of currentPins) {
        if (pin.lat == null || pin.lng == null) continue;
        const fill = colorFor(pin);
        const isStrictRipe = pin.is_ripe_strict === true;
        const isPossibly = pin.is_ripe_now === true; // already widened by the buffer
        const muted =
          pin.effective_status === 'gone' || pin.effective_status === 'dormant';
        const inaccessible = pin.is_inaccessible === true;
        const fillOpacity = inaccessible ? 0.2 : muted ? 0.45 : 0.9;
        const strokeOpacity = inaccessible ? 0.6 : muted ? 0.8 : 1.0;
        const baseR = isTouch ? 6 : 4.5;

        // Add ripeness rings BEFORE the main marker (so they render
        // beneath it). One ring = strict ripe; two rings = possibly
        // ripe (within the ±10 day buffer but not strictly).
        if (isPossibly) {
          // Inner ring (drawn for both strict and possibly).
          L.circleMarker([pin.lat, pin.lng], {
            radius: baseR + 3.5,
            color: '#d57100',
            fill: false,
            weight: 1.8,
            opacity: 0.85,
            interactive: false
          }).addTo(markerLayer);
        }
        if (isPossibly && !isStrictRipe) {
          // Outer ring only when in the buffer zone (not strictly ripe).
          L.circleMarker([pin.lat, pin.lng], {
            radius: baseR + 7,
            color: '#d57100',
            fill: false,
            weight: 1.4,
            opacity: 0.45,
            interactive: false
          }).addTo(markerLayer);
        }

        // Main pin marker (white outline for legibility on any map).
        const marker = L.circleMarker([pin.lat, pin.lng], {
          radius: baseR,
          color: '#ffffff',
          fillColor: fill,
          fillOpacity,
          opacity: strokeOpacity,
          weight: 1.5,
          bubblingMouseEvents: false
        });
        marker.on('click', () => {
          if (pin.id) dispatch('pinClick', { pinId: pin.id });
        });
        const label = labelOf(pin);
        if (label) {
          marker.bindTooltip(label, { direction: 'top', offset: [0, -2], sticky: true });
        }
        marker.addTo(markerLayer);
      }
    });
  }

  /** Color is by forage category. Status overlays handled via opacity +
   *  ripe-now overlays in renderPins. */
  function colorFor(pin: PinEffective): string {
    const cat = categoryOf(pin);
    switch (cat) {
      case 'fruit':    return '#c14a3a'; // red-orange (cherries, mulberries, brambles)
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

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

    markerLayer = L.layerGroup().addTo(map);
    renderPins(pins);

    // Long-press (or right-click on desktop) on empty map area: emit
    // mapTap. Marker clicks still don't bubble here. Using contextmenu
    // instead of click avoids accidentally dropping pins on phones
    // where regular taps are too easy to fire.
    map.on('contextmenu', (e) => {
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

<div class="map-wrap">
  <div bind:this={mapEl} class="map" />
  {#if !hideLocate}
    <button class="locate" on:click={locateMe} aria-label="Center map on my location">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <circle cx="12" cy="12" r="2.5" fill="currentColor" />
        <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1.6" />
        <line x1="12" y1="1.5" x2="12" y2="4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        <line x1="12" y1="20" x2="12" y2="22.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        <line x1="1.5" y1="12" x2="4" y2="12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        <line x1="20" y1="12" x2="22.5" y2="12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
    </button>
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
  @media (max-width: 640px) {
    .locate {
      width: 2.85rem;
      height: 2.85rem;
      font-size: 1.25rem;
    }
  }
</style>
