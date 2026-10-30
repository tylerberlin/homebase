import { type AlertPrefs, alertsAvailable, prefsOf, send, subscribe, unsubscribe, vapidKeys } from "@/lib/alerts";
import { sameOrigin } from "@/lib/sameOrigin";

export const dynamic = "force-dynamic";

// Push alerts. GET ?endpoint= → this device's settings and the key to subscribe with.
// POST {subscription, prefs} saves a device; POST {test, endpoint} sends it a test; DELETE {endpoint} removes it.
const json = (v: unknown, status = 200) => Response.json(v, { status, headers: { "Cache-Control": "no-store" } });
const cleanPrefs = (p: unknown): AlertPrefs => {
  const o = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
  return { servers: o.servers !== false, games: o.games !== false };
};

export async function GET(req: Request) {
  if (!alertsAvailable()) return json({ available: false });
  const endpoint = new URL(req.url).searchParams.get("endpoint");
  const { publicKey } = await vapidKeys();
  return json({ available: true, publicKey, prefs: endpoint ? await prefsOf(endpoint) : null });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  if (!alertsAvailable()) return json({ error: "alerts need the store (Upstash or a data folder)" }, 503);
  const b = (await req.json().catch(() => null)) as { subscription?: { endpoint?: string; keys?: unknown }; prefs?: unknown; test?: boolean; endpoint?: string } | null;
  if (!b) return json({ error: "bad request" }, 400);
  if (b.test) {
    if (typeof b.endpoint !== "string") return json({ error: "bad request" }, 400);
    const n = await send("test", { title: "Homebase alerts are on", body: "You'll hear about server problems and your teams' games here.", url: "/" }, b.endpoint);
    return json({ sent: n });
  }
  const sub = b.subscription;
  if (!sub || typeof sub.endpoint !== "string" || !/^https:\/\//.test(sub.endpoint) || !sub.keys) return json({ error: "bad subscription" }, 400);
  const prefs = await subscribe(sub as Parameters<typeof subscribe>[0], cleanPrefs(b.prefs), req.headers.get("user-agent") ?? undefined);
  return json({ prefs });
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  const b = (await req.json().catch(() => null)) as { endpoint?: string } | null;
  if (!b || typeof b.endpoint !== "string") return json({ error: "bad request" }, 400);
  await unsubscribe(b.endpoint);
  return json({ ok: true });
}
