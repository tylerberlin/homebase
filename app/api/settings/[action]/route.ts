import { cached, getJson } from "@/lib/home/cache";
import { quote, shortName } from "@/lib/home/markets";
import { feed } from "@/lib/home/news";
import { sameOrigin } from "@/lib/sameOrigin";
import { LEAGUES, TICKER_RE, publicUrl, type League } from "@/lib/settings";

export const dynamic = "force-dynamic";

// Helpers for the Settings panel: GET teams?league=nhl lists a league's teams for the picker,
// GET names?symbols=AAPL,^GSPC gives the watchlist's plain names;
// POST check-ticker / check-feed try a symbol or feed before it's added, so typos are caught.

const json = (v: unknown, status = 200) => Response.json(v, { status, headers: { "Cache-Control": "no-store" } });
const SPORT: Record<League, string> = { nfl: "football", mlb: "baseball", nhl: "hockey", nba: "basketball" };

type EspnTeams = { sports: { leagues: { teams: { team: { abbreviation: string; displayName: string; logos?: { href: string }[] } }[] }[] }[] };

export async function GET(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const action = (await params).action;
  if (action === "names") {
    const symbols = (new URL(req.url).searchParams.get("symbols") ?? "").split(",").map((x) => x.trim().toUpperCase()).filter((x) => TICKER_RE.test(x)).slice(0, 30);
    const names = await Promise.all(
      symbols.map(async (sym) => {
        const q = await cached(`quote:${sym}`, 2 * 60 * 1000, () => quote(sym));
        return [sym, q ? shortName(q.fullName, sym) : sym] as const;
      }),
    );
    return json({ names: Object.fromEntries(names) });
  }
  if (action !== "teams") return json({ error: "not found" }, 404);
  const lg = new URL(req.url).searchParams.get("league") as League;
  if (!(lg in LEAGUES)) return json({ error: "unknown league" }, 400);
  const teams = await cached(`teams:${lg}`, 24 * 3600_000, async () => {
    const d = await getJson<EspnTeams>(`https://site.api.espn.com/apis/site/v2/sports/${SPORT[lg]}/${lg}/teams`);
    return (d.sports[0]?.leagues[0]?.teams ?? [])
      .map(({ team: t }) => ({ team: t.abbreviation.toLowerCase(), abbr: t.abbreviation, name: t.displayName, logo: t.logos?.[0]?.href }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
  return teams ? json({ teams }) : json({ error: "ESPN didn't answer; try again" }, 502);
}

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  const action = (await params).action;
  const body = (await req.json().catch(() => ({}))) as { value?: unknown };
  const value = typeof body.value === "string" ? body.value.trim() : "";

  if (action === "check-ticker") {
    const symbol = value.toUpperCase();
    if (!TICKER_RE.test(symbol)) return json({ error: "That doesn't look like a stock symbol." }, 400);
    try {
      const q = await quote(symbol);
      if (!Number.isFinite(q.price)) throw new Error();
      return json({ ok: true, symbol, name: q.name, price: q.price });
    } catch {
      return json({ error: `Couldn't find ${symbol}.` }, 404);
    }
  }

  if (action === "check-feed") {
    if (!publicUrl(value)) return json({ error: "Use a public http(s) feed address." }, 400);
    try {
      const items = await feed(value, "", "");
      if (!items.length) throw new Error();
      return json({ ok: true, url: value, sample: items[0].title, count: items.length, source: new URL(value).hostname.replace(/^(www|feeds?|rss)\./, "") });
    } catch {
      return json({ error: "That address isn't a news feed (RSS or Atom) I can read." }, 400);
    }
  }
  return json({ error: "not found" }, 404);
}
