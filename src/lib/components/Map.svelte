<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import 'leaflet/dist/leaflet.css';
  import type { PinEffective } from '$lib/services/pinService';

  export let pins: PinEffective[] = [];
  export let center: [number, number] = [42.4534, -76.4836]; // Cornell campus default
  export let zoom: number = 14;

  const dispatch = createEventDispatcher<{ pinClick: { pinId: string } }>();

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
        const color = colorFor(pin);
        const marker = L.circleMarker([pin.lat, pin.lng], {
          radius: 7,
          color,
          fillColor: color,
          fillOpacity: 0.9,
          weight: 2
        });
        marker.on('click', () => {
          if (pin.id) dispatch('pinClick', { pinId: pin.id });
        });
        marker.addTo(markerLayer);
      }
    });
  }

  function colorFor(pin: PinEffective): string {
    if (pin.is_ripe_now) return '#d57100'; // ripe = burnt orange
    if (pin.effective_status === 'gone') return '#9a9a9a';
    if (pin.effective_status === 'dormant') return '#7a7a40';
    if (pin.effective_status === 'needs_verification') return '#a070b0';
    return '#3a5a3a'; // active default
  }

  onMount(async () => {
    const L = await import('leaflet');

    map = L.map(mapEl, {
      zoomControl: true,
      attributionControl: true
    }).setView(center, zoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

    markerLayer = L.layerGroup().addTo(map);
    renderPins(pins);
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
    height: calc(100vh - 56px);
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
