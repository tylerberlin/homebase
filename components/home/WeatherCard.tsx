import type { Forecast } from "@/lib/home/forecast";
import type { WxLocation } from "@/lib/useWeatherLocation";
import { HomeIcon, PinIcon } from "../icons";
import { describeWeather } from "@/lib/weatherCodes";
import { WeatherIcon } from "../Weather";
import { useHour12 } from "@/lib/prefs";

// Now, the next 24 hours and the week for home, plus any National Weather Service alerts.

// Open-Meteo gives local times as "2026-10-27T15:00"; read the digits rather than re-zoning them.
const hourLabel = (t: string, i: number, hour12: boolean) => {
  if (i === 0) return "Now";
  const h = Number(t.slice(11, 13));
  return hour12 ? `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}` : `${t.slice(11, 13)}:00`;
};
const dayLabel = (d: string, i: number) =>
  i === 0 ? "Today" : new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" });
const clock = (t: string, hour12: boolean) => {
  const h = Number(t.slice(11, 13));
  return hour12 ? `${h % 12 || 12}:${t.slice(14, 16)} ${h < 12 ? "AM" : "PM"}` : t.slice(11, 16);
};

function Where({ w, loc }: { w?: Forecast; loc: WxLocation }) {
  const locating = loc.mode === "here" && (!w?.here || loc.status === "locating");
  return (
    <div className="wx-head">
      <div className="wx-place">
        {w?.here ? <PinIcon /> : <HomeIcon />}
        {locating ? "Finding you…" : (w?.place ?? "")}
      </div>
      {loc.supported && (
        <div className="chips" role="group" aria-label="Weather location">
          {(["home", "here"] as const).map((m) => (
            <button key={m} type="button" className={`chip ${loc.mode === m ? "on" : ""}`} aria-pressed={loc.mode === m} onClick={() => loc.setMode(m)}>
              {m === "home" ? "Home" : "Here"}
            </button>
          ))}
        </div>
      )}
      {loc.status === "denied" && <div className="wx-note">Location is blocked for this site in your browser settings.</div>}
      {loc.status === "unavailable" && loc.mode === "here" && <div className="wx-note">Couldn&apos;t get your location; showing the last one.</div>}
    </div>
  );
}

export default function WeatherCard({ w, loc }: { w?: Forecast; loc: WxLocation }) {
  const hour12 = useHour12();
  if (!w)
    return (
      <section className="card home-card wx-card skeleton-card" aria-busy="true">
        <Where w={w} loc={loc} />
      </section>
    );
  const now = describeWeather(w.now.code);
  const lo = Math.min(...w.daily.map((d) => d.low));
  const hi = Math.max(...w.daily.map((d) => d.high));
  const span = Math.max(1, hi - lo);
  const today = w.daily[0];
  return (
    <section className="card home-card wx-card" id="weather">
      <Where w={w} loc={loc} />
      <div className="wx-now">
        <WeatherIcon kind={now.kind} day={w.now.isDay} size={56} />
        <div>
          <div className="wx-temp">
            {w.now.temp}°<small>{w.unit}</small>
          </div>
          <div className="wx-label">{now.label}</div>
        </div>
        <div className="wx-facts">
          {today && (
            <div>
              H {today.high}° · L {today.low}°
            </div>
          )}
          <div>Feels {w.now.feels}° · Wind {w.now.wind} {w.unit === "C" ? "km/h" : "mph"}</div>
          <div>Humidity {w.now.humidity}%</div>
        </div>
      </div>

      {w.alerts.map((a, i) => (
        <div key={i} className={`wx-alert ${a.severity === "Extreme" || a.severity === "Severe" ? "bad" : "warn"}`} role="alert">
          <strong>{a.event}</strong> {a.headline.replace(a.event, "").replace(/^ (issued )?/, "")}
        </div>
      ))}

      <div className="wx-hours" role="list" aria-label="Next 24 hours">
        {w.hourly.map((h, i) => (
          <div key={h.time} className="wx-hour" role="listitem">
            <div className="wx-hour-t">{hourLabel(h.time, i, hour12)}</div>
            <WeatherIcon kind={describeWeather(h.code).kind} day={h.isDay} size={22} />
            <div className="wx-hour-v mono">{h.temp}°</div>
            <div className="wx-rain mono">{h.rain >= 20 ? `${h.rain}%` : " "}</div>
          </div>
        ))}
      </div>

      <ul className="wx-days">
        {w.daily.map((d, i) => (
          <li key={d.date} className="wx-day">
            <span className="wx-day-name">{dayLabel(d.date, i)}</span>
            <WeatherIcon kind={describeWeather(d.code).kind} size={20} />
            <span className="wx-rain mono">{d.rain >= 20 ? `${d.rain}%` : ""}</span>
            <span className="wx-lo mono">{d.low}°</span>
            <span className="wx-range" aria-hidden="true">
              <i style={{ left: `${((d.low - lo) / span) * 100}%`, right: `${100 - ((d.high - lo) / span) * 100}%` }} />
            </span>
            <span className="wx-hi mono">{d.high}°</span>
          </li>
        ))}
      </ul>
      {today && (
        <div className="wx-sun">
          Sunrise {clock(today.sunrise, hour12)} · Sunset {clock(today.sunset, hour12)}
        </div>
      )}
    </section>
  );
}
