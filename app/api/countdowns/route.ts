import { addCountdown, listCountdowns, removeCountdown } from "@/lib/home/countdowns";
import { sameOrigin } from "@/lib/sameOrigin";
import { hasStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const json = (v: unknown, status = 200) => Response.json(v, { status, headers: { "Cache-Control": "no-store" } });

export async function GET() {
  return json({ enabled: hasStore(), countdowns: await listCountdowns().catch(() => []) });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  if (!hasStore()) return json({ error: "storage not connected" }, 503);
  const body = (await req.json().catch(() => ({}))) as { title?: unknown; date?: unknown };
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 60) : "";
  const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : "";
  if (!title || !date) return json({ error: "needs a title and a date" }, 400);
  try {
    return json({ enabled: true, countdowns: await addCountdown(title, date) });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  if (!hasStore()) return json({ error: "storage not connected" }, 503);
  const id = new URL(req.url).searchParams.get("id") ?? "";
  return json({ enabled: true, countdowns: await removeCountdown(id) });
}
