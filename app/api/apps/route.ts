import { type ControlAction, controlApp, controlsOn } from "@/lib/control";
import { sameOrigin } from "@/lib/sameOrigin";

export const dynamic = "force-dynamic";

// POST {server, app: {name, id?, kind?}, action: start|stop|restart} from an app's details.
const json = (v: unknown, status = 200) => Response.json(v, { status, headers: { "Cache-Control": "no-store" } });

export async function GET() {
  return json({ enabled: controlsOn() });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  if (!controlsOn()) return json({ error: "controls are off" }, 403);
  const b = (await req.json().catch(() => null)) as { server?: unknown; app?: { name?: unknown; id?: unknown; kind?: unknown }; action?: unknown } | null;
  const action = b?.action as ControlAction;
  if (!b || typeof b.server !== "string" || !b.app || typeof b.app.name !== "string" || !["start", "stop", "restart"].includes(action)) return json({ error: "bad request" }, 400);
  const app = { name: b.app.name, id: typeof b.app.id === "string" || typeof b.app.id === "number" ? b.app.id : undefined, kind: typeof b.app.kind === "string" ? b.app.kind : undefined };
  try {
    await controlApp(b.server, app, action);
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}
