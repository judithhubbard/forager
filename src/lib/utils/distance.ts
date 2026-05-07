// Great-circle distance via the haversine formula. Cheap to compute
// client-side; consolidating the three near-identical copies that
// were drifting across pinService, recording.ts, and trackService.ts.

const EARTH_RADIUS_M = 6371000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Distance in meters between two lat/lng pairs. */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/** Object-shape variant for callers that already have point objects. */
export function haversineBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  return haversineMeters(a.lat, a.lng, b.lat, b.lng);
}
