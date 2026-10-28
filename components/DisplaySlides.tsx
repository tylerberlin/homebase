"use client";

import { useEffect, useRef, useState } from "react";
import type { CalendarData } from "@/lib/calendar";
import type { Forecast } from "@/lib/home/forecast";
import type { Quote } from "@/lib/home/markets";
import type { Headline } from "@/lib/home/news";
import type { Game, TeamInfo } from "@/lib/home/sports";
import { fmtTime, useHour12 } from "@/lib/prefs";
import type { Status } from "@/lib/types";
import { countdown, eventTimes } from "@/lib/useCalendar";
import { ago } from "@/lib/useHome";
import { describeWeather } from "@/lib/weatherCodes";
import { GrassBlock } from "./Minecraft";
import { WeatherIcon } from "./Weather";

// The room display's rotating card: one big slide at a time (weather, calendar, sports, stocks,
// news, Minecraft, servers) that flips to the next every few seconds. Swipe, the arrow keys or
// the dots change it by hand; the bar along the bottom shows when the next flip comes.

export type Slide = { id: string; label: string; node: React.ReactNode };

export function Rotator({ slides, every }: { slides: Slide[]; every: number }) {
  const [current, setCurrent] = useState(slides[0]?.id);
  const [leaving, setLeaving] = useState<{ id: string; dir: 1 | -1 } | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const idx = Math.max(0, slides.findIndex((s) => s.id === current));
  const slide = slides[idx];
  const latest = useRef({ slides, idx });
  latest.current = { slides, idx };

  const go = (by: 1 | -1, to?: number) => {
    const { slides: list, idx: i } = latest.current;
    if (list.length < 2) return;
    const next = to ?? (i + by + list.length) % list.length;
    if (next === i) return;
    setLeaving({ id: list[i].id, dir: by });
    setDir(by);
    setCurrent(list[next].id);
  };

  // Advance on a timer; any manual change restarts the count.
  useEffect(() => {
    if (slides.length < 2) return;
    const t = setTimeout(() => go(1), every * 1000);
    return () => clearTimeout(t);
  }, [current, every, slides.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setLeaving(null), 1000); // after both halves of the flip (see .rot-slide in globals.css)
    return () => clearTimeout(t);
  }, [leaving]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const swipe = useRef<{ x: number; y: number } | null>(null);
  if (!slide) return null;
  const old = leaving && slides.find((s) => s.id === leaving.id);

  return (
    <section
      className="rot"
      aria-roledescription="carousel"
      aria-label="Rotating cards"
      onPointerDown={(e) => (swipe.current = { x: e.clientX, y: e.clientY })}
      onPointerUp={(e) => {
        const s = swipe.current;
        swipe.current = null;
        if (!s) return;
        const dx = e.clientX - s.x;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - s.y)) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="rot-stage">
        {old && (
          <div key={`out-${old.id}`} className="rot-slide out" style={{ "--dir": leaving!.dir } as React.CSSProperties} aria-hidden="true">
            {old.node}
          </div>
        )}
        <div
          key={slide.id}
          className={`rot-slide ${leaving ? "in" : ""}`}
          style={{ "--dir": dir } as React.CSSProperties}
          role="group"
          aria-roledescription="slide"
          aria-label={`${slide.label}, ${idx + 1} of ${slides.length}`}
        >
          {slide.node}
        </div>
      </div>
      {slides.length > 1 && (
        <div className="rot-nav">
          {slides.map((s, i) => (
            <button key={s.id} type="button" className={`rot-dot ${i === idx ? "on" : ""}`} aria-label={`Show ${s.label}`} aria-current={i === idx} onClick={() => go(i > idx ? 1 : -1, i)}>
              <span className="rot-dot-label">{s.label}</span>
              {i === idx && <i key={`${s.id}-${current}`} style={{ animationDuration: `${every}s` }} />}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

// ---------- slides

const Head = ({ title, sub }: { title: string; sub?: React.ReactNode }) => (
  <header className="sl-head">
    <span className="sl-title">{title}</span>
    {sub && <span className="sl-sub">{sub}</span>}
  </header>
);

export function WeatherSlide({ w }: { w: Forecast }) {
  const hour12 = useHour12();
  const now = describeWeather(w.now.code);
  const today = w.daily[0];
  const hours = w.hourly.filter((_, i) => i % 3 === 0).slice(0, 8);
  const label = (t: string, i: number) => {
    if (i === 0) return "Now";
    const h = Number(t.slice(11, 13));
    return hour12 ? `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}` : `${t.slice(11, 13)}:00`;
  };
  return (
    <div className="card sl sl-weather">
      <Head title="Weather" sub={w.place} />
      <div className="sl-wx-main">
        <div className="sl-wx-now">
          <WeatherIcon kind={now.kind} day={w.now.isDay} size={160} />
          <div>
            <div className="sl-wx-temp">
              {w.now.temp}°<small>{w.unit}</small>
            </div>
            <div className="sl-wx-label">{now.label}</div>
            {today && (
              <div className="sl-wx-facts mono">
                H {today.high}° · L {today.low}° · Feels {w.now.feels}°
              </div>
            )}
          </div>
        </div>
        <ul className="sl-wx-days">
          {w.daily.slice(0, 5).map((d, i) => (
            <li key={d.date}>
              <span>{i === 0 ? "Today" : new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })}</span>
              <WeatherIcon kind={describeWeather(d.code).kind} size={44} />
              <span className="mono">{d.rain >= 20 ? `${d.rain}%` : ""}</span>
              <span className="mono sl-dim">{d.low}°</span>
              <span className="mono">{d.high}°</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="sl-wx-hours">
        {hours.map((h, i) => (
          <div key={h.time}>
            <span>{label(h.time, i * 3)}</span>
            <WeatherIcon kind={describeWeather(h.code).kind} day={h.isDay} size={40} />
            <span className="mono">{h.temp}°</span>
          </div>
        ))}
      </div>
      {w.alerts[0] && <div className="sl-alert">{w.alerts[0].event}</div>}
    </div>
  );
}

export function CalendarSlide({ data, now }: { data: CalendarData; now: number }) {
  const hour12 = useHour12();
  const events = data.events.filter((e) => eventTimes(e).end.getTime() > now).slice(0, 6);
  const today = new Date(now).setHours(0, 0, 0, 0);
  const day = (d: Date) => {
    const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - today) / 86400000);
    return diff <= 0 ? "Today" : diff === 1 ? "Tomorrow" : d.toLocaleDateString(undefined, { weekday: "long" });
  };
  return (
    <div className="card sl sl-cal">
      <Head title="Upcoming" />
      <ul className="sl-cal-list">
        {events.map((e, i) => {
          const { start } = eventTimes(e);
          const soon = countdown(e, now);
          return (
            <li key={`${e.title}-${e.start}-${i}`}>
              <span className="sl-cal-day">{day(start)}</span>
              <span className="sl-cal-time mono">{e.allDay ? "All day" : fmtTime(start, hour12)}</span>
              <span className="sl-cal-title">
                <span className="cal-dot" style={{ background: e.color }} />
                {e.title}
              </span>
              <span className={`sl-cal-soon ${soon === "now" ? "now" : ""}`}>{soon ?? ""}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const vs = (g: Game) => `${g.home ? "vs" : "@"} ${g.opponent}`;

export function SportsSlide({ teams, now }: { teams: TeamInfo[]; now: number }) {
  const hour12 = useHour12();
  const when = (iso: string) => {
    const d = new Date(iso);
    const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86400000);
    const t = fmtTime(d, hour12);
    return days === 0 ? `Today ${t}` : days === 1 ? `Tomorrow ${t}` : days < 7 ? `${d.toLocaleDateString(undefined, { weekday: "short" })} ${t}` : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };
  const rank = (t: TeamInfo) => (t.live ? 0 : t.next ? 1 + new Date(t.next.date).getTime() / 1e13 : 3);
  const sorted = [...teams].sort((a, b) => rank(a) - rank(b)).slice(0, 8);
  return (
    <div className="card sl sl-sports">
      <Head title="Sports" />
      <ul className="sl-teams">
        {sorted.map((t) => (
          <li key={t.id} className={t.live ? "live" : ""}>
            {t.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="team-logo" src={t.logo} alt="" width={64} height={64} />
            ) : (
              <span className="team-logo team-logo-text">{t.short.slice(0, 3)}</span>
            )}
            <span className="sl-team-main">
              <span className="sl-team-name">{t.short}</span>
              <span className="sl-team-sub mono">
                {t.record}
                {t.last && !t.live && t.last.us != null && (
                  <span className={t.last.won ? "won" : "lost"}>
                    {" "}
                    · {t.last.won ? "W" : "L"} {t.last.us}–{t.last.them}
                  </span>
                )}
              </span>
            </span>
            <span className="sl-team-next">
              {t.live ? (
                <>
                  <span className="sl-live">
                    <span className="dot live bad" /> {t.live.us ?? 0}–{t.live.them ?? 0}
                  </span>
                  <span className="sl-dim">{vs(t.live)} · {t.live.detail}</span>
                </>
              ) : t.next ? (
                <>
                  <span>{vs(t.next)}</span>
                  <span className="sl-dim">{when(t.next.date)}</span>
                </>
              ) : (
                <span className="sl-dim">Season over</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Spark({ values, up }: { values: number[]; up: boolean }) {
  const w = 160, h = 48, n = values.length;
  if (n < 2) return <svg className="sl-spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true" />;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (n - 1)) * w).toFixed(1)},${(h - 3 - ((v - min) / span) * (h - 6)).toFixed(1)}`);
  return (
    <svg className={`sl-spark ${up ? "up" : "down"}`} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={`M${pts.join("L")}L${w},${h}L0,${h}Z`} fill="currentColor" opacity=".12" />
      <path d={`M${pts.join("L")}`} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function StocksSlide({ quotes }: { quotes: Quote[] }) {
  return (
    <div className="card sl sl-stocks">
      <Head title="Stocks" />
      <ul className={`sl-quotes n${Math.min(quotes.length, 12)}`}>
        {quotes.slice(0, 12).map((q) => {
          const up = q.change >= 0;
          return (
            <li key={q.symbol}>
              <span className="sl-q-name">{q.name}</span>
              <span className="sl-q-price mono">{q.price.toLocaleString(undefined, { minimumFractionDigits: q.index ? 0 : 2, maximumFractionDigits: q.index ? 0 : 2 })}</span>
              <span className={`sl-q-chg mono ${up ? "up" : "down"}`}>
                {up ? "+" : "−"}
                {Math.abs(q.changePct).toFixed(2)}%
              </span>
              <Spark values={q.line} up={up} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function NewsSlide({ headlines, now }: { headlines: Headline[]; now: number }) {
  // One from each source first, so a single busy feed doesn't fill the slide.
  const picked: Headline[] = [];
  const seen = new Set<string>();
  for (const h of headlines) if (!seen.has(h.source) && picked.length < 5) (seen.add(h.source), picked.push(h));
  for (const h of headlines) if (picked.length < 5 && !picked.includes(h)) picked.push(h);
  return (
    <div className="card sl sl-news">
      <Head title="News" />
      <ul className="sl-news-list">
        {picked.map((h) => (
          <li key={h.url}>
            <span className="sl-news-title">{h.title}</span>
            <span className="sl-dim">
              {h.source}
              {h.date && ` · ${ago(h.date, now)}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MinecraftSlide({ status }: { status: Status }) {
  const servers = status.servers.filter((s) => s.minecraft);
  return (
    <div className="card sl sl-mc">
      <Head title="Minecraft" />
      <div className="sl-mc-grid">
        {servers.map((s) => {
          const mc = s.minecraft!;
          return (
            <div key={s.id} className="sl-mc-server">
              <div className="sl-mc-top">
                <div className={`mc-icon sl-mc-icon ${mc.online ? "" : "off"}`}>
                  {mc.favicon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mc.favicon} alt="" width={64} height={64} />
                  ) : (
                    <GrassBlock />
                  )}
                </div>
                <div className="sl-mc-info">
                  <div className="sl-mc-name">{mc.label}</div>
                  <div className="sl-dim">
                    {mc.online ? `${mc.version ?? ""}${mc.mods?.mods.length ? ` · ${mc.mods.mods.filter((m) => !m.disabled).length} mods` : ""}` : "Offline"}
                  </div>
                </div>
                {mc.online && (
                  <div className="sl-mc-count">
                    <span className="mono">{mc.players_online}</span>
                    <span className="sl-dim">of {mc.players_max}</span>
                  </div>
                )}
              </div>
              {!!mc.players?.length && (
                <div className="sl-mc-players">
                  {mc.players.map((p) => (
                    <span key={p} className="sl-mc-player">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img alt="" width={40} height={40} src={`https://mc-heads.net/avatar/${encodeURIComponent(p)}/40`} />
                      {p}
                    </span>
                  ))}
                </div>
              )}
              {mc.online && !mc.players?.length && <div className="sl-dim sl-mc-empty">Nobody on right now</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ServersSlide({ children }: { children: React.ReactNode }) {
  return <div className="sl sl-servers">{children}</div>;
}
