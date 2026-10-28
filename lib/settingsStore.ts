import { config } from "./config";
import { DEFAULT_CARDS, DEFAULT_DISPLAY, DEFAULT_LOOK, LEAGUES, sanitize, type League, type Settings } from "./settings";
import { getJson, hasStore, putJson } from "./store";

// Loading and saving settings (server only). Read often (every Home refresh), so kept in memory
// briefly; a save on this server updates it at once, the other copy catches up within 15 s.

const KEY = "settings";
const TTL = 15_000;
let memo: { at: number; value: Settings } | null = null;

export function defaultSettings(): Settings {
  return {
    teams: config.home.teams.filter((t) => t.league in LEAGUES).map((t) => ({ league: t.league as League, team: t.team })),
    tickers: config.home.tickers,
    news: config.home.news,
    cards: DEFAULT_CARDS,
    serverSummary: true,
    quickLinks: true,
    look: { ...DEFAULT_LOOK, unit: config.weatherUnit === "celsius" ? "C" : "F" },
    display: DEFAULT_DISPLAY,
  };
}

export async function getSettings(): Promise<Settings> {
  if (memo && Date.now() - memo.at < TTL) return memo.value;
  let stored: unknown = null;
  if (hasStore()) {
    try {
      [stored] = await getJson<unknown>(KEY);
    } catch {
      if (memo) return memo.value; // store hiccup: keep the last known settings
    }
  }
  const value = sanitize(stored ?? {}, defaultSettings());
  memo = { at: Date.now(), value };
  return value;
}

export async function saveSettings(input: unknown): Promise<Settings> {
  const value = sanitize(input, defaultSettings());
  await putJson(KEY, value);
  memo = { at: Date.now(), value };
  return value;
}
