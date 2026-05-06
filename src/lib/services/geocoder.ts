// Address / place geocoder backed by OpenStreetMap Nominatim. Free,
// no API key, attribution required (we credit OSM in /about). Public
// instance at nominatim.openstreetmap.org rate-limits to ~1 req/sec
// per IP, which is plenty for typeahead at our scale.
//
// We debounce in the UI layer (300ms) and cache results client-side
// so quick typing of a known query never hits the network twice.

export interface GeocodeResult {
  /** OSM place id — stable for a given place across queries. */
  place_id: number;
  /** "Brooklyn, Kings County, New York, United States" — already
   *  Nominatim-formatted display string suitable for a dropdown. */
  display_name: string;
  lat: number;
  lng: number;
  /** Bounding box [south, north, west, east]. Used to pick a sensible
   *  zoom level on flyTo (very large bbox → low zoom; tiny → high). */
  bbox: [number, number, number, number] | null;
  /** OSM type ('city', 'street', 'house', …) — used for icon/sort hints
   *  and to estimate appropriate zoom level. */
  type: string;
  /** Importance score (0..1) — Nominatim's own popularity ranking. */
  importance: number;
}

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';

// Tiny LRU-ish cache keyed by lowercased query. Lifetime is the tab —
// we don't persist across reloads since results can stale.
const cache = new Map<string, GeocodeResult[]>();
const MAX_CACHE = 50;

function cacheGet(q: string): GeocodeResult[] | undefined {
  const v = cache.get(q);
  if (v) {
    // Re-insert to refresh LRU position.
    cache.delete(q);
    cache.set(q, v);
  }
  return v;
}
function cacheSet(q: string, v: GeocodeResult[]): void {
  cache.set(q, v);
  if (cache.size > MAX_CACHE) {
    // Evict oldest.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

/** Free-text geocode. Returns up to `limit` results, ordered by
 *  Nominatim's relevance scoring. Empty/whitespace queries short-
 *  circuit to []. Network or HTTP errors throw. */
export async function geocode(
  query: string,
  opts: { limit?: number; signal?: AbortSignal } = {}
): Promise<GeocodeResult[]> {
  const q = query.trim();
  if (!q) return [];
  const key = q.toLowerCase();
  const hit = cacheGet(key);
  if (hit) return hit;

  const limit = Math.max(1, Math.min(opts.limit ?? 5, 10));
  const params = new URLSearchParams({
    q,
    format: 'jsonv2',
    addressdetails: '0',
    limit: String(limit)
  });
  const url = `${ENDPOINT}?${params.toString()}`;
  const res = await fetch(url, {
    signal: opts.signal,
    headers: {
      // Nominatim asks every consumer to identify themselves. App name
      // + a contact channel. Keep this in sync with the deployed URL.
      'Accept': 'application/json'
    }
  });
  if (!res.ok) throw new Error(`geocode failed: ${res.status}`);
  const raw = (await res.json()) as Array<{
    place_id: number;
    display_name: string;
    lat: string;
    lon: string;
    boundingbox?: [string, string, string, string];
    type?: string;
    importance?: number;
  }>;
  const out: GeocodeResult[] = raw.map((r) => ({
    place_id: r.place_id,
    display_name: r.display_name,
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    bbox: r.boundingbox
      ? [
          parseFloat(r.boundingbox[0]),
          parseFloat(r.boundingbox[1]),
          parseFloat(r.boundingbox[2]),
          parseFloat(r.boundingbox[3])
        ]
      : null,
    type: r.type ?? 'place',
    importance: r.importance ?? 0
  }));
  cacheSet(key, out);
  return out;
}

/** Pick a sensible zoom level given the bbox of a result. Large bbox
 *  (a country) → zoom out; tiny bbox (a house) → zoom in. */
export function zoomForBbox(bbox: [number, number, number, number] | null): number {
  if (!bbox) return 14;
  const [south, north, west, east] = bbox;
  const dLat = Math.abs(north - south);
  const dLng = Math.abs(east - west);
  const span = Math.max(dLat, dLng);
  // Calibrated by inspection across NYC neighborhood / city / state /
  // country queries. Roughly: 1° ≈ city-scale (zoom 10), 0.01° ≈
  // street-scale (zoom 17).
  if (span > 10)   return 5;
  if (span > 2)    return 8;
  if (span > 0.5)  return 11;
  if (span > 0.1)  return 13;
  if (span > 0.02) return 15;
  return 17;
}
