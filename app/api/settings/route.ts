import { sameOrigin } from "@/lib/sameOrigin";
import { getSettings, saveSettings } from "@/lib/settingsStore";
import { hasStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// The Settings panel: GET the current settings, PUT a whole new set (checked field by field).

const json = (v: unknown, status = 200) => Response.json(v, { status, headers: { "Cache-Control": "no-store" } });

export async function GET() {
  return json({ settings: await getSettings(), saved: hasStore() });
}

export async function PUT(req: Request) {
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  if (!hasStore()) return json({ error: "storage not connected" }, 503);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ error: "bad settings" }, 400);
  try {
    return json({ settings: await saveSettings(body), saved: true });
  } catch (e) {
    return json({ error: `Couldn't save (${(e as Error).message})` }, 502);
  }
}
