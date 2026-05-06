// Recent-rain lookup via Open-Meteo. Phase: weather tier 1 (recent
// rain badge for mushroom pins). No API key, no backend cache —
// browser fetches direct, results memo'd in a per-tab Map keyed on
// the rounded grid cell so a pan over the same area does not re-hit
// the API.
//
// License: Open-Meteo data is CC BY 4.0 (attribution lives on the
// /sources page).

export interface RecentRain {
  /** Total precipitation in millimeters across the lookback window. */
  total_mm: number;
  /** Most recent daily totals, oldest first. */
  daily_mm: Array<{ date: string; mm: number }>;
}

const cache = new Map<string, RecentRain>();
const MAX_CACHE = 200;

function cellKey(lng: number, lat: number, days: number): string {
  // Round to 0.1° (~11 km at mid-latitudes) so nearby pins share a
  // cache entry. Open-Meteo's grid is ~11km anyway, so finer keys
  // would just multiply API calls without changing the answer.
  const r = (n: number) => Math.round(n * 10) / 10;
  return `${r(lng)},${r(lat)},${days}`;
}

/** Fetch the last `days` days of rainfall at the given coords. days
 *  defaults to 7 — the typical mushroom-flush window. */
export async function recentRain(
  lng: number,
  lat: number,
  days: number = 7
): Promise<RecentRain> {
  const key = cellKey(lng, lat, days);
  const hit = cache.get(key);
  if (hit) return hit;
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}` +
    `&past_days=${days}&forecast_days=1` +
    `&daily=precipitation_sum&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`weather fetch ${res.status}`);
  const body = (await res.json()) as {
    daily?: { time: string[]; precipitation_sum: number[] };
  };
  const time = body.daily?.time ?? [];
  const precip = body.daily?.precipitation_sum ?? [];
  // Drop today's row (still accumulating) so the headline number is
  // a clean "last N completed days" total.
  const daily_mm = time
    .map((d, i) => ({ date: d, mm: precip[i] ?? 0 }))
    .slice(0, -1);
  const total_mm = daily_mm.reduce((a, b) => a + b.mm, 0);
  const result: RecentRain = { total_mm, daily_mm };
  cache.set(key, result);
  if (cache.size > MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  return result;
}

/** Pretty-print mm as either "0.5 in" (US convention since most
 *  forageable plants live in the US for v1) or "12 mm" if the user
 *  prefers metric — keeping it simple at "in" for now; a future
 *  setting can flip. */
export function formatMm(mm: number): string {
  const inches = mm / 25.4;
  return `${inches.toFixed(1)}"`;
}
