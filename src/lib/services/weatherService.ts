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

/** Daily weather across a multi-year span. We call Open-Meteo
 *  per-year because earlier multi-year requests appeared to come
 *  back partially populated (most of each year's days had null
 *  values from the archive endpoint, leaving the rendered chart
 *  mostly empty). Per-year calls are reliable and the cache means
 *  the only repeat cost is during the first paint.
 *
 *  Endpoint mix:
 *  - For complete past years, archive-api (ERA5 reanalysis, ~5-day
 *    latency, 1940-present).
 *  - For the current (in-progress) year, the regular forecast
 *    endpoint with past_days set so we get up-to-yesterday data
 *    even though the archive lags. */
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

  const startYear = parseInt(startDate.slice(0, 4), 10);
  const endYear = parseInt(endDate.slice(0, 4), 10);
  const todayIso = new Date().toISOString().slice(0, 10);
  const currentYear = parseInt(todayIso.slice(0, 4), 10);

  // ONE multi-year archive call per region — Open-Meteo accepts long
  // ranges in a single request and rate-limits aggressive bursts
  // (we hit 429s when fanning out 5 years × N regions in parallel).
  // The archive endpoint lags ~5 days behind today, so for the
  // current year we patch the trailing days from the forecast
  // endpoint.
  const archiveEnd =
    endDate >= todayIso
      ? (() => {
          // Cap archive end at ~6 days ago to stay within ERA5 latency.
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - 6);
          const cutoffIso = cutoff.toISOString().slice(0, 10);
          return cutoffIso < startDate ? startDate : cutoffIso;
        })()
      : endDate;

  const all: DailyWeather[] = [];
  try {
    if (archiveEnd >= startDate) {
      const rows = await fetchArchiveYear(lng, lat, startDate, archiveEnd);
      all.push(...rows);
    }
  } catch (e) {
    console.warn('[weather] archive fetch failed:', e);
  }

  // Patch trailing days (today minus archive lag → today) from the
  // forecast endpoint, but only when the requested range reaches
  // close to today.
  if (endDate >= todayIso || archiveEnd < endDate) {
    const forecastStart = (() => {
      const d = new Date(archiveEnd);
      d.setDate(d.getDate() + 1);
      const iso = d.toISOString().slice(0, 10);
      return iso > startDate ? iso : startDate;
    })();
    const forecastEnd = endDate > todayIso ? todayIso : endDate;
    if (forecastStart <= forecastEnd) {
      try {
        const url =
          `https://api.open-meteo.com/v1/forecast` +
          `?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}` +
          `&start_date=${forecastStart}&end_date=${forecastEnd}` +
          `&daily=precipitation_sum,temperature_2m_max,temperature_2m_min` +
          `&timezone=auto`;
        const res = await fetch(url);
        if (res.ok) {
          const body = (await res.json()) as {
            daily?: {
              time?: string[];
              precipitation_sum?: (number | null)[];
              temperature_2m_max?: (number | null)[];
              temperature_2m_min?: (number | null)[];
            };
          };
          const time = body.daily?.time ?? [];
          const seen = new Set(all.map((r) => r.date));
          for (const [i, d] of time.entries()) {
            if (seen.has(d)) continue;
            if (d < forecastStart || d > forecastEnd) continue;
            all.push({
              date: d,
              rain_mm: body.daily?.precipitation_sum?.[i] ?? 0,
              temp_max_c: body.daily?.temperature_2m_max?.[i] ?? null,
              temp_min_c: body.daily?.temperature_2m_min?.[i] ?? null
            });
          }
        }
      } catch (e) {
        console.warn('[weather] forecast fetch failed:', e);
      }
    }
  }

  all.sort((a, b) => a.date.localeCompare(b.date));
  histCache.set(cacheKey, all);
  return all;
}

async function fetchArchiveYear(
  lng: number,
  lat: number,
  startDate: string,
  endDate: string
): Promise<DailyWeather[]> {
  const url =
    `https://archive-api.open-meteo.com/v1/archive` +
    `?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}` +
    `&start_date=${startDate}&end_date=${endDate}` +
    `&daily=precipitation_sum,temperature_2m_max,temperature_2m_min` +
    `&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`archive ${res.status}`);
  const body = (await res.json()) as {
    daily?: {
      time?: string[];
      precipitation_sum?: (number | null)[];
      temperature_2m_max?: (number | null)[];
      temperature_2m_min?: (number | null)[];
    };
    error?: boolean;
    reason?: string;
  };
  if (body.error) throw new Error(body.reason ?? 'archive returned error');
  const time = body.daily?.time ?? [];
  return time.map((d, i) => ({
    date: d,
    rain_mm: body.daily?.precipitation_sum?.[i] ?? 0,
    temp_max_c: body.daily?.temperature_2m_max?.[i] ?? null,
    temp_min_c: body.daily?.temperature_2m_min?.[i] ?? null
  }));
}

/** Current-year fetch. Forecast endpoint with past_days walks back
 *  from today; we then trim to the requested window. The forecast
 *  endpoint caps past_days at ~92, so for a year that's still
 *  within its first ~3 months this works. For years deeper in we
 *  fall back to the archive endpoint via fetchArchiveYear. */
async function fetchForecastYear(
  lng: number,
  lat: number,
  startDate: string,
  endDate: string
): Promise<DailyWeather[]> {
  const today = new Date().toISOString().slice(0, 10);
  const earliestForecast = new Date();
  earliestForecast.setDate(earliestForecast.getDate() - 92);
  const earliestForecastIso = earliestForecast.toISOString().slice(0, 10);
  // If startDate is older than what forecast can reach, split the
  // year between archive (older portion) and forecast (recent).
  let archivePart: DailyWeather[] = [];
  if (startDate < earliestForecastIso) {
    const archiveEnd = new Date(earliestForecast);
    archiveEnd.setDate(archiveEnd.getDate() - 1);
    const archiveEndIso = archiveEnd.toISOString().slice(0, 10);
    archivePart = await fetchArchiveYear(lng, lat, startDate, archiveEndIso);
  }
  const forecastStart = startDate < earliestForecastIso ? earliestForecastIso : startDate;
  const forecastEnd = endDate > today ? today : endDate;
  let forecastPart: DailyWeather[] = [];
  if (forecastStart <= forecastEnd) {
    // Open-Meteo rejects past_days + explicit start/end together
    // (returns 400). Use start/end only — past_days is implied by
    // the date range itself.
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}` +
      `&start_date=${forecastStart}&end_date=${forecastEnd}` +
      `&daily=precipitation_sum,temperature_2m_max,temperature_2m_min` +
      `&timezone=auto`;
    const res = await fetch(url);
    if (res.ok) {
      const body = (await res.json()) as {
        daily?: {
          time?: string[];
          precipitation_sum?: (number | null)[];
          temperature_2m_max?: (number | null)[];
          temperature_2m_min?: (number | null)[];
        };
      };
      const time = body.daily?.time ?? [];
      forecastPart = time
        .map((d, i) => ({
          date: d,
          rain_mm: body.daily?.precipitation_sum?.[i] ?? 0,
          temp_max_c: body.daily?.temperature_2m_max?.[i] ?? null,
          temp_min_c: body.daily?.temperature_2m_min?.[i] ?? null
        }))
        .filter((r) => r.date >= forecastStart && r.date <= forecastEnd);
    }
  }
  // Merge, dedupe by date (forecast wins because it's fresher), sort.
  const byDate = new Map<string, DailyWeather>();
  for (const r of archivePart) byDate.set(r.date, r);
  for (const r of forecastPart) byDate.set(r.date, r);
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}
