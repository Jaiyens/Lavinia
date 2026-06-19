// Best-effort weather for the farm's location, via Open-Meteo (free, no API key, no signup).
// This is the app's first intentional external call on the dashboard surface, so it is built to
// fail soft: a timeout or any error returns null and the UI simply hides the widget. It never
// blocks the page and never throws. The farm center is the average of its located meters.

import type { MeterView } from "@/lib/dashboard/load";

const LA_TZ = "America/Los_Angeles";
const TIMEOUT_MS = 2500;

export type WeatherDay = {
  /** ISO date (YYYY-MM-DD), local to the farm. */
  date: string;
  code: number;
  maxF: number;
  minF: number;
};

export type FarmWeather = {
  current: { tempF: number; code: number };
  days: WeatherDay[];
};

/** Average lat/lng of the farm's located meters, or null when none have a usable location. */
export function farmCenter(meters: readonly MeterView[]): { lat: number; lng: number } | null {
  let sumLat = 0;
  let sumLng = 0;
  let n = 0;
  for (const m of meters) {
    const { latitude: lat, longitude: lng } = m;
    if (
      lat !== null &&
      lng !== null &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180 &&
      !(lat === 0 && lng === 0)
    ) {
      sumLat += lat;
      sumLng += lng;
      n += 1;
    }
  }
  if (n === 0) return null;
  return { lat: sumLat / n, lng: sumLng / n };
}

type OpenMeteoResponse = {
  current?: { temperature_2m?: number; weather_code?: number };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
  };
};

/**
 * Fetch current conditions + a short forecast for the farm center. Returns null on no location,
 * timeout, network error, or a malformed response - the caller hides the widget when null.
 * Cached for 30 minutes (Next fetch cache) so navigations do not re-hit the API.
 */
export async function getFarmWeather(meters: readonly MeterView[]): Promise<FarmWeather | null> {
  const center = farmCenter(meters);
  if (center === null) return null;

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${center.lat.toFixed(4)}` +
    `&longitude=${center.lng.toFixed(4)}` +
    `&current=temperature_2m,weather_code` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
    `&temperature_unit=fahrenheit&timezone=${encodeURIComponent(LA_TZ)}&forecast_days=5`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, next: { revalidate: 1800 } });
    if (!res.ok) return null;
    const data = (await res.json()) as OpenMeteoResponse;
    const tempF = data.current?.temperature_2m;
    const code = data.current?.weather_code;
    if (typeof tempF !== "number" || typeof code !== "number") return null;

    const d = data.daily;
    const days: WeatherDay[] = [];
    if (d?.time && d.weather_code && d.temperature_2m_max && d.temperature_2m_min) {
      for (let i = 0; i < d.time.length; i += 1) {
        const date = d.time[i];
        const dc = d.weather_code[i];
        const mx = d.temperature_2m_max[i];
        const mn = d.temperature_2m_min[i];
        if (date && typeof dc === "number" && typeof mx === "number" && typeof mn === "number") {
          days.push({ date, code: dc, maxF: mx, minF: mn });
        }
      }
    }
    return { current: { tempF, code }, days };
  } catch {
    // Offline, timeout, or DNS failure (a farmer in a truck, or a hermetic test). Hide, never throw.
    return null;
  } finally {
    clearTimeout(timer);
  }
}
