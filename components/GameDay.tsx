"use client";

import { useEffect } from "react";
import type { LiveGame, Side } from "@/lib/home/live";
import { usePrefs, type Tint } from "@/lib/prefs";

// Game-day colors: while one of your teams is playing (and for a little while after a win) the
// whole dashboard takes on their color, and a chip in the header shows the score. Only the hue
// and saturation come from the team; globals.css keeps the lightness, so text stays readable.
// Off with Settings → Look → Game-day colors.

const mine = (g: LiveGame): Side => (g.home.mine ? g.home : g.away);
const theirs = (g: LiveGame): Side => (g.home.mine ? g.away : g.home);
const won = (g: LiveGame) => (mine(g).score ?? 0) > (theirs(g).score ?? 0);

/** The game to theme for: one in progress, else one just won (final games drop out after 20 min). */
export const gameDayGame = (games: LiveGame[]) => games.find((g) => g.state === "in") ?? games.find((g) => g.state === "post" && won(g));

/** A team color as a hue for the accent; null for black, white or grey colors, which have none. */
export function teamTint(hex?: string): Tint | null {
  const m = hex?.match(/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  if (!m) return null;
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (s < 0.2 || d < 0.08) return null;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: Math.round((h * 60 + 360) % 360), s: Math.round(Math.min(90, Math.max(55, s * 100))) };
}

/** Tints the dashboard while `games` has one to theme for. */
export function useGameDay(games: LiveGame[]) {
  const { setTint } = usePrefs();
  const g = gameDayGame(games);
  const color = g ? mine(g).color : undefined;
  useEffect(() => {
    setTint(teamTint(color));
    return () => setTint(null);
  }, [color, setTint]);
}

/** "NYY 3–2 BOS · Top 7th" in the header while a game is on; "Yankees won 5–3" after a win. */
export function GameDayChip({ games }: { games: LiveGame[] }) {
  const { settings } = usePrefs();
  const g = gameDayGame(games);
  if (!g || !settings.look.gameDay) return null;
  const me = mine(g), them = theirs(g);
  const live = g.state === "in";
  return (
    <span className={`pill gd-chip ${live ? "live" : "won"}`} title={`${g.away.name} at ${g.home.name}`}>
      {me.logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={me.logo} alt="" width={20} height={20} />
      )}
      {live ? (
        <>
          <span className="dot live bad" />
          <span className="gd-score mono">
            {me.abbr} {me.score ?? 0}–{them.score ?? 0} {them.abbr}
          </span>
          <span className="gd-detail">{g.detail.replace(/ - /, " · ")}</span>
        </>
      ) : (
        <span className="gd-score">
          {me.name} won <span className="mono">{me.score}–{them.score}</span>
        </span>
      )}
    </span>
  );
}
