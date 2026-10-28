"use client";

import { useEffect, useState } from "react";
import { level, pct, tempLevel } from "@/lib/format";
import { healthOf, tempMax, type HealthLevel, type Issue } from "@/lib/health";
import type { CalendarData } from "@/lib/calendar";
import type { Minecraft, Server, Status } from "@/lib/types";
import { countdown, eventTimes } from "@/lib/useCalendar";
import { AnimatedNumber } from "@/lib/useAnimatedNumber";
import Gauge from "./Gauge";
import { CloseIcon, FullscreenIcon } from "./icons";
import IssueStrip from "./IssueStrip";
import { GrassBlock } from "./Minecraft";
import { LocalConditions, useLocalTime } from "./Weather";
import { usePrefs } from "@/lib/prefs";
import type { LiveGame } from "@/lib/home/live";
import Scoreboard, { NextGame } from "./Scoreboard";
import { CalendarSlide, MinecraftSlide, NewsSlide, Rotator, ServersSlide, SportsSlide, StocksSlide, WeatherSlide, type Slide } from "./DisplaySlides";
import { useHome, useNow } from "@/lib/useHome";

// Full-screen room display (?display): only what reads from across the room, sized to the viewport.
// What it shows is set in Settings → Room display. While one of your teams is playing, the
// scoreboard takes the middle of the screen and the servers shrink to a strip along the bottom.

/** "Next · Dentist in 45 min" under the clock, from the calendars. */
function NextEvent({ data }: { data: CalendarData | null }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  if (!data?.events.length || now == null) return null;
  const today = data.events.filter((e) => !e.allDay && eventTimes(e).end.getTime() > now && countdown(e, now) != null);
  const next = today[0];
  if (!next) return null;
  const when = countdown(next, now);
  return (
    <div className="d-next">
      <span className="cal-dot" style={{ background: next.color }} />
      <span className="d-next-title">{next.title}</span>
      <span className={`d-next-when ${when === "now" ? "now" : ""}`}>{when === "now" ? "now" : when}</span>
    </div>
  );
}

/** Keeps the screen on while the display is open (where the browser supports it). */
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        lock = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {}
    };
    const onVisible = () => document.visibilityState === "visible" && request();
    void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, []);
}

/** True after 3 s without input, so the cursor and controls can fade away. */
function useIdle(ms = 3000) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const wake = () => {
      setIdle(false);
      clearTimeout(t);
      t = setTimeout(() => setIdle(true), ms);
    };
    wake();
    const events = ["pointermove", "pointerdown", "keydown"] as const;
    events.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    return () => {
      clearTimeout(t);
      events.forEach((e) => window.removeEventListener(e, wake));
    };
  }, [ms]);
  return idle;
}

function Storage({ s }: { s: Server }) {
  const pool = s.truenas?.pools?.[0];
  const label = pool ? `Pool ${pool.name}` : "Disk";
  const p = pool ? pct(pool.allocated, pool.size) : pct(s.stats.disk_used, s.stats.disk_total);
  if (p == null) return <div />;
  const bad = pool && (pool.healthy === false || (!!pool.status && pool.status !== "ONLINE"));
  return (
    <div className="d-stat">
      <div className="d-stat-label">
        <span>{label}</span>
        <span className="mono">{bad ? pool!.status : `${p}%`}</span>
      </div>
      <div className="bar">
        <i className={bad ? "bad" : level(p, 80, 90)} style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

function DisplayMinecraft({ mc }: { mc: Minecraft | null }) {
  if (!mc) return <div />;
  return (
    <div className="d-mc">
      <div className={`mc-icon ${mc.online ? "" : "off"}`}>
        {mc.favicon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mc.favicon} alt="" width={64} height={64} />
        ) : (
          <GrassBlock />
        )}
      </div>
      <div className="d-mc-info">
        <div className="d-mc-name">{mc.label}</div>
        <div className={`d-mc-state ${mc.online ? "" : "err"}`}>{mc.online ? `of ${mc.players_max} online` : "Offline"}</div>
      </div>
      {mc.online && (
        <div className="d-mc-n mono">
          <AnimatedNumber value={mc.players_online} />
        </div>
      )}
    </div>
  );
}

/** One line per server for under the scoreboard. */
function MiniServer({ s }: { s: Server }) {
  const st = s.stats;
  return (
    <div className="d-mini-s">
      <span className={`dot live ${healthOf(s).level}`} />
      <span className="d-mini-name">{s.name}</span>
      {s.reachable ? (
        <span className="d-mini-stats mono">
          CPU {st.cpu_percent ?? "–"}% · {st.temp_c != null ? `${Math.round(st.temp_c)}°C` : "–"}
          {s.minecraft?.online && ` · MC ${s.minecraft.players_online}`}
        </span>
      ) : (
        <span className="d-mini-stats err">Unreachable</span>
      )}
    </div>
  );
}

