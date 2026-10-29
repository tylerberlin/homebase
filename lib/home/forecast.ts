import { config } from "../config";
import { cached, getJson, UA } from "./cache";

// Full forecast: now, next 24 hours, next 7 days, plus active National Weather Service alerts
// (US only). For home (NAS's location) by default, or for wherever the viewer is when
// the page passes rounded coordinates. Open-Meteo, NWS and OpenStreetMap are free and keyless.

export type Forecast = {
  place: string;
  here: boolean; // true when this is the viewer's location rather than home
  unit: "F" | "C";
  now: { temp: number; feels: number; humidity: number; wind: number; code: number; isDay: boolean };
  hourly: { time: string; temp: number; code: number; rain: number; isDay: boolean }[];
  daily: { date: string; high: number; low: number; code: number; rain: number; sunrise: string; sunset: string }[];
  alerts: { event: string; headline: string; severity: string; ends?: string }[];
};

type OM = {
  current: { temperature_2m: number; apparent_temperature: number; relative_humidity_2m: number; wind_speed_10m: number; weather_code: number; is_day: number };
  hourly: { time: string[]; temperature_2m: number[]; weather_code: number[]; precipitation_probability: number[]; is_day: number[] };
  daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: number[]; sunrise: string[]; sunset: string[] };
};

/** "Seattle, WA" from coordinates (cached for a day per spot). */
async function placeName(lat: number, lon: number): Promise<string> {
  const name = await cached(`place:${lat},${lon}`, 24 * 3600 * 1000, async () => {
    const d = await getJson<{ address?: Record<string, string> }>(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10`,
    );
    const a = d.address ?? {};
    const town = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.county ?? "";
    const region = a.country_code === "us" ? (a["ISO3166-2-lvl4"] ?? "").replace(/^US-/, "") : (a.country ?? "");
    return [town, region].filter(Boolean).join(", ");
  });
  return name || "Your location";
}

export async function forecast(at?: { lat: number; lon: number }, unit: "F" | "C" = "F"): Promise<Forecast | undefined> {
  const here = !!at;
  const { lat, lon } = at ?? config.homePlace;
  const f = unit === "C" ? "celsius" : "fahrenheit";
  return cached(`forecast:${lat},${lon}:${f}`, 10 * 60 * 1000, async () => {
    const om = await getJson<OM>(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day` +
        `&hourly=temperature_2m,weather_code,precipitation_probability,is_day&forecast_hours=24` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&forecast_days=7` +
        `&timezone=auto&temperature_unit=${f}&wind_speed_unit=${f === "celsius" ? "kmh" : "mph"}`,
    );
    let alerts: Forecast["alerts"] = [];
    try {
      const nws = await getJson<{ features: { properties: { event: string; headline: string; severity: string; ends?: string; expires?: string } }[] }>(
        `https://api.weather.gov/alerts/active?point=${lat},${lon}`,
        { "User-Agent": `${UA} homebase`, Accept: "application/geo+json" },
      );
      alerts = nws.features.map(({ properties: p }) => ({ event: p.event, headline: p.headline, severity: p.severity, ends: p.ends ?? p.expires }));
    } catch {}
    const r = Math.round;
    return {
      place: here ? await placeName(lat, lon) : config.homePlace.location,
      here,
      unit: f === "celsius" ? "C" : "F",
      now: {
        temp: r(om.current.temperature_2m),
        feels: r(om.current.apparent_temperature),
        humidity: r(om.current.relative_humidity_2m),
        wind: r(om.current.wind_speed_10m),
        code: om.current.weather_code,
        isDay: om.current.is_day === 1,
      },
      hourly: om.hourly.time.map((time, i) => ({
        time,
        temp: r(om.hourly.temperature_2m[i]),
        code: om.hourly.weather_code[i],
        rain: om.hourly.precipitation_probability[i] ?? 0,
        isDay: om.hourly.is_day[i] === 1,
      })),
      daily: om.daily.time.map((date, i) => ({
        date,
        high: r(om.daily.temperature_2m_max[i]),
        low: r(om.daily.temperature_2m_min[i]),
        code: om.daily.weather_code[i],
        rain: om.daily.precipitation_probability_max[i] ?? 0,
        sunrise: om.daily.sunrise[i],
        sunset: om.daily.sunset[i],
      })),
      alerts,
    } satisfies Forecast;
  });
}
