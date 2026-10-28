import type { League, TeamPref } from "../settings";
import { cached, getJson } from "./cache";

// Live games for your teams, for the room display's scoreboard: score by period, the situation
// (count and bases, down and distance) and the last play, from ESPN's public scoreboard (no key).
// Games show from an hour before the start until 20 minutes after the final.

const SPORT: Record<League, string> = { nfl: "football", mlb: "baseball", nhl: "hockey", nba: "basketball" };
const SOON = 60 * 60_000;
const KEEP_FINAL = 20 * 60_000;

export type Side = {
  abbr: string;
  name: string;
  logo?: string;
  logoDark?: string;
  color?: string;
  score?: number;
  record?: string;
  lines: (number | null)[]; // score per period
  mine: boolean;
  hits?: number;
  errors?: number;
};
export type LiveGame = {
  id: string;
  league: League;
  state: "pre" | "in" | "post";
  start: string;
  detail: string; // "Top 7th", "Q3 - 4:12", "Final", "7:05 PM"
  away: Side;
  home: Side;
  broadcast?: string;
  situation?: {
    possession?: "home" | "away";
    downDistance?: string; // "2nd & 7 at CHI 34"
    redZone?: boolean;
    balls?: number;
    strikes?: number;
    outs?: number;
    bases?: [boolean, boolean, boolean];
    batter?: string;
    pitcher?: string;
  };
  lastPlay?: string;
};

type Competitor = {
  id: string;
  homeAway: "home" | "away";
  score?: string;
  hits?: number;
  errors?: number;
  records?: { summary: string }[];
  linescores?: { value: number }[];
  team: { id: string; abbreviation: string; shortDisplayName?: string; displayName: string; logo?: string; logoDark?: string; color?: string };
};
type Situation = {
  possession?: string;
  downDistanceText?: string;
  isRedZone?: boolean;
  balls?: number;
  strikes?: number;
  outs?: number;
  onFirst?: boolean;
  onSecond?: boolean;
  onThird?: boolean;
  batter?: { athlete?: { shortName?: string } };
  pitcher?: { athlete?: { shortName?: string } };
  lastPlay?: { text?: string };
};
type Event = {
  id: string;
  date: string;
  competitions: {
    competitors: Competitor[];
    broadcast?: string;
    situation?: Situation;
    status: { type: { state: "pre" | "in" | "post"; shortDetail: string } };
  }[];
};

// When each game was first seen final, so a finished game stays up for a while, then leaves.
const finalSince = new Map<string, number>();

function side(c: Competitor, mine: boolean): Side {
  return {
    abbr: c.team.abbreviation,
    name: c.team.shortDisplayName ?? c.team.displayName,
    logo: c.team.logo,
    logoDark: c.team.logoDark,
    color: c.team.color ? `#${c.team.color}` : undefined,
    score: c.score == null || c.score === "" ? undefined : Number(c.score),
    record: c.records?.[0]?.summary,
    lines: (c.linescores ?? []).map((l) => (Number.isFinite(l.value) ? l.value : null)),
    mine,
    hits: c.hits,
    errors: c.errors,
  };
}

async function league(lg: League): Promise<Event[]> {
  const d = await getJson<{ events: Event[] }>(`https://site.api.espn.com/apis/site/v2/sports/${SPORT[lg]}/${lg}/scoreboard`);
  return d.events ?? [];
}

/** Today's games in a league, refreshed every 15 seconds. Also used by the Home Sports card: a
 *  team's schedule feed can say a game is on but leave the score blank. */
export const scoreboard = (lg: League) => cached(`scoreboard:${lg}`, 15_000, () => league(lg));

export async function liveGames(teams: TeamPref[]): Promise<LiveGame[]> {
  const leagues = [...new Set(teams.map((t) => t.league))];
  const now = Date.now();
  const out: LiveGame[] = [];
  await Promise.all(
    leagues.map(async (lg) => {
      const mine = new Set(teams.filter((t) => t.league === lg).map((t) => t.team));
      const events = (await scoreboard(lg)) ?? [];
      for (const e of events) {
        const c = e.competitions[0];
        if (!c) continue;
        const isMine = (x: Competitor) => mine.has(x.team.abbreviation.toLowerCase());
        if (!c.competitors.some(isMine)) continue;
        const state = c.status.type.state;
        if (state === "pre" && new Date(e.date).getTime() - now > SOON) continue;
        if (state === "post") {
          const since = finalSince.get(e.id) ?? (finalSince.set(e.id, now), now);
          // Final games stay 20 minutes from when we first saw them final (sooner after a restart
          // of a long-finished game: anything that started over 8 hours ago is skipped).
          if (now - since > KEEP_FINAL || now - new Date(e.date).getTime() > 8 * 3600_000) continue;
        }
        const away = c.competitors.find((x) => x.homeAway === "away") ?? c.competitors[0];
        const home = c.competitors.find((x) => x.homeAway === "home") ?? c.competitors[1];
        const s = c.situation;
        out.push({
          id: e.id,
          league: lg,
          state,
          start: e.date,
          detail: c.status.type.shortDetail,
          away: side(away, isMine(away)),
          home: side(home, isMine(home)),
          broadcast: c.broadcast || undefined,
          situation:
            state === "in" && s
              ? {
                  possession: s.possession ? (s.possession === home.id || s.possession === home.team.id ? "home" : s.possession === away.id || s.possession === away.team.id ? "away" : undefined) : undefined,
                  downDistance: s.downDistanceText,
                  redZone: s.isRedZone,
                  balls: s.balls,
                  strikes: s.strikes,
                  outs: s.outs,
                  bases: lg === "mlb" ? [!!s.onFirst, !!s.onSecond, !!s.onThird] : undefined,
                  batter: s.batter?.athlete?.shortName,
                  pitcher: s.pitcher?.athlete?.shortName,
                }
              : undefined,
          lastPlay: state === "in" ? s?.lastPlay?.text : undefined,
        });
      }
    }),
  );
  for (const [id, at] of finalSince) if (now - at > 12 * 3600_000) finalSince.delete(id);
  const order = { in: 0, pre: 1, post: 2 };
  return out.sort((a, b) => order[a.state] - order[b.state] || a.start.localeCompare(b.start));
}
