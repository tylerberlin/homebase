"use client";

import { useEffect, useState } from "react";
import type { LiveGame, Side } from "@/lib/home/live";
import { fmtTime, useHour12 } from "@/lib/prefs";

// The room display's live scoreboard: big scores you can read across the room, the inning or
// quarter, the count and bases or down and distance, the score by period and the last play.

/** Polls /api/live: every 15 s while a game is on, every minute otherwise. */
export function useLive(enabled: boolean, demo: boolean) {
  const [games, setGames] = useState<LiveGame[]>([]);
  useEffect(() => {
    if (!enabled) return setGames([]);
    // Demo: a sample game only with &game in the address, so the rest of the display can be previewed too.
    if (demo) return setGames(new URLSearchParams(window.location.search).has("game") ? demoGames() : []);
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const load = async () => {
      let next = 60_000;
      try {
        const r = await fetch("/api/live", { cache: "no-store" });
        if (r.ok && !cancelled) {
          const d: { games: LiveGame[] } = await r.json();
          setGames(d.games);
          if (d.games.some((g) => g.state === "in")) next = 15_000;
        }
      } catch {}
      if (!cancelled) timer = setTimeout(load, next);
    };
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, demo]);
  return games;
}

function Team({ t, lead, possession }: { t: Side; lead: boolean; possession: boolean }) {
  return (
    <div className={`sb-team ${t.mine ? "mine" : ""} ${lead ? "lead" : ""}`} style={{ "--team": t.color ?? "var(--accent)" } as React.CSSProperties}>
      <span className="sb-logo">
        {t.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.logo} alt="" width={96} height={96} />
        ) : (
          <span className="sb-logo-text">{t.abbr}</span>
        )}
      </span>
      <span className="sb-name">
        <span className="sb-abbr">
          {t.abbr}
          {possession && <span className="sb-ball" aria-label="has the ball" />}
        </span>
        <span className="sb-full">{t.name}</span>
        {t.record && <span className="sb-record mono">{t.record}</span>}
      </span>
    </div>
  );
}

function Score({ v }: { v?: number }) {
  // Keyed by value so a new score replays the pop animation.
  return (
    <span key={v ?? "-"} className="sb-score mono">
      {v ?? "–"}
    </span>
  );
}

function Diamond({ bases }: { bases: [boolean, boolean, boolean] }) {
  const base = (x: number, y: number, on: boolean, label: string) => (
    <rect x={x} y={y} width="14" height="14" rx="2" transform={`rotate(45 ${x + 7} ${y + 7})`} className={on ? "on" : ""}>
      <title>{`${label} ${on ? "occupied" : "empty"}`}</title>
    </rect>
  );
  return (
    <svg className="sb-diamond" viewBox="0 0 60 44" role="img" aria-label={`Runners on: ${["first", "second", "third"].filter((_, i) => bases[i]).join(", ") || "none"}`}>
      {base(39, 19, bases[0], "First")}
      {base(23, 4, bases[1], "Second")}
      {base(7, 19, bases[2], "Third")}
    </svg>
  );
}

const Dots = ({ n, of, label }: { n?: number; of: number; label: string }) => (
  <span className="sb-dots" aria-label={`${n ?? 0} ${label}`}>
    <span className="sb-dots-l" aria-hidden="true">
      {label[0].toUpperCase()}
    </span>
    {Array.from({ length: of }, (_, i) => (
      <i key={i} className={i < (n ?? 0) ? "on" : ""} aria-hidden="true" />
    ))}
  </span>
);

function Situation({ g }: { g: LiveGame }) {
  const s = g.situation;
  if (!s) return null;
  if (g.league === "mlb") {
    return (
      <div className="sb-sit">
        {s.bases && <Diamond bases={s.bases} />}
        <div className="sb-count">
          <Dots n={s.balls} of={4} label="balls" />
          <Dots n={s.strikes} of={3} label="strikes" />
          <Dots n={s.outs} of={3} label="outs" />
        </div>
        {(s.batter || s.pitcher) && (
          <div className="sb-who">
            {s.batter && <div><span>At bat</span> {s.batter}</div>}
            {s.pitcher && <div><span>Pitching</span> {s.pitcher}</div>}
          </div>
        )}
      </div>
    );
  }
  if (s.downDistance) {
    return (
      <div className="sb-sit">
        <div className={`sb-down ${s.redZone ? "red" : ""}`}>
          {s.downDistance}
          {s.redZone && <span className="sb-redzone">Red zone</span>}
        </div>
      </div>
    );
  }
  return null;
}

