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

/** Daily-grain historical weather (for the /timeline year-history
 *  page). One row per calendar day in the requested range. */
export interface DailyWeather {
  /** ISO yyyy-mm-dd. */
  date: string;
  rain_mm: number;
  /** Daily max temperature in °C. Null when the source has no
   *  reading for that day (gaps near the edge of the archive). */
  temp_max_c: number | null;
  temp_min_c: number | null;
}

const histCache = new Map<string, DailyWeather[]>();

/** Open-Meteo's archive goes back to 1940 with ~5 days of latency.
 *  For the most-recent few days we fall back to the forecast API
 *  with past_days set, then merge the two. Returns one row per day
 *  in the requested range, in ascending date order. */
export async function historicalWeather(
  lng: number,
  lat: number,
  startDate: string,
  endDate: string
): Promise<DailyWeather[]> {
  const r = (n: number) => Math.round(n * 10) / 10;
  const cacheKey = `${r(lng)},${r(lat)},${startDate},${endDate}`;
  const hit = histCache.get(cacheKey);
  if (hit) return hit;

  const archiveUrl =
    `https://archive-api.open-meteo.com/v1/archive` +
    `?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}` +
    `&start_date=${startDate}&end_date=${endDate}` +
    `&daily=precipitation_sum,temperature_2m_max,temperature_2m_min` +
    `&timezone=auto`;
  const archiveRes = await fetch(archiveUrl);
  if (!archiveRes.ok) {
    throw new Error(`historical weather fetch ${archiveRes.status}`);
  }
  const archive = (await archiveRes.json()) as {
    daily?: {
      time: string[];
      precipitation_sum: number[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
    };
  };

  // Today's date in the local TZ — the comparison below is a string
  // compare so YYYY-MM-DD ordering is fine.
  const todayIso = new Date().toISOString().slice(0, 10);

  const out: DailyWeather[] = (archive.daily?.time ?? []).map((d, i) => ({
    date: d,
    rain_mm: archive.daily?.precipitation_sum[i] ?? 0,
    temp_max_c: archive.daily?.temperature_2m_max[i] ?? null,
    temp_min_c: archive.daily?.temperature_2m_min[i] ?? null
  }));

  // Patch in the very recent days (archive lags ~5 days) via the
  // forecast endpoint. Cheap if endDate is well in the past — skip.
  if (endDate >= todayIso) {
    const recentUrl =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}` +
      `&past_days=10&forecast_days=1` +
      `&daily=precipitation_sum,temperature_2m_max,temperature_2m_min` +
      `&timezone=auto`;
    try {
      const recentRes = await fetch(recentUrl);
      if (recentRes.ok) {
        const recent = (await recentRes.json()) as typeof archive;
        const seen = new Set(out.map((r) => r.date));
        for (const [i, d] of (recent.daily?.time ?? []).entries()) {
          if (seen.has(d)) continue;
          if (d < startDate || d > endDate) continue;
          out.push({
            date: d,
            rain_mm: recent.daily?.precipitation_sum[i] ?? 0,
            temp_max_c: recent.daily?.temperature_2m_max[i] ?? null,
            temp_min_c: recent.daily?.temperature_2m_min[i] ?? null
          });
        }
        out.sort((a, b) => a.date.localeCompare(b.date));
      }
    } catch {
      // Best-effort patch; the archive part is enough on its own.
    }
  }

  histCache.set(cacheKey, out);
  return out;
}
