// What you can change from the dashboard's Settings panel: teams, stocks, news sources, which Home
// cards show and where, the look, and the room display. Saved in the shared store so every device
// gets the same setup; the server's own config (lib/config.ts) supplies the starting values.
// Safe to import from the browser: no server-only code here (see settingsStore.ts).

export const CARD_IDS = ["clock", "weather", "news", "calendar", "countdowns", "sports", "markets"] as const;
export type CardId = (typeof CARD_IDS)[number];
export const CARD_NAMES: Record<CardId, string> = {
  clock: "Clock",
  weather: "Weather",
  news: "News",
  calendar: "Upcoming",
  countdowns: "Countdowns",
  sports: "Sports",
  markets: "Stocks",
};
export type CardPref = { id: CardId; on: boolean; col: 0 | 1 };

export const LEAGUES = { mlb: "MLB", nfl: "NFL", nhl: "NHL", nba: "NBA" } as const;
export type League = keyof typeof LEAGUES;
export type TeamPref = { league: League; team: string };
export type FeedPref = { category: string; source: string; url: string };

// No purple: blues first, then a few others.
export const ACCENTS = ["blue", "sky", "navy", "teal", "green", "orange", "red", "pink", "graphite"] as const;
export type Accent = (typeof ACCENTS)[number];
export const GLASS = ["clear", "frosted", "solid"] as const;
// Themes: the glass look (with the accent and glass choices above), or a retro-game-inspired one with its
// own colors, fonts and background. SKIN_MODE says which follow the light/dark button.
export const SKINS = ["glass", "blocks", "inferno", "handheld", "ancient", "dropzone", "arcade", "neon", "space", "deepwater", "circuits", "hyperspace", "expedition", "spooky", "harvest", "snowfall", "newyear", "sweetheart", "stripes"] as const;
export type Skin = (typeof SKINS)[number];
export const SKIN_NAMES: Record<Skin, string> = {
  glass: "Glass", blocks: "Blocks", inferno: "Inferno", handheld: "Handheld", ancient: "Ancient", dropzone: "Drop Zone", arcade: "Arcade", neon: "Neon", space: "Space",
  deepwater: "Deep Water", circuits: "Time Circuits", hyperspace: "Hyperspace", expedition: "Expedition",
  spooky: "Spooky", harvest: "Harvest", snowfall: "Snowfall", newyear: "New Year", sweetheart: "Sweetheart", stripes: "Stars & Stripes",
};
/** How the picker in Settings groups the themes. */
export const SKIN_GROUPS: { name: string; skins: Skin[] }[] = [
  { name: "Glass", skins: ["glass"] },
  { name: "Games", skins: ["blocks", "inferno", "handheld", "ancient", "dropzone", "arcade"] },
  { name: "Sci-fi & movie nights", skins: ["neon", "space", "deepwater", "circuits", "hyperspace", "expedition"] },
  { name: "Holidays", skins: ["spooky", "harvest", "snowfall", "newyear", "sweetheart", "stripes"] },
];
export const SKIN_MODE: Record<Skin, "both" | "light" | "dark"> = {
  glass: "both", blocks: "both", inferno: "dark", handheld: "both", ancient: "both", dropzone: "both", arcade: "dark", neon: "dark", space: "dark",
  deepwater: "both", circuits: "dark", hyperspace: "dark", expedition: "both",
  spooky: "dark", harvest: "both", snowfall: "both", newyear: "both", sweetheart: "both", stripes: "both",
};
// Earlier theme ids, so a saved choice survives the rename.
const OLD_SKINS: Record<string, Skin> = {
  minecraft: "blocks", nether: "inferno", pokedex: "handheld", hyrule: "ancient", royale: "dropzone", cyber: "neon",
};

export type Look = { skin: Skin; accent: Accent; glass: (typeof GLASS)[number]; unit: "F" | "C"; clock: "12" | "24"; compact: boolean; gameDay: boolean };
// Slides the room display rotates through (Settings → Room display).
export const SLIDE_IDS = ["servers", "weather", "calendar", "sports", "stocks", "news", "minecraft"] as const;
export type SlideId = (typeof SLIDE_IDS)[number];
export const SLIDE_NAMES: Record<SlideId, string> = {
  servers: "Servers", weather: "Weather", calendar: "Upcoming", sports: "Sports", stocks: "Stocks", news: "News", minecraft: "Minecraft",
};
export const ROTATE_EVERY = [10, 20, 30, 60] as const;

