import { XMLParser } from "fast-xml-parser";
import type { FeedPref } from "../settings";
import { cached, UA } from "./cache";

// Headlines from RSS / Atom feeds, newest first.

export type Headline = { title: string; url: string; source: string; category: string; date?: string };

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", textNodeName: "#text" });
const text = (v: unknown): string =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : v && typeof v === "object" && "#text" in v ? String((v as { "#text": unknown })["#text"]) : "";
const NAMED: Record<string, string> = { amp: "&", apos: "'", quot: '"', lt: "<", gt: ">", nbsp: " ", hellip: "…", mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”" };
const entity = (m: string, e: string) => {
  const n = e[0] === "#" ? (e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : NaN;
  if (Number.isFinite(n)) return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
  return NAMED[e] ?? m;
};
// Twice: some feeds escape twice ("&amp;#8217;").
const decode = (s: string) => s.replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, entity).replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, entity);
const clean = (s: string) => decode(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
const list = <T>(v: T | T[] | undefined): T[] => (Array.isArray(v) ? v : v ? [v] : []);

export async function feed(url: string, source: string, category: string): Promise<Headline[]> {
  const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  // Some feeds (minecraft.net) are UTF-16; decode by the declared charset or BOM.
  const buf = new Uint8Array(await r.arrayBuffer());
  const declared = /charset=([\w-]+)/i.exec(r.headers.get("content-type") ?? "")?.[1]?.toLowerCase();
  const bom16 = buf[0] === 0xff && buf[1] === 0xfe ? "utf-16le" : buf[0] === 0xfe && buf[1] === 0xff ? "utf-16be" : undefined;
  const xml = new TextDecoder(bom16 ?? (declared === "utf-16" ? "utf-16le" : declared) ?? "utf-8").decode(buf);
  const doc = parser.parse(xml);
  const items = doc.rss ? list(doc.rss.channel?.item) : list(doc.feed?.entry);
  return items.slice(0, 15).map((it: Record<string, unknown>) => {
    const link = it.link ?? it["a10:link"]; // minecraft.net uses an Atom link inside RSS
    const href = typeof link === "string" ? link : (list(link as { "@href"?: string; "@rel"?: string }[]).find((l) => !l["@rel"] || l["@rel"] === "alternate")?.["@href"] ?? "");
    const date = text(it.pubDate ?? it.published ?? it.updated ?? it["dc:date"]).replace(/ Z$/, " GMT");
    const d = date ? new Date(date) : undefined;
    return { title: clean(text(it.title)), url: href.trim(), source, category, date: d && !isNaN(d.getTime()) ? d.toISOString() : undefined };
  }).filter((h: Headline) => h.title && /^https?:\/\//.test(h.url));
}

export async function news(list: FeedPref[]): Promise<Headline[]> {
  const feeds = await Promise.all(list.map((f) => cached(`news:${f.url}`, 15 * 60 * 1000, () => feed(f.url, f.source, f.category))));
  return feeds
    .flatMap((f) => f ?? [])
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}
