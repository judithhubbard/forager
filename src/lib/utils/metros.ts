// Hand-curated metro list for heatmap-cell tooltips.
//
// Entries are derived from the actual centroids of imported tree-data
// sources (Dryad city trees + our direct ArcGIS/CKAN imports). Adjacent
// cities have been collapsed into a single metro entry where contiguous
// (e.g. SF + Oakland + San Jose → "Bay Area"); non-contiguous metros
// stay separate (Baltimore vs DC, Denver vs Colorado Springs).
//
// Radius is approximate — a heatmap cell whose centroid falls within
// `radiusKm` of the metro point gets the metro's display name in its
// tooltip. Cells outside all metros tooltip with just the pin count.

export interface Metro {
  name: string;
  lat: number;
  lng: number;
  radiusKm: number;
}

export const METROS: Metro[] = [
  // Northeast / Mid-Atlantic
  { name: 'Boston area',         lat: 42.36, lng: -71.08, radiusKm: 30 },
  { name: 'NYC area',            lat: 40.71, lng: -74.00, radiusKm: 50 },
  { name: 'Providence',          lat: 41.83, lng: -71.42, radiusKm: 20 },
  { name: 'Buffalo',             lat: 42.91, lng: -78.86, radiusKm: 25 },
  { name: 'Rochester NY',        lat: 43.16, lng: -77.61, radiusKm: 20 },
  { name: 'Ithaca area',         lat: 42.44, lng: -76.50, radiusKm: 15 },
  { name: 'Pittsburgh',          lat: 40.44, lng: -79.96, radiusKm: 30 },
  { name: 'Philadelphia area',   lat: 39.95, lng: -75.61, radiusKm: 40 },
  { name: 'Baltimore',           lat: 39.31, lng: -76.62, radiusKm: 25 },
  { name: 'DC area',             lat: 38.91, lng: -77.04, radiusKm: 30 },
  { name: 'Charlottesville',     lat: 38.04, lng: -78.48, radiusKm: 15 },

  // Southeast
  { name: 'Atlanta',             lat: 33.76, lng: -84.39, radiusKm: 50 },
  { name: 'Charlotte / Triad',   lat: 35.50, lng: -80.50, radiusKm: 30 },
  { name: 'Durham',              lat: 36.00, lng: -78.90, radiusKm: 20 },
  { name: 'Greensboro',          lat: 36.05, lng: -79.49, radiusKm: 20 },
  { name: 'Knoxville',           lat: 35.98, lng: -83.94, radiusKm: 20 },
  { name: 'Nashville',           lat: 36.16, lng: -86.78, radiusKm: 25 },
  { name: 'Louisville',          lat: 38.22, lng: -85.73, radiusKm: 25 },
  { name: 'Tampa',               lat: 27.98, lng: -82.45, radiusKm: 35 },
  { name: 'Cape Coral',          lat: 26.60, lng: -81.97, radiusKm: 20 },

  // Midwest
  { name: 'Chicago area',        lat: 41.85, lng: -87.78, radiusKm: 60 },
  { name: 'Champaign IL',        lat: 40.11, lng: -88.27, radiusKm: 15 },
  { name: 'Detroit',             lat: 42.39, lng: -83.10, radiusKm: 35 },
  { name: 'Ann Arbor area',      lat: 42.28, lng: -83.72, radiusKm: 20 },
  { name: 'Columbus OH',         lat: 40.01, lng: -82.99, radiusKm: 25 },
  { name: 'Milwaukee',           lat: 43.03, lng: -87.99, radiusKm: 25 },
  { name: 'Madison WI',          lat: 43.07, lng: -89.41, radiusKm: 20 },
  { name: 'Minneapolis–St Paul', lat: 44.95, lng: -93.27, radiusKm: 40 },
  { name: 'Sioux Falls',         lat: 43.53, lng: -96.73, radiusKm: 20 },
  { name: 'Des Moines',          lat: 41.61, lng: -93.67, radiusKm: 20 },
  { name: 'St Louis',            lat: 38.61, lng: -90.25, radiusKm: 30 },
  { name: 'Kansas City area',    lat: 38.97, lng: -94.69, radiusKm: 30 },

  // South / Texas / Plains
  { name: 'Houston',             lat: 29.76, lng: -95.40, radiusKm: 50 },
  { name: 'Austin',              lat: 30.27, lng: -97.74, radiusKm: 25 },
  { name: 'Dallas–Fort Worth',   lat: 32.75, lng: -97.10, radiusKm: 60 },
  { name: 'Oklahoma City',       lat: 35.48, lng: -97.53, radiusKm: 25 },

  // Mountain West
  { name: 'Denver area',         lat: 39.74, lng: -104.95, radiusKm: 40 },
  { name: 'Colorado Springs',    lat: 38.86, lng: -104.79, radiusKm: 20 },
  { name: 'Albuquerque',         lat: 35.10, lng: -106.63, radiusKm: 25 },
  { name: 'Las Vegas',           lat: 36.18, lng: -115.19, radiusKm: 30 },

  // West Coast
  { name: 'Bay Area',            lat: 37.55, lng: -122.10, radiusKm: 70 },
  { name: 'Sacramento',          lat: 38.58, lng: -121.49, radiusKm: 25 },
  { name: 'Stockton',            lat: 37.98, lng: -121.31, radiusKm: 20 },
  { name: 'Santa Rosa',          lat: 38.49, lng: -122.72, radiusKm: 20 },
  { name: 'LA Basin',            lat: 34.05, lng: -118.05, radiusKm: 80 },
  { name: 'San Diego',           lat: 32.79, lng: -117.15, radiusKm: 35 },
  { name: 'Escondido',           lat: 33.12, lng: -117.07, radiusKm: 15 },
  { name: 'Portland OR',         lat: 45.53, lng: -122.65, radiusKm: 30 },
  { name: 'Seattle area',        lat: 47.62, lng: -122.33, radiusKm: 35 },
  { name: 'Honolulu',            lat: 21.35, lng: -157.80, radiusKm: 25 },

  // Canada
  { name: 'Toronto area',        lat: 43.70, lng: -79.40, radiusKm: 45 },
  { name: 'Hamilton ON',         lat: 43.24, lng: -79.87, radiusKm: 20 },
  { name: 'Ottawa',              lat: 45.35, lng: -75.72, radiusKm: 30 },
  { name: 'Calgary',             lat: 51.04, lng: -114.08, radiusKm: 35 },
  { name: 'Edmonton',            lat: 53.52, lng: -113.51, radiusKm: 35 },
  { name: 'Winnipeg',            lat: 49.88, lng: -97.14, radiusKm: 30 }
];

const EARTH_KM = 6371;
const D2R = Math.PI / 180;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * D2R;
  const dLng = (lng2 - lng1) * D2R;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(a));
}

/** Nearest metro whose centroid is within its own `radiusKm` of the
 *  given point. Returns null if the point falls outside every metro
 *  (heatmap cells in the middle of nowhere → no name, just count). */
export function nearestMetro(lat: number, lng: number): Metro | null {
  let best: Metro | null = null;
  let bestDist = Infinity;
  for (const m of METROS) {
    const d = haversineKm(lat, lng, m.lat, m.lng);
    if (d <= m.radiusKm && d < bestDist) {
      best = m;
      bestDist = d;
    }
  }
  return best;
}
