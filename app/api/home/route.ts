import { forecast } from "@/lib/home/forecast";
import { markets } from "@/lib/home/markets";
import { news } from "@/lib/home/news";
import { sports } from "@/lib/home/sports";
import { getSettings } from "@/lib/settingsStore";

export const dynamic = "force-dynamic";

// Everything the Home tab shows except calendar and countdowns. Each source is cached on its own
// schedule server-side, so polling this once a minute is cheap.
export async function GET(req: Request) {
  // Optional viewer location, already rounded by the page; ignore anything out of range.
  const q = new URL(req.url).searchParams;
  const lat = Number(q.get("lat")), lon = Number(q.get("lon"));
  const at = q.has("lat") && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 } : undefined;
  const s = await getSettings();
  const [weather, teams, quotes, headlines] = await Promise.all([
    forecast(at, s.look.unit).catch(() => undefined),
    sports(s.teams).catch(() => []),
    markets(s.tickers).catch(() => []),
    news(s.news).catch(() => []),
  ]);
  return Response.json({ weather, teams, quotes, headlines, updated: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