export type DisplayPrefs = {
  clock: boolean;
  bigClock: boolean;
  nextEvent: boolean;
  servers: boolean;
  links: boolean;
  issues: boolean;
  scoreboard: boolean; // take over the display while one of your teams is playing
  rotate: boolean; // flip through slides instead of showing only the servers
  rotateEvery: (typeof ROTATE_EVERY)[number]; // seconds per slide
  slides: SlideId[];
};
export type Settings = {
  teams: TeamPref[];
  tickers: string[];
  news: FeedPref[];
  cards: CardPref[];
  serverSummary: boolean;
  quickLinks: boolean;
  look: Look;
  display: DisplayPrefs;
};

export const LOOK_KEY = "bd-look";
/** Inline in <head>, before first paint (layout.tsx): the look remembered by prefs.tsx, so there's no flash. */
export const lookScript = `try{var l=JSON.parse(localStorage.getItem("${LOOK_KEY}")||"{}"),r=document.documentElement;var s=${JSON.stringify(OLD_SKINS)}[l.s]||l.s;if(s&&s!=="glass")r.dataset.skin=s;else{if(l.a&&l.a!=="blue")r.dataset.accent=l.a;if(l.g&&l.g!=="frosted")r.dataset.glass=l.g}if(l.c)r.dataset.density="compact"}catch(e){}`;

export const LIMITS = { teams: 16, tickers: 20, news: 24 };

// Overall order is the phone order (one column); on wider screens each card goes in its column.
export const DEFAULT_CARDS: CardPref[] = [
  { id: "clock", on: true, col: 1 },
  { id: "weather", on: true, col: 0 },
  { id: "calendar", on: true, col: 1 },
  { id: "countdowns", on: true, col: 1 },
  { id: "sports", on: true, col: 1 },
  { id: "markets", on: true, col: 1 },
  { id: "news", on: true, col: 0 },
];
export const DEFAULT_LOOK: Look = { skin: "glass", accent: "blue", glass: "frosted", unit: "F", clock: "12", compact: false, gameDay: true };
export const DEFAULT_DISPLAY: DisplayPrefs = {
  clock: true, bigClock: false, nextEvent: true, servers: true, links: true, issues: true, scoreboard: true,
  rotate: true, rotateEvery: 20, slides: [...SLIDE_IDS],
};

/** Ready-made news sources for the picker (any RSS/Atom feed can be added too). */
export const FEED_CATALOG: FeedPref[] = [
  { category: "Top", source: "NPR", url: "https://feeds.npr.org/1001/rss.xml" },
  { category: "Top", source: "BBC", url: "https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml" },
  { category: "Top", source: "New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml" },
  { category: "Top", source: "CBS News", url: "https://www.cbsnews.com/latest/rss/main" },
  { category: "Top", source: "The Guardian", url: "https://www.theguardian.com/us-news/rss" },
  { category: "Tech", source: "The Verge", url: "https://www.theverge.com/rss/index.xml" },
  { category: "Tech", source: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index" },
  { category: "Tech", source: "Hacker News", url: "https://news.ycombinator.com/rss" },
  { category: "Tech", source: "TechCrunch", url: "https://techcrunch.com/feed/" },
  { category: "Tech", source: "Engadget", url: "https://www.engadget.com/rss.xml" },
  { category: "Tech", source: "Wired", url: "https://www.wired.com/feed/rss" },
  { category: "Tech", source: "9to5Mac", url: "https://9to5mac.com/feed/" },
  { category: "Tech", source: "MacRumors", url: "https://feeds.macrumors.com/MacRumors-All" },
  { category: "Gaming", source: "Minecraft", url: "https://www.minecraft.net/en-us/feeds/community-content/rss" },
  { category: "Gaming", source: "PC Gamer", url: "https://www.pcgamer.com/rss/" },
  { category: "Gaming", source: "IGN", url: "https://feeds.feedburner.com/ign/all" },
  { category: "Gaming", source: "GameSpot", url: "https://www.gamespot.com/feeds/mashup/" },
  { category: "Sports", source: "ESPN", url: "https://www.espn.com/espn/rss/news" },
  { category: "Business", source: "CNBC", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html" },
  { category: "Science", source: "Space.com", url: "https://www.space.com/feeds.xml" },
  { category: "Science", source: "NASA", url: "https://www.nasa.gov/news-release/feed/" },
];

// ---------- validation: everything saved goes through here, field by field

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const pick = <T extends string>(v: unknown, options: readonly T[], d: T): T => (options.includes(v as T) ? (v as T) : d);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export const TICKER_RE = /^\^?[A-Z0-9][A-Z0-9.=-]{0,11}$/;
export const TEAM_RE = /^[a-z0-9]{1,6}$/;

/** True for http(s) URLs that don't point into the home network (feeds are fetched by the server). */
export function publicUrl(raw: string) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".ts.net") || !h.includes(".") && !h.includes(":")) return false;
    if (/^(127|10|0)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return false;
    if (h.includes(":") && (h === "::1" || /^f[cd]/.test(h) || h.startsWith("fe80"))) return false;
    return true;
  } catch {
    return false;
  }
}

