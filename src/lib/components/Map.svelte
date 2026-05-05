<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import 'leaflet/dist/leaflet.css';
  import type { PinEffective } from '$lib/services/pinService';

  type ForageCategory = 'fruit' | 'nut' | 'mushroom' | 'greens' | 'other' | 'unknown';

  /** Optional category resolver, normally computed in +page.svelte from
   *  the species' forage_parts. If omitted, all pins get color 'unknown'. */
  export let categoryOf: (pin: PinEffective) => ForageCategory = () => 'unknown';

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
        const isRipe = pin.is_ripe_now === true;
        const muted =
          pin.effective_status === 'gone' || pin.effective_status === 'dormant';
        const marker = L.circleMarker([pin.lat, pin.lng], {
          radius: isRipe ? 9 : 6,
          color: isRipe ? '#d57100' : fill,
          fillColor: fill,
          fillOpacity: muted ? 0.4 : 0.9,
          weight: isRipe ? 3 : 1,
          // Stop click events from bubbling to the underlying map (which
          // would otherwise fire mapTap and open the drop-pin modal).
          bubblingMouseEvents: false
        });
        marker.on('click', () => {
          if (pin.id) dispatch('pinClick', { pinId: pin.id });
        });
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
      case 'greens':   return '#6ba040'; // green (ramps, asparagus, mint)
      case 'other':    return '#5a7a3a'; // muted green (sassafras, spicebush)
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

    // Tap on empty map area: emit mapTap. Tapping a pin marker does NOT
    // bubble here (Leaflet handles marker clicks separately), so this
    // only fires for "open" map clicks.
    map.on('click', (e) => {
      dispatch('mapTap', { lng: e.latlng.lng, lat: e.latlng.lat });
    });
  });

  onDestroy(() => {
    if (map) map.remove();
  });
</script>

<div class="map-wrap">
  <div bind:this={mapEl} class="map" />
  <button class="locate" on:click={locateMe} aria-label="Find my location">📍</button>
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
    bottom: 1rem;
    right: 1rem;
    z-index: 500;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 50%;
    border: 0;
    background: white;
    font-size: 1.25rem;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
    cursor: pointer;
  }
  .locate:active {
    background: #f0f0f0;
  }
</style>
