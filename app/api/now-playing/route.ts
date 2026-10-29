import { control, getNowPlaying } from "@/lib/home/nowPlaying";
import { sameOrigin } from "@/lib/sameOrigin";

export const dynamic = "force-dynamic";

// GET: what's playing. POST {device, action, value?}: play/pause, next, previous or volume.
const json = (v: unknown, status = 200) => Response.json(v, { status, headers: { "Cache-Control": "no-store" } });

export async function GET() {
  return json(await getNowPlaying());
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  const b = (await req.json().catch(() => null)) as { device?: unknown; action?: unknown; value?: unknown } | null;
  if (!b || typeof b.device !== "string" || typeof b.action !== "string") return json({ error: "bad request" }, 400);
  const ok = await control(b.device, b.action, typeof b.value === "number" ? b.value : undefined);
  if (!ok) return json({ error: "That player didn't respond" }, 502);
  // Give the player a moment to change track before reporting back.
  await new Promise((r) => setTimeout(r, 350));
  return json(await getNowPlaying());
}
