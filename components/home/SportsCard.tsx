"use client";

import { useState } from "react";
import type { Game, TeamInfo } from "@/lib/home/sports";
import type { LiveGame } from "@/lib/home/live";
import { fmtTime, useHour12 } from "@/lib/prefs";
import { useLive } from "../Scoreboard";
import { ChevronIcon } from "../icons";

// Your teams: live score if a game is on, otherwise the next game and the last result.

const when = (iso: string, now: number, hour12: boolean) => {
  const d = new Date(iso);
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86400000);
  const time = fmtTime(d, hour12);
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Tomorrow ${time}`;
  if (days < 7) return `${d.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};
const vs = (g: Game) => `${g.home ? "vs" : "@"} ${g.opponent}`;
const result = (g: Game) => (g.us == null || g.them == null ? g.detail : `${g.won ? "W" : g.us === g.them ? "T" : "L"} ${g.us}–${g.them}`);

function Logo({ src, label }: { src?: string; label: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="team-logo" src={src} alt="" width={28} height={28} loading="lazy" />
  ) : (
    <span className="team-logo team-logo-text">{label.slice(0, 3)}</span>
  );
}

const PERIOD: Record<string, (i: number, n: number) => string> = {
  MLB: (i) => String(i + 1),
  NFL: (i) => (i < 4 ? `Q${i + 1}` : i === 4 ? "OT" : `OT${i - 3}`),
  NBA: (i) => (i < 4 ? `Q${i + 1}` : i === 4 ? "OT" : `OT${i - 3}`),
  NHL: (i) => (i < 3 ? `P${i + 1}` : i === 3 ? "OT" : "SO"),
};
const longWhen = (iso: string, hour12: boolean) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · ${fmtTime(d, hour12)}`;
};

/** The box score of a game in progress: a column per period, then the total (and hits / errors in baseball). */
function Linescore({ g }: { g: LiveGame }) {
  const n = Math.max(g.away.lines.length, g.home.lines.length, g.league === "mlb" ? 9 : g.league === "nhl" ? 3 : 4);
  const label = PERIOD[g.league.toUpperCase()] ?? ((i: number) => String(i + 1));
  const mlb = g.league === "mlb";
  const row = (s: LiveGame["away"]) => (
    <tr className={s.mine ? "mine" : ""}>
      <th scope="row">{s.abbr}</th>
      {Array.from({ length: n }, (_, i) => (
        <td key={i}>{s.lines[i] ?? ""}</td>
      ))}
      <td className="ls-total">{s.score ?? 0}</td>
      {mlb && <td>{s.hits ?? ""}</td>}
      {mlb && <td>{s.errors ?? ""}</td>}
    </tr>
  );
  return (
    <table className="ls mono">
      <thead>
        <tr>
          <th />
          {Array.from({ length: n }, (_, i) => (
            <th key={i}>{label(i, n)}</th>
          ))}
          <th className="ls-total">{mlb ? "R" : "T"}</th>
          {mlb && <th>H</th>}
          {mlb && <th>E</th>}
        </tr>
      </thead>
      <tbody>
        {row(g.away)}
        {row(g.home)}
      </tbody>
    </table>
  );
}

function Situation({ g }: { g: LiveGame }) {
  const s = g.situation;
  if (!s) return null;
  if (g.league === "mlb" && s.bases) {
    return (
      <div className="sit">
        <span className="bases" aria-label={`${s.bases.filter(Boolean).length} on base`}>
          <i className={s.bases[1] ? "on" : ""} />
          <i className={s.bases[2] ? "on" : ""} />
          <i className={s.bases[0] ? "on" : ""} />
        </span>
        <span className="mono">
          {s.balls ?? 0}–{s.strikes ?? 0}, {s.outs ?? 0} out
        </span>
        {s.batter && <span>AB: {s.batter}</span>}
        {s.pitcher && <span>P: {s.pitcher}</span>}
      </div>
    );
  }
  if (s.downDistance) return <div className="sit">{s.downDistance}{s.redZone ? " · Red zone" : ""}</div>;
  return null;
}

/** Everything about one team: the game on now, what's next, how the last few went. */
function TeamDetail({ t, live, now, hour12 }: { t: TeamInfo; live?: LiveGame; now: number; hour12: boolean }) {
  return (
    <div className="team-detail">
      {live && (
        <div className="td-live">
          <div className="td-head">
            <span className="team-live">
              <span className="dot live bad" /> {live.detail}
            </span>
            {live.broadcast && <span className="td-meta">on {live.broadcast}</span>}
          </div>
          <Linescore g={live} />
          <Situation g={live} />
          {live.lastPlay && <p className="td-play">{live.lastPlay}</p>}
        </div>
      )}
      {!!t.upcoming?.length && (
        <div className="td-col">
          <div className="td-label">Coming up</div>
          {t.upcoming.map((g) => (
            <div key={g.date} className="td-row">
              <span className="td-opp">{vs(g)}</span>
              <span className="td-when">{longWhen(g.date, hour12)}</span>
            </div>
          ))}
        </div>
      )}
      {!!t.recent?.length && (
        <div className="td-col">
          <div className="td-label">Recent</div>
          {t.recent.map((g) => (
            <div key={g.date} className="td-row">
              <span className={`mono td-res ${g.won ? "won" : g.us === g.them ? "" : "lost"}`}>{result(g)}</span>
              <span className="td-opp">{vs(g)}</span>
              <span className="td-when">{new Date(g.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
            </div>
          ))}
        </div>
      )}
      {!live && !t.upcoming?.length && !t.recent?.length && <p className="td-meta">Nothing on the schedule.</p>}
      <div className="td-foot">
        {t.name}
        {t.record && <span className="mono"> · {t.record}</span>}
        {now > 0 && null}
      </div>
    </div>
  );
}

export default function SportsCard({ teams, now, demo = false }: { teams: TeamInfo[]; now: number; demo?: boolean }) {
  const hour12 = useHour12();
  const [open, setOpen] = useState<string | null>(null);
  const openTeam = teams.find((t) => t.id === open);
  // Only ask for live details while a tapped team is playing (the demo's sample game shows with &game).
  const games = useLive(demo || !!openTeam?.live, demo);
  if (!teams.length) return null;
  const rank = (t: TeamInfo) => (t.live ? 0 : t.next ? 1 + new Date(t.next.date).getTime() / 1e13 : 3);
  const sorted = [...teams].sort((a, b) => rank(a) - rank(b));
  return (
    <section className="card home-card" id="sports">
      <h3>Sports</h3>
      <ul className="teams">
        {sorted.map((t) => (
          <li key={t.id} className={`team ${t.live ? "is-live" : ""} ${open === t.id ? "open" : ""}`}>
            <button type="button" className="team-row" aria-expanded={open === t.id} onClick={() => setOpen(open === t.id ? null : t.id)}>
            <Logo src={t.logo} label={t.short} />
            <div className="team-main">
              <div className="team-name">
                {t.short} <span className="team-league">{t.league}</span>
              </div>
              <div className="team-sub">
                {t.record && <span className="mono">{t.record}</span>}
                {t.last && !t.live && (
                  <span>
                    {" "}
                    · Last <span className={`mono ${t.last.won ? "won" : "lost"}`}>{result(t.last)}</span> {vs(t.last)}
                  </span>
                )}
              </div>
            </div>
            <div className="team-status">
              {t.live ? (
                <>
                  <div className="team-live">
                    <span className="dot live bad" /> LIVE · <span className="mono">{t.live.us ?? 0}–{t.live.them ?? 0}</span>
                  </div>
                  <div className="team-when">
                    {vs(t.live)} · {t.live.detail}
                  </div>
                </>
              ) : t.next ? (
                <>
                  <div className="team-next">{vs(t.next)}</div>
                  <div className="team-when">{when(t.next.date, now, hour12)}</div>
                </>
              ) : (
                <div className="team-when">Season over</div>
              )}
            </div>
            <span className="team-chev" aria-hidden="true">
              <ChevronIcon />
            </span>
            </button>
            {open === t.id && (
              <TeamDetail t={t} now={now} hour12={hour12} live={games.find((g) => [g.away, g.home].some((x) => x.mine && x.abbr.toLowerCase() === t.id.split(":")[1]))} />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
