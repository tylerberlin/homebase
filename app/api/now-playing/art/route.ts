import { cover } from "@/lib/home/nowPlaying";

export const dynamic = "force-dynamic";

// The current cover, fetched server-side (from the player, Last.fm or Apple's search).
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const key = q.get("k") ?? "";
  if (!/^[0-9a-f]{12}$/.test(key)) return new Response(null, { status: 400 });
  const p = q.get("p");
  const img = await cover(key, p != null && /^\d+$/.test(p) ? Number(p) : undefined, q.get("l") === "1");
  if (!img) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(img.data, { headers: { "Content-Type": img.type, "Cache-Control": "private, max-age=86400" } });
}
