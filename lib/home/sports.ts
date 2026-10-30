import type { League, TeamPref } from "../settings";
import { cached, getJson } from "./cache";
import { scoreboard } from "./live";

// Each team's live, next and last game from ESPN's public site API (no key). The live game comes
// from the league scoreboard: the team schedule feed lags and often has no score mid-game.

const SPORT: Record<string, string> = { nfl: "football", mlb: "baseball", nhl: "hockey", nba: "basketball" };

export type Game = {
  date: string;
  state: "pre" | "in" | "post";
  detail: string; // "Q3 4:12", "Final", "12/25 - 4:30 PM EST"
  home: boolean; // is the followed team at home
  opponent: string; // abbreviation
  opponentLogo?: string;
  us?: number;
  them?: number;
  won?: boolean;
};
export type TeamInfo = { id: string; league: string; name: string; short: string; logo?: string; color?: string; record?: string; live?: Game; next?: Game; last?: Game; recent?: Game[]; upcoming?: Game[] };

type Competitor = { homeAway: string; winner?: boolean; score?: { displayValue?: string } | string; team: { abbreviation: string; logos?: { href: string }[]; logo?: string } };
type Event = { id: string; date: string; competitions: { competitors: Competitor[]; status: { type: { state: "pre" | "in" | "post"; shortDetail: string } } }[] };

const score = (c?: Competitor) => {
  const v = typeof c?.score === "string" ? c.score : c?.score?.displayValue;
  return v == null || v === "" ? undefined : Number(v);
};

type Schedule = Omit<TeamInfo, "live" | "next" | "last"> & { games: (Game & { id: string })[] };

async function team(league: string, abbr: string): Promise<Schedule> {
  const sport = SPORT[league];
  if (!sport) throw new Error(`unknown league ${league}`);
  const d = await getJson<{ team: { displayName: string; shortDisplayName?: string; abbreviation: string; logo?: string; color?: string; recordSummary?: string }; events: Event[] }>(
    `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/teams/${abbr}/schedule`,
  );
  const games = d.events.map((e) => game(e, d.team.abbreviation));
  return {
    id: `${league}:${abbr}`,
    league: league.toUpperCase(),
    name: d.team.displayName,
    short: d.team.shortDisplayName ?? d.team.displayName,
    logo: d.team.logo,
    color: d.team.color ? `#${d.team.color}` : undefined,
    record: d.team.recordSummary,
    games,
  };
}

function game(e: Event, abbr: string): Game & { id: string } {
  const c = e.competitions[0];
  const me = c.competitors.find((x) => x.team.abbreviation.toLowerCase() === abbr.toLowerCase()) ?? c.competitors[0];
  const other = c.competitors.find((x) => x !== me) ?? c.competitors[1];
  return {
    id: e.id,
    date: e.date,
    state: c.status.type.state,
    detail: c.status.type.shortDetail,
    home: me.homeAway === "home",
    opponent: other?.team.abbreviation ?? "?",
    opponentLogo: other?.team.logos?.[0]?.href ?? other?.team.logo,
    us: score(me),
    them: score(other),
    won: me.winner,
  };
}

/** Live, next and last game, with today's games swapped for the fresher scoreboard copies. */
function pick({ games, ...t }: Schedule, today: Event[]): TeamInfo {
  const abbr = t.id.split(":")[1];
  const fresh = new Map(today.filter((e) => e.competitions[0]?.competitors.some((x) => x.team.abbreviation.toLowerCase() === abbr)).map((e) => [e.id, game(e, abbr)]));
  const list = games.map((g) => fresh.get(g.id) ?? g);
  for (const [id, g] of fresh) if (!games.some((x) => x.id === id)) list.push(g);
  const strip = ({ id: _, ...g }: Game & { id: string }): Game => g;
  const live = list.find((g) => g.state === "in");
  const next = list.filter((g) => g.state === "pre" && new Date(g.date).getTime() > Date.now() - 6 * 3600e3).sort((a, b) => a.date.localeCompare(b.date))[0];
  const played = list.filter((g) => g.state === "post").sort((a, b) => b.date.localeCompare(a.date));
  const ahead = list.filter((g) => g.state === "pre" && new Date(g.date).getTime() > Date.now() - 6 * 3600e3).sort((a, b) => a.date.localeCompare(b.date));
  const last = played[0];
  return { ...t, live: live && strip(live), next: next && strip(next), last: last && strip(last), recent: played.slice(0, 5).map(strip), upcoming: ahead.slice(0, 4).map(strip) };
}

export async function sports(list: TeamPref[]): Promise<TeamInfo[]> {
  const leagues = [...new Set(list.map((t) => t.league))];
  const [teams, boards] = await Promise.all([
    Promise.all(list.map(({ league, team: abbr }) => cached(`schedule:${league}:${abbr}`, 5 * 60_000, () => team(league, abbr)))),
    Promise.all(leagues.map((lg) => scoreboard(lg as League).catch(() => null))),
  ]);
  const today = new Map(leagues.map((lg, i) => [lg, boards[i] ?? []]));
  return teams.filter((t): t is Schedule => !!t).map((t) => pick(t, today.get(t.league.toLowerCase() as League) ?? []));
}
