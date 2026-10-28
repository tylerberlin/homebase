import { ImageResponse } from "next/og";
import { ICON_PNG_SIZES, ICON_SVG } from "@/lib/brand";

// /brand/icon.svg, /brand/icon-180.png (Apple), /brand/icon-192.png and /brand/icon-512.png (manifest)
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const cache = { "Cache-Control": "public, max-age=86400" };
  if (file === "icon.svg") return new Response(ICON_SVG, { headers: { "Content-Type": "image/svg+xml", ...cache } });

  const size = Number(/^icon-(\d+)\.png$/.exec(file)?.[1]);
  if (!(ICON_PNG_SIZES as readonly number[]).includes(size)) return new Response("not found", { status: 404 });
  // Home-screen icons are masked to a rounded square by the OS, so fill the whole tile edge to edge.
  const src = `data:image/svg+xml;base64,${Buffer.from(ICON_SVG.replace(/rx="1[45](\.25)?"/g, 'rx="0"')).toString("base64")}`;
  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} width={size} height={size} alt="" />,
    { width: size, height: size, headers: cache },
  );
}
