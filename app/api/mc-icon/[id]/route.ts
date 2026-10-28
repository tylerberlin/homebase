import { getIcon } from "@/lib/collector";
import { config } from "@/lib/config";
import { getJson } from "@/lib/store";

export const dynamic = "force-dynamic";

// Minecraft server icons, kept out of /api/status so polls stay small. The ?v= hash in the
// URL changes when the icon does, so browsers can cache each version for a long time.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const icon = config.backup.mode ? (await getJson<string>(`icon:${id}`).catch(() => [null]))[0] : getIcon(id);
  const m = icon && /^data:(image\/[a-z+.-]+);base64,(.*)$/s.exec(icon);
  if (!m) return new Response("not found", { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "Content-Type": m[1], "Cache-Control": "public, max-age=604800, immutable" },
  });
}