function DisplayServer({ s }: { s: Server }) {
  const health = healthOf(s).level;
  const st = s.stats;
  const memP = pct(st.mem_used, st.mem_total);
  return (
    <section className="card d-card" id={s.id}>
      <div className="d-head">
        <div>
          <h2>
            <span className={`dot live ${health}`} />
            {s.name}
          </h2>
          <div className="d-loc">{s.location}</div>
        </div>
        <LocalConditions weather={s.weather} tz={s.tz} compact iconSize={28} />
      </div>
      {s.reachable ? (
        <div className="gauges d-gauges">
          <Gauge label="CPU" value={st.cpu_percent} unit="%" lvl={level(st.cpu_percent, 70, 90)} />
          <Gauge label="Memory" value={memP} unit="%" lvl={level(memP, 85, 95)} />
          <Gauge label="Temp" value={st.temp_c} max={tempMax(s.kind)} unit="°C" lvl={tempLevel(st.temp_c, s.kind)} />
        </div>
      ) : (
        <div className="d-offline">
          <div className="d-offline-big">Unreachable</div>
          <div>{s.error || "No response"}</div>
        </div>
      )}
      <div className="d-foot">
        {s.reachable ? <Storage s={s} /> : <div />}
        <DisplayMinecraft mc={s.minecraft} />
      </div>
    </section>
  );
}

export default function DisplayView({
  data, issues, overall, overallText, backendError, exitHref, calendar = null, settingsButton, demo = false, games: allGames = [],
}: {
  data: Status | null;
  issues: Issue[];
  overall: HealthLevel | "";
  overallText: string;
  backendError: string | null;
  exitHref: string;
  calendar?: CalendarData | null;
  settingsButton?: React.ReactNode;
  demo?: boolean;
  games?: LiveGame[];
}) {
  const { settings } = usePrefs();
  const p = settings.display;
  const games = p.scoreboard ? allGames : [];
  const playing = games.some((g) => g.state !== "pre");
  const rotating = p.rotate && p.slides.length > 0;
  const home = useHome(rotating, null, JSON.stringify([settings.teams, settings.tickers, settings.news, settings.look.unit]));
  const now = useNow();
  useWakeLock();
  const idle = useIdle();
  const clock = useLocalTime(undefined, { hour: "numeric", minute: "2-digit" });
  const date = useLocalTime(undefined, { weekday: "long", month: "long", day: "numeric" });
  const [canFullscreen, setCanFullscreen] = useState(false);
  useEffect(() => setCanFullscreen(!!document.fullscreenEnabled), []);

  return (
    <div className={`display ${idle ? "idle" : ""} ${playing ? "has-game" : ""} ${p.bigClock && !playing ? "big-clock" : ""}`}>
      <header className="d-top">
        <div>
          {p.clock && (
            <>
              <div className="d-clock">{clock ?? " "}</div>
              <div className="d-date">{date ?? " "}</div>
            </>
          )}
          {p.nextEvent && <NextEvent data={calendar} />}
          <NextGame games={games} />
        </div>
        <div className="d-right">
          <span className={`pill d-pill ${overall ? "state-" + overall : ""}`}>
            <span className={`dot live ${overall}`} />
            <span aria-live="polite">{overallText}</span>
          </span>
          <div className="d-controls">
            {settingsButton}
            {canFullscreen && (
              <button
                type="button"
                className="theme-btn"
                aria-label="Full screen"
                title="Full screen"
                onClick={() =>
                  document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {})
                }
              >
                <FullscreenIcon />
              </button>
            )}
            <a className="theme-btn" href={exitHref} aria-label="Exit display mode" title="Exit display mode">
              <CloseIcon />
            </a>
          </div>
        </div>
      </header>

      {backendError && (
        <div className="banner show" role="alert">
          Can&apos;t reach the dashboard backend ({backendError}). Retrying…
        </div>
      )}
      {data && p.issues && <IssueStrip issues={issues} />}

      <Scoreboard games={games} />

      {data && p.servers && !playing && !rotating && (
        <div className="d-grid">
          {data.servers.map((s) => (
            <DisplayServer key={s.id} s={s} />
          ))}
        </div>
      )}
      {data && rotating && !playing && (
        <Rotator
          every={p.rotateEvery}
          slides={p.slides.flatMap((id): Slide[] => {
            const one = (label: string, node: React.ReactNode) => [{ id, label, node }];
            switch (id) {
              case "servers":
                return one("Servers", (
                  <ServersSlide>
                    <div className="d-grid">
                      {data.servers.map((s) => (
                        <DisplayServer key={s.id} s={s} />
                      ))}
                    </div>
                  </ServersSlide>
                ));
              case "weather":
                return home?.weather ? one("Weather", <WeatherSlide w={home.weather} />) : [];
              case "calendar":
                return calendar && now != null && calendar.events.some((e) => new Date(e.end).getTime() > now || e.allDay) ? one("Upcoming", <CalendarSlide data={calendar} now={now} />) : [];
              case "sports":
                return home?.teams.length && now != null ? one("Sports", <SportsSlide teams={home.teams} now={now} />) : [];
              case "stocks":
                return home?.quotes.length ? one("Stocks", <StocksSlide quotes={home.quotes} />) : [];
              case "news":
                return home?.headlines.length && now != null ? one("News", <NewsSlide headlines={home.headlines} now={now} />) : [];
              case "minecraft":
                return data.servers.some((s) => s.minecraft) ? one("Minecraft", <MinecraftSlide status={data} />) : [];
            }
          })}
        />
      )}
      {data && p.servers && playing && (
        <div className="d-mini">
          {data.servers.map((s) => (
            <MiniServer key={s.id} s={s} />
          ))}
        </div>
      )}
      {!p.servers && !playing && !rotating && <div className="d-spacer" />}

      {data && p.links && !playing && data.links.length > 0 && (
        <div className="d-links">
          {data.links.map((l) => (
            <span key={l.url}>
              <span className={`dot ${l.up ? "ok" : "bad"}`} />
              {l.name}
              <span className="mono">{l.up ? `${l.ms} ms` : "down"}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
