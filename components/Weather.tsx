"use client";

import { useEffect, useState } from "react";
import { describeWeather, type WeatherKind } from "@/lib/weatherCodes";
import type { Weather } from "@/lib/types";
import { useHour12, useTemp } from "@/lib/prefs";

// Same family as icons.tsx: 24px grid, 1.75 stroke, round caps.
const base = (size: number) => ({
  width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true,
});
const CLOUD = "M7 18.5h9.5a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 6.6 12 3.25 3.25 0 0 0 7 18.5Z";
const SMALL_CLOUD = "M8.5 19h8a3.5 3.5 0 0 0 .4-6.98 4.8 4.8 0 0 0-9.2 1.06A2.96 2.96 0 0 0 8.5 19Z";

// Pixel art for the pixel themes (Blocks, Inferno, Arcade, Handheld): 16×16, one letter per pixel.
// y sun · m moon · c cloud · e cloud shadow · b rain · w snow. CSS shows these instead of the line icons.
const SUN = [
  "................", ".......yy.......", "..y....yy....y..", "...y........y...", "......yyyy......", ".....yyyyyy.....",
  "....yyyyyyyy....", ".yy.yyyyyyyy.yy.", ".yy.yyyyyyyy.yy.", "....yyyyyyyy....", ".....yyyyyy.....", "......yyyy......",
  "...y........y...", "..y....yy....y..", ".......yy.......", "................",
];
const MOON = [
  "................", "......mmmm......", "....mmmmm.....m.", "...mmmm.........", "..mmmm......m...", "..mmm...........",
  ".mmmm...........", ".mmmm...........", ".mmmm...........", ".mmmmm..........", "..mmmmm.....mm..", "..mmmmmmmmmmm...",
  "...mmmmmmmmm....", "....mmmmmmm.....", "......mmm.......", "................",
];
const PARTLY = [
  "................", "..y..y..y.......", "...yyyyy........", "..yyyyyyy.......", "yyyyyyyyyy......", "..yyyyyccccc....",
  "..yyyyccccccc...", "...ycccccccccc..", "....cccccccccccc", "...ccccccccccccc", "...eeeeeeeeeeeee", "....eeeeeeeeeee.",
  "................", "................", "................", "................",
];
const CLOUD_TOP = ["......cccc......", ".....cccccc.....", "...cccccccccc...", "..cccccccccccc..", ".cccccccccccccc.", ".cccccccccccccc.", ".eeeeeeeeeeeeee.", "..eeeeeeeeeeee.."];
const PX: Record<string, string[]> = {
  "clear-day": SUN,
  "clear-night": MOON,
  "partly-day": PARTLY,
  "partly-night": PARTLY.map((r) => r.replace(/y/g, "m")),
  cloudy: ["................", "................", "................", ...CLOUD_TOP, "................", "................", "................", "................", "................"],
  fog: ["................", "................", "................", "..cccccccccccc..", "................", "................", "cccccccccccccc..", "................", "................", "..cccccccccccccc", "................", "................", ".cccccccccccc...", "................", "................", "................"],
  rain: ["................", ...CLOUD_TOP, "................", "...b....b....b..", "..b....b....b...", "................", "....b....b....b.", "...b....b....b..", "................"],
  drizzle: ["................", ...CLOUD_TOP, "................", "...b.......b....", "................", ".......b.......b", "................", "....b.......b...", "................"],
  snow: ["................", ...CLOUD_TOP, "................", "..w....w....w...", "................", "....w....w....w.", "................", "..w....w....w...", "................"],
  storm: ["................", ...CLOUD_TOP, ".......yy.......", "......yy........", ".....yyyyy......", ".......yy.......", "......yy........", ".....y..........", "................"],
};

/** Merges each row's runs of one color into a single rect. */
function pixels(rows: string[]) {
  const out: React.ReactNode[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      const ch = row[x];
      let w = 1;
      while (row[x + w] === ch) w++;
      if (ch !== ".") out.push(<rect key={`${x}-${y}`} x={x} y={y} width={w} height={1} className={`px-${ch}`} />);
      x += w;
    }
  });
  return out;
}
const PX_ART = Object.fromEntries(Object.entries(PX).map(([k, rows]) => [k, pixels(rows)]));

const pxKey = (kind: WeatherKind, day: boolean) =>
  kind === "clear" || kind === "partly" ? `${kind}-${day ? "day" : "night"}` : kind in PX ? kind : "cloudy";

