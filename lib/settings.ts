// What you can change from the dashboard's Settings panel: teams, stocks, news sources, which Home
// cards show and where, the look, and the room display. Saved in the shared store so every device
// gets the same setup; the server's own config (lib/config.ts) supplies the starting values.
// Safe to import from the browser: no server-only code here (see settingsStore.ts).

export const CARD_IDS = ["clock", "weather", "music", "news", "calendar", "countdowns", "sports", "markets"] as const;
export type CardId = (typeof CARD_IDS)[number];
export const CARD_NAMES: Record<CardId, string> = {
  clock: "Clock",
  weather: "Weather",
  music: "Now playing",
  news: "News",
  calendar: "Upcoming",
  countdowns: "Countdowns",
  sports: "Sports",
  markets: "Stocks",
};
/** A Home card: shown or not, where it goes (col is the old two-column layout; Settings still lists
 *  it), and its size on the widget grid: w columns of 4, and h in steps of 72px, or 0 to fit its content. */
export type CardPref = { id: CardId; on: boolean; col: 0 | 1; w: number; h: number };
export const GRID_COLS = 4;
export const GRID_MAX_H = 14;
/** Each card's default width, a starting height before it's measured, and the smallest it can be made. */
export const CARD_SIZE: Record<CardId, { w: number; h: number; minW: number; minH: number }> = {
  clock: { w: 2, h: 3, minW: 1, minH: 2 },
  weather: { w: 2, h: 8, minW: 1, minH: 3 },
  music: { w: 2, h: 3, minW: 1, minH: 2 },
  calendar: { w: 2, h: 5, minW: 1, minH: 3 },
  countdowns: { w: 2, h: 4, minW: 1, minH: 2 },
  news: { w: 2, h: 7, minW: 1, minH: 3 },
  sports: { w: 2, h: 6, minW: 1, minH: 3 },
  markets: { w: 2, h: 5, minW: 1, minH: 3 },
};

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
export const DEFAULT_CARDS: CardPref[] = (
  [["weather", 0], ["clock", 1], ["music", 1], ["calendar", 1], ["countdowns", 0], ["news", 1], ["sports", 0], ["markets", 1]] as const
).map(([id, col]) => ({ id, on: true, col, w: CARD_SIZE[id].w, h: 0 }));
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
    .map((c) => {
      const id = c.id as CardId, size = CARD_SIZE[id];
      const int = (v: unknown, lo: number, hi: number, d: number) => (Number.isInteger(v) ? Math.min(hi, Math.max(lo, v as number)) : d);
      return { id, on: bool(c.on, true), col: c.col === 1 ? 1 : 0, w: int(c.w, size.minW, GRID_COLS, size.w), h: c.h === 0 || c.h === size.h ? 0 : int(c.h, size.minH, GRID_MAX_H, 0) } as CardPref;
    });
  // Saved before the widget grid: lay the two columns out side by side (left, right, left...) so
  // the grid packs them much as they were.
  if (saved.length && !arr(s.cards).some((c) => (c as Record<string, unknown>)?.w != null)) {
    const left = saved.filter((c) => c.col === 0), right = saved.filter((c) => c.col === 1);
    saved.splice(0, saved.length, ...Array.from({ length: Math.max(left.length, right.length) }, (_, i) => [left[i], right[i]]).flat().filter((c): c is CardPref => !!c));
  }
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
