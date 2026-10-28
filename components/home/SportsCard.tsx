"use client";

import type { Game, TeamInfo } from "@/lib/home/sports";
import { fmtTime, useHour12 } from "@/lib/prefs";

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

export default function SportsCard({ teams, now }: { teams: TeamInfo[]; now: number }) {
  const hour12 = useHour12();
  if (!teams.length) return null;
  const rank = (t: TeamInfo) => (t.live ? 0 : t.next ? 1 + new Date(t.next.date).getTime() / 1e13 : 3);
  const sorted = [...teams].sort((a, b) => rank(a) - rank(b));
  return (
    <section className="card home-card" id="sports">
      <h3>Sports</h3>
      <ul className="teams">
        {sorted.map((t) => (
          <li key={t.id} className={`team ${t.live ? "is-live" : ""}`}>
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
          </li>
        ))}
      </ul>
    </section>
  );
}