function Lines({ g }: { g: LiveGame }) {
  const n = Math.max(g.away.lines.length, g.home.lines.length);
  if (!n) return null;
  const label = (i: number) => (g.league === "nhl" && i >= 3 ? (i === 3 ? "OT" : `${i - 2}OT`) : g.league !== "mlb" && i >= 4 ? (i === 4 ? "OT" : `${i - 3}OT`) : String(i + 1));
  const extra = g.league === "mlb";
  return (
    <table className="sb-lines mono">
      <thead>
        <tr>
          <th scope="col"><span className="sr-only">Team</span></th>
          {Array.from({ length: n }, (_, i) => <th key={i} scope="col">{label(i)}</th>)}
          <th scope="col" className="tot">{g.league === "mlb" ? "R" : "T"}</th>
          {extra && <th scope="col">H</th>}
          {extra && <th scope="col">E</th>}
        </tr>
      </thead>
      <tbody>
        {[g.away, g.home].map((t) => (
          <tr key={t.abbr} className={t.mine ? "mine" : ""}>
            <th scope="row">{t.abbr}</th>
            {Array.from({ length: n }, (_, i) => <td key={i}>{t.lines[i] ?? ""}</td>)}
            <td className="tot">{t.score ?? ""}</td>
            {extra && <td>{t.hits ?? ""}</td>}
            {extra && <td>{t.errors ?? ""}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Game({ g }: { g: LiveGame }) {
  const hour12 = useHour12();
  const a = g.away.score ?? 0, h = g.home.score ?? 0;
  const status =
    g.state === "pre" ? `Starts ${fmtTime(new Date(g.start), hour12)}` : g.state === "post" ? g.detail : g.detail.replace(/ - /, " · ");
  const mine = g.home.mine ? g.home : g.away;
  const won = g.state === "post" && (mine === g.home ? h > a : a > h);
  return (
    <article className={`card sb-game state-${g.state}`} aria-label={`${g.away.name} at ${g.home.name}`}>
      <header className="sb-head">
        <span className="sb-league">
          {g.league.toUpperCase()}
          {g.broadcast && ` · ${g.broadcast}`}
        </span>
        <span className={`sb-status ${g.state === "in" ? "live" : ""}`}>
          {g.state === "in" && <span className="dot live bad" />}
          {status}
          {g.state === "post" && <span className={`sb-result ${won ? "won" : "lost"}`}>{won ? "W" : a === h ? "T" : "L"}</span>}
        </span>
      </header>
      <div className="sb-main">
        <Team t={g.away} lead={g.state !== "pre" && a > h} possession={g.situation?.possession === "away"} />
        <div className="sb-scores" aria-live="polite">
          <Score v={g.state === "pre" ? undefined : g.away.score} />
          <span className="sb-dash" aria-hidden="true">–</span>
          <Score v={g.state === "pre" ? undefined : g.home.score} />
          <span className="sr-only">
            {g.away.abbr} {g.away.score ?? 0}, {g.home.abbr} {g.home.score ?? 0}
          </span>
        </div>
        <Team t={g.home} lead={g.state !== "pre" && h > a} possession={g.situation?.possession === "home"} />
      </div>
      {g.state !== "pre" && (
        <div className="sb-foot">
          <Situation g={g} />
          <Lines g={g} />
        </div>
      )}
      {g.lastPlay && <p className="sb-play">{g.lastPlay}</p>}
    </article>
  );
}

/** The games on now or just finished, largest first. Games about to start are shown under the clock instead. */
export default function Scoreboard({ games }: { games: LiveGame[] }) {
  const shown = games.filter((g) => g.state !== "pre").slice(0, 4);
  if (!shown.length) return null;
  return (
    <div className={`sb-grid n${shown.length}`}>
      {shown.map((g) => (
        <Game key={g.id} g={g} />
      ))}
    </div>
  );
}

/** "Next game · Yankees vs BOS 7:08 PM" under the clock, an hour before it starts. */
export function NextGame({ games }: { games: LiveGame[] }) {
  const hour12 = useHour12();
  const g = games.find((x) => x.state === "pre");
  if (!g || games.some((x) => x.state === "in")) return null;
  const mine = g.home.mine ? g.home : g.away;
  const other = mine === g.home ? g.away : g.home;
  return (
    <div className="d-next">
      <span className="dot live warn" />
      <span className="d-next-title">
        {mine.name} {mine === g.home ? "vs" : "@"} {other.abbr}
      </span>
      <span className="d-next-when">
        {fmtTime(new Date(g.start), hour12)}
        {g.broadcast && ` · ${g.broadcast}`}
      </span>
    </div>
  );
}

function demoGames(): LiveGame[] {
  return [
    {
      id: "demo-ws",
      league: "mlb",
      state: "in",
      start: new Date(Date.now() - 2 * 3600_000).toISOString(),
      detail: "Bot 7th",
      broadcast: "FOX",
      away: { abbr: "BOS", name: "Red Sox", color: "#bd3039", score: 3, record: "97-65", lines: [0, 1, 0, 2, 0, 0, 0], mine: false, hits: 7, errors: 1, logo: "https://a.espncdn.com/i/teamlogos/mlb/500/bos.png" },
      home: { abbr: "NYY", name: "Yankees", color: "#0c2340", score: 4, record: "92-70", lines: [1, 0, 0, 0, 3, 0, 0], mine: true, hits: 8, errors: 0, logo: "https://a.espncdn.com/i/teamlogos/mlb/500/nyy.png" },
      situation: { balls: 2, strikes: 1, outs: 1, bases: [true, false, true], batter: "J. Smith", pitcher: "D. Jones" },
      lastPlay: "Single to right field, runner to third.",
    },
  ];
}
