// Read once at server start. Secrets here never leave the server process.
const E = (k: string, d = "") => process.env[k] ?? d;

/** "Name|https://url,Name2|https://url2" → [{ name, url }] */
const parseLinks = (raw: string) =>
  raw
    .split(",")
    .filter((x) => x.includes("|"))
    .map((x) => {
      const i = x.indexOf("|");
      return { name: x.slice(0, i).trim(), url: x.slice(i + 1).trim() };
    });

export const config = {
  refresh: Number(E("REFRESH", "10")),
  truenas: {
    host: E("TRUENAS_HOST", "127.0.0.1"),
    apiKey: E("TRUENAS_API_KEY"),
    verifySsl: E("TRUENAS_VERIFY_SSL", "false").toLowerCase() === "true",
  },
  nas: {
    // Shown when TRUENAS_API_KEY is set (or NAS_ENABLED=1 to show just this machine's own stats).
    enabled: E("NAS_ENABLED") === "1" || !!E("TRUENAS_API_KEY"),
    name: E("NAS_NAME", "NAS"),
    location: E("NAS_LOCATION", "Home"),
    mcLabel: E("NAS_MC_LABEL", "Modded · Create"),
    mcHost: E("NAS_MC_HOST", "127.0.0.1"),
    mcPort: Number(E("NAS_MC_PORT", "0") || 0),
    mcAddress: E("NAS_MC_ADDRESS", "mc.example.com"),
    mcModsDir: E("NAS_MC_MODS"), // the server's mods folder, mounted read-only (lists installed mods)
    webUrl: E("NAS_WEB_URL"), // e.g. https://100.x.y.z (TrueNAS web UI), shown as a link on the card
    // Weather and local time in the card header
    lat: Number(E("NAS_LAT", "40.71")),
    lon: Number(E("NAS_LON", "-74.01")),
    tz: E("NAS_TZ", "America/New_York"),
  },
  pi: {
    enabled: !!E("PI_AGENT_URL"), // shown when the Pi stats agent is set up
    name: E("PI_NAME", "pi"),
    location: E("PI_LOCATION", "Remote"),
    agentUrl: E("PI_AGENT_URL"),
    agentToken: E("PI_AGENT_TOKEN"),
    mcLabel: E("PI_MC_LABEL", "Minecraft"),
    mcPort: Number(E("PI_MC_PORT", "0") || 0), // set when the Pi runs a Minecraft server (same as MC_PORT in pi-agent)
    mcAddress: E("PI_MC_ADDRESS"),
    lat: Number(E("PI_LAT", "47.61")),
    lon: Number(E("PI_LON", "-122.33")),
    tz: E("PI_TZ", "America/Los_Angeles"),
  },
  // Where "Home" is for weather. Defaults to the NAS's location; set HOME_LAT/HOME_LON with no servers.
  homePlace: {
    lat: Number(E("HOME_LAT", E("NAS_LAT", "40.71"))),
    lon: Number(E("HOME_LON", E("NAS_LON", "-74.01"))),
    location: E("HOME_LOCATION", E("NAS_LOCATION", "Home")),
  },
  // Backup site on Vercel. On NAS and the Pi: where to send reports. On Vercel: BACKUP_MODE=1.
  backup: {
    mode: E("BACKUP_MODE") === "1",
    pushUrl: E("BACKUP_PUSH_URL").replace(/\/+$/, ""),
    token: E("BACKUP_PUSH_TOKEN"),
    // Cloudflare Access in front of the backup site; the app checks its login token too.
    accessTeam: E("CF_ACCESS_TEAM_DOMAIN"),
    accessAud: E("CF_ACCESS_AUD"),
  },
  weatherUnit: E("WEATHER_UNIT", "fahrenheit") === "celsius" ? ("celsius" as const) : ("fahrenheit" as const),
  // Calendars shown in the Upcoming card: "Name|https://….ics" or "Name|#color|https://….ics",
  // comma-separated. These are secret links; they're only ever fetched server-side.
  calendars: E("CALENDARS")
    .split(",")
    .map((x) => x.trim().split("|").map((p) => p.trim()))
    .filter((p) => p.length >= 2 && /^(https?|webcal):\/\//i.test(p[p.length - 1]))
    .map((p) => ({ name: p[0], color: p.length >= 3 ? p[1] : "", url: p[p.length - 1].replace(/^webcal:/i, "https:") })),
  // Home tab
  home: {
    // "league:team" (ESPN abbreviations): mlb, nfl, nhl, nba
    teams: E("TEAMS", "mlb:nyy,nfl:kc,nba:bos,nhl:nyr")
      .split(",")
      .map((x) => x.trim().split(":"))
      .filter((p) => p.length === 2)
      .map(([league, team]) => ({ league: league.toLowerCase(), team: team.toLowerCase() })),
    tickers: E("TICKERS", "^GSPC,^IXIC,^DJI,AAPL,NVDA,MSFT,GOOGL,AMZN")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
    // "Category|Source|https://feed", comma-separated
    news: E(
      "NEWS_FEEDS",
      "Top|NPR|https://feeds.npr.org/1001/rss.xml,Top|BBC|https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml," +
        "Tech|The Verge|https://www.theverge.com/rss/index.xml,Tech|Ars Technica|https://feeds.arstechnica.com/arstechnica/index," +
        "Tech|Hacker News|https://news.ycombinator.com/rss,Gaming|Minecraft|https://www.minecraft.net/en-us/feeds/community-content/rss," +
        "Gaming|PC Gamer|https://www.pcgamer.com/rss/",
    )
      .split(",")
      .map((x) => x.split("|").map((p) => p.trim()))
      .filter((p) => p.length === 3 && /^https?:\/\//.test(p[2]))
      .map(([category, source, url]) => ({ category, source, url })),
  },
  // Public endpoints the dashboard checks
  links: parseLinks(E("LINKS")),
  // Shortcuts row under the header (not checked, just links)
  quickLinks: parseLinks(
    E(
      "QUICK_LINKS",
    ),
  ),
};
