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

  /** Marker style for the four forage categories. Temporary picker in
   *  the filter bar drives this so the user can compare options. */
  type SymbolStyle = 'circle' | 'shape' | 'letter' | 'emoji';
  export let symbolStyle: SymbolStyle = 'circle';

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

  // Reactive update of markers when `pins` (or the symbol style) changes.
  $: if (map && markerLayer) {
    void symbolStyle; // re-render when the picker changes
    renderPins(pins);
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

        // Main pin marker. Style depends on the picker:
        //   circle: existing colored disc
        //   shape:  shape varies per category (●■▲◆) in the same color
        //   letter: bold F/N/M/O letter inside the colored disc
        //   emoji:  category-appropriate emoji (no disc)
        const cat = categoryOf(pin);
        const px = baseR * 2;
        const fillVisible = fillOpacity > 0.02 ? fill : 'transparent';
        const opacityCss = fillOpacity.toFixed(2);
        let marker: import('leaflet').Layer;
        if (symbolStyle === 'circle') {
          marker = L.circleMarker([pin.lat, pin.lng], {
            radius: baseR,
            color: '#ffffff',
            fillColor: fill,
            fillOpacity,
            opacity: strokeOpacity,
            weight: 1.5,
            bubblingMouseEvents: false
          });
        } else if (symbolStyle === 'shape') {
          const html = shapeHtml(cat, fillVisible, opacityCss, px);
          marker = L.marker([pin.lat, pin.lng], {
            icon: L.divIcon({
              className: 'forager-shape',
              html,
              iconSize: [px + 4, px + 4],
              iconAnchor: [(px + 4) / 2, (px + 4) / 2]
            }),
            keyboard: false,
            interactive: false
          });
        } else if (symbolStyle === 'letter') {
          const letter = ({ fruit: 'F', nut: 'N', mushroom: 'M', other: 'O', unknown: '?' } as const)[cat];
          marker = L.marker([pin.lat, pin.lng], {
            icon: L.divIcon({
              className: 'forager-letter',
              html: `<span style="background:${fillVisible};opacity:${opacityCss};width:${px + 2}px;height:${px + 2}px;font-size:${Math.max(9, baseR + 3)}px;">${letter}</span>`,
              iconSize: [px + 2, px + 2],
              iconAnchor: [(px + 2) / 2, (px + 2) / 2]
            }),
            keyboard: false,
            interactive: false
          });
        } else {
          // emoji
          const emoji = ({ fruit: '🍒', nut: '🌰', mushroom: '🍄', other: '🌿', unknown: '📍' } as const)[cat];
          const sizePx = Math.round(baseR * 2.6);
          marker = L.marker([pin.lat, pin.lng], {
            icon: L.divIcon({
              className: 'forager-emoji',
              html: `<span style="font-size:${sizePx}px;opacity:${opacityCss};">${emoji}</span>`,
              iconSize: [sizePx + 2, sizePx + 2],
              iconAnchor: [(sizePx + 2) / 2, (sizePx + 2) / 2]
            }),
            keyboard: false,
            interactive: false
          });
        }
        const label = labelOf(pin);
        if (label && 'bindTooltip' in marker) {
          (marker as import('leaflet').CircleMarker).bindTooltip(
            label,
            { direction: 'top', offset: [0, -2], sticky: true }
          );
        }
        marker.addTo(markerLayer);

        // On touch devices the visual marker is too small for a finger
        // (≈12px diameter). Layer a transparent, larger circle on top
        // that captures the tap. Visual stays the same; hit area
        // roughly triples. Desktop keeps a smaller bonus for easier
        // hovering.
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
    const stroke = '#ffffff';
    const sw = 1.5;
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
      default:
        body = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
    }
    return `<svg width="${box}" height="${box}" viewBox="0 0 ${box} ${box}" style="opacity:${opacity};">${body}</svg>`;
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
     :global. They're decorative — actual taps go to the transparent
     hit-target circle layered on top in renderPins. */
  :global(.forager-shape),
  :global(.forager-letter),
  :global(.forager-emoji) {
    pointer-events: none;
    background: transparent;
    border: 0;
  }
  :global(.forager-letter span) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: white;
    font-weight: 700;
    line-height: 1;
    border: 1.5px solid white;
    box-sizing: border-box;
    font-family: system-ui, -apple-system, sans-serif;
  }
  :global(.forager-emoji span) {
    display: inline-block;
    line-height: 1;
    text-shadow: 0 0 2px white, 0 0 2px white;
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