export function WeatherIcon({ kind, day = true, size = 18 }: { kind: WeatherKind; day?: boolean; size?: number }) {
  const icon = (cls: string, vec: React.ReactNode) => (
    <svg {...base(size)} className={`wx ${cls}`}>
      <g className="wx-vec">{vec}</g>
      <svg className="wx-px" x="0" y="0" width="24" height="24" viewBox="0 0 16 16" stroke="none" shapeRendering="crispEdges">
        {PX_ART[pxKey(kind, day)]}
      </svg>
    </svg>
  );
  const sky = day ? (
    <g className="wx-sun">
      <circle cx="9" cy="9" r="3.2" />
      <path d="M9 2.5v1.3M9 14.2v1.3M2.5 9h1.3M14.2 9h1.3M4.4 4.4l.9.9M12.7 12.7l.9.9M4.4 13.6l.9-.9M12.7 5.3l.9-.9" />
    </g>
  ) : (
    <path className="wx-moon" d="M13.5 10.6A5 5 0 0 1 7.4 4.5a5 5 0 1 0 6.1 6.1Z" />
  );
  switch (kind) {
    case "clear":
      return day
        ? icon("wx-clear", <>
            <circle cx="12" cy="12" r="4.2" />
            <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
          </>)
        : icon("wx-night", <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />);
    case "partly":
      return icon(day ? "wx-partly" : "wx-night", <>
        {sky}
        <path d={SMALL_CLOUD} className="wx-cloud" />
      </>);
    case "fog":
      return icon("wx-cloudy", <path d="M4 9h16M3 13h18M5 17h14M8 21h8" />);
    case "drizzle":
    case "rain":
      return icon("wx-rain", <>
        <path d="M7 15h9.5a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 6.6 8.5 3.25 3.25 0 0 0 7 15Z" className="wx-cloud" />
        <path d={kind === "rain" ? "M8 18l-1 3M12 18l-1 3M16 18l-1 3" : "M8.5 18.5v.5M12 19.5v.5M15.5 18.5v.5"} />
      </>);
    case "snow":
      return icon("wx-snow", <>
        <path d="M7 15h9.5a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 6.6 8.5 3.25 3.25 0 0 0 7 15Z" className="wx-cloud" />
        <path d="M8 18.5h.01M12 20h.01M16 18.5h.01M10 21.5h.01M14 21.5h.01" strokeWidth={2.4} />
      </>);
    case "storm":
      return icon("wx-storm", <>
        <path d="M7 15h9.5a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 6.6 8.5 3.25 3.25 0 0 0 7 15Z" className="wx-cloud" />
        <path d="m12.5 15-2 3.5h3l-2 3.5" />
      </>);
    default:
      return icon("wx-cloudy", <path d={CLOUD} />);
  }
}

/** Clock for another time zone. Renders nothing until mounted, since server and browser times differ. */
export function useLocalTime(tz?: string, opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" }) {
  const hour12 = useHour12();
  if (opts.hour) opts = { ...opts, hour12 };
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);
  if (!now) return null;
  try {
    return new Intl.DateTimeFormat(undefined, { ...opts, timeZone: tz }).format(now);
  } catch {
    return new Intl.DateTimeFormat(undefined, opts).format(now);
  }
}

/** "[icon] 68°F Partly cloudy · H 72° L 55° · 3:42 PM" under a card's name. */
export function LocalConditions({ weather, tz, compact = false, iconSize }: { weather?: Weather; tz?: string; compact?: boolean; iconSize?: number }) {
  const time = useLocalTime(tz);
  const temp = useTemp();
  if (!weather && !time) return null;
  const t = (v: number) => (weather ? temp(v, weather.unit).value : v);
  const unit = weather ? temp(weather.temp, weather.unit).unit : "F";
  const wx = weather ? describeWeather(weather.code) : null;
  return (
    <div className="local">
      {weather && wx && (
        <span className="local-wx" title={`${wx.label}${weather.high != null ? `, high ${t(weather.high)}°, low ${t(weather.low!)}°` : ""}`}>
          <WeatherIcon kind={wx.kind} day={weather.is_day} size={iconSize ?? (compact ? 16 : 18)} />
          <span className="local-temp mono">
            {t(weather.temp)}°{unit}
          </span>
          <span className="local-label">{wx.label}</span>
          {!compact && weather.high != null && (
            <span className="local-hl mono">
              H {t(weather.high)}°&nbsp;&nbsp;L {weather.low != null ? t(weather.low) : "–"}°
            </span>
          )}
        </span>
      )}
      {time && (
        <span className="local-time mono" title="Local time there">
          {time}
        </span>
      )}
    </div>
  );
}
