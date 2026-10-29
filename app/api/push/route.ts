import { createHash, timingSafeEqual } from "node:crypto";
import { config } from "@/lib/config";
import { getJson, hasStore, putJson } from "@/lib/store";

export const dynamic = "force-dynamic";

// Backup site only: NAS and the Pi POST their latest status here every 30 s.
// Requires the shared BACKUP_PUSH_TOKEN; Cloudflare Access is skipped for this path.

const ICON_ID = /^[a-z0-9-]{1,48}$/; // any server's id
const MAX_BODY = 600_000;

function authorized(req: Request) {
  const want = config.backup.token;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!want || !got) return false;
  const a = createHash("sha256").update(want).digest();
  const b = createHash("sha256").update(got).digest();
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!config.backup.mode) return new Response("not found", { status: 404 });
  if (!authorized(req)) return new Response("unauthorized", { status: 401 });
  if (!hasStore()) return new Response("storage not connected", { status: 503 });

  const text = await req.text();
  if (text.length > MAX_BODY) return new Response("too large", { status: 413 });
  let body: { source?: string; status?: { servers?: unknown[] }; pi?: { reachable?: boolean; minecraft?: { favicon?: unknown } }; icons?: Record<string, unknown> };
  try {
    body = JSON.parse(text);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const at = Date.now() / 1000;
  if (body.source === "nas" && Array.isArray(body.status?.servers)) await putJson("nas", { at, status: body.status });
  else if (body.source === "pi" && body.pi?.reachable) {
    if (body.pi.minecraft) delete body.pi.minecraft.favicon; // icons arrive through NAS's reports
    await putJson("pi", { at, pi: body.pi });
  } else return new Response("unknown report", { status: 400 });

  // Minecraft server icons, sent only when they change.
  const icons = Object.entries(body.icons ?? {}).filter(
    ([id, v]) => ICON_ID.test(id) && typeof v === "string" && v.startsWith("data:image/") && v.length < 300_000,
  ) as [string, string][];
  if (icons.length) {
    const [index] = await getJson<Record<string, string>>("icons");
    const next = { ...(index ?? {}) };
    for (const [id, data] of icons) {
      await putJson(`icon:${id}`, data);
      next[id] = createHash("sha1").update(data).digest("hex").slice(0, 10);
    }
    await putJson("icons", next);
  }
  return new Response("ok");
}
