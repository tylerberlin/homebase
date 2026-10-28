import { liveGames } from "@/lib/home/live";
import { getSettings } from "@/lib/settingsStore";

export const dynamic = "force-dynamic";

// Your teams' games that are on now, about to start, or just ended: for the room display's
// scoreboard and for game-day colors.
export async function GET() {
  const s = await getSettings();
  const games = s.display.scoreboard || s.look.gameDay ? await liveGames(s.teams).catch(() => []) : [];
  return Response.json({ games, updated: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