export function sanitize(input: unknown, defaults: Settings): Settings {
  const s = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const seen = new Set<string>();
  const once = (k: string) => !seen.has(k) && !!seen.add(k);

  const teams = "teams" in s
    ? arr(s.teams)
        .map((t) => t as Record<string, unknown>)
        .map((t) => ({ league: str(t?.league, 4).toLowerCase() as League, team: str(t?.team, 6).toLowerCase() }))
        .filter((t) => t.league in LEAGUES && TEAM_RE.test(t.team) && once(`t:${t.league}:${t.team}`))
        .slice(0, LIMITS.teams)
    : defaults.teams;
  const tickers = "tickers" in s
    ? arr(s.tickers).map((t) => str(t, 12).toUpperCase()).filter((t) => TICKER_RE.test(t) && once(`q:${t}`)).slice(0, LIMITS.tickers)
    : defaults.tickers;
  const news = "news" in s
    ? arr(s.news)
        .map((f) => f as Record<string, unknown>)
        .map((f) => ({ category: str(f?.category, 24) || "Other", source: str(f?.source, 40), url: str(f?.url, 400) }))
        .filter((f) => f.source && publicUrl(f.url) && once(`n:${f.url}`))
        .slice(0, LIMITS.news)
    : defaults.news;

  // Cards: keep the saved order, drop unknown ids, and add any card that's new since it was saved
  // where it sits in the default layout (so a new card doesn't always land at the bottom).
  const saved = arr(s.cards)
    .map((c) => c as Record<string, unknown>)
    .filter((c) => CARD_IDS.includes(c?.id as CardId) && once(`c:${c.id}`))
    .map((c) => ({ id: c.id as CardId, on: bool(c.on, true), col: c.col === 1 ? 1 : 0 }) as CardPref);
  const cards = [...saved];
  defaults.cards.forEach((d, i) => {
    if (!cards.some((c) => c.id === d.id)) cards.splice(Math.min(i, cards.length), 0, d);
  });

  const l = (s.look ?? {}) as Record<string, unknown>;
  const d = (s.display ?? {}) as Record<string, unknown>;
  const dl = defaults.look, dd = defaults.display;
  return {
    teams,
    tickers,
    news,
    cards,
    serverSummary: bool(s.serverSummary, defaults.serverSummary),
    quickLinks: bool(s.quickLinks, defaults.quickLinks),
    look: {
      skin: pick(OLD_SKINS[l.skin as string] ?? l.skin, SKINS, dl.skin),
      accent: pick(l.accent, ACCENTS, dl.accent),
      glass: pick(l.glass, GLASS, dl.glass),
      unit: pick(l.unit, ["F", "C"] as const, dl.unit),
      clock: pick(l.clock, ["12", "24"] as const, dl.clock),
      compact: bool(l.compact, dl.compact),
      gameDay: bool(l.gameDay, dl.gameDay),
    },
    display: {
      clock: bool(d.clock, dd.clock),
      bigClock: bool(d.bigClock, dd.bigClock),
      nextEvent: bool(d.nextEvent, dd.nextEvent),
      servers: bool(d.servers, dd.servers),
      links: bool(d.links, dd.links),
      issues: bool(d.issues, dd.issues),
      scoreboard: bool(d.scoreboard, dd.scoreboard),
      rotate: bool(d.rotate, dd.rotate),
      rotateEvery: ROTATE_EVERY.includes(d.rotateEvery as 10) ? (d.rotateEvery as DisplayPrefs["rotateEvery"]) : dd.rotateEvery,
      slides: Array.isArray(d.slides) ? SLIDE_IDS.filter((id) => (d.slides as unknown[]).includes(id)) : dd.slides,
    },
  };
}
