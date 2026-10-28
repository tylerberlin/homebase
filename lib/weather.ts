import { config } from "./config";
import type { Weather } from "./types";

// Current conditions from Open-Meteo (free, no key). Cached for 10 minutes per location.

const TTL = 10 * 60 * 1000;
const cache = new Map<string, { at: number; w: Weather }>();

export async function weather(lat: number, lon: number): Promise<Weather | undefined> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
  const key = `${lat},${lon}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.w;
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min` +
      `&forecast_days=1&timezone=auto&temperature_unit=${config.weatherUnit}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(6000), cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    const w: Weather = {
      temp: Math.round(d.current.temperature_2m),
      code: d.current.weather_code,
      is_day: d.current.is_day === 1,
      high: d.daily?.temperature_2m_max?.[0] != null ? Math.round(d.daily.temperature_2m_max[0]) : undefined,
      low: d.daily?.temperature_2m_min?.[0] != null ? Math.round(d.daily.temperature_2m_min[0]) : undefined,
      unit: config.weatherUnit === "celsius" ? "C" : "F",
    };
    cache.set(key, { at: Date.now(), w });
    return w;
  } catch {
    return hit?.w; // keep showing the last reading through a blip
  }
}
