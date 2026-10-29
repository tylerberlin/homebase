import { createHash } from "node:crypto";
import { config } from "../config";

// The Now Playing card: what's playing on a machine running the agent (with play/pause and skip),
// or else what Last.fm says you're playing anywhere (shown only). Covers come through
// /api/now-playing/art so the page never loads anything from these services directly.

export type NowPlaying = {
  state: "playing" | "paused";
  title: string;
  artist: string;
  album: string;
  duration?: number; // seconds
  position?: number; // seconds, as of `at`
  at: number;
  volume?: number; // 0-100
  device: string; // "Mac", or "Last.fm"
  app: string; // "Music", "Spotify", …
  controls: boolean;
  art?: string;
};
export type NowPlayingResult = { configured: boolean; playing: NowPlaying | null };

type AgentNow = {
  state: string;
  title?: string;
  artist?: string;
  album?: string;
  duration?: number | null;
  position?: number | null;
  volume?: number | null;
  app?: string;
  controls?: boolean;
};

const players = config.music.players;
const LASTFM = !!config.music.lastfmUser && !!config.music.lastfmKey;
export const musicConfigured = () => players.length > 0 || LASTFM;

const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 12);
const finite = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : undefined);

async function fromAgent(i: number): Promise<NowPlaying | null> {
  const p = players[i];
  try {
    const r = await fetch(`${p.url}/nowplaying`, { headers: { "X-Token": p.token }, cache: "no-store", signal: AbortSignal.timeout(2500) });
    if (!r.ok) return null;
    const d = (await r.json()) as AgentNow;
    if ((d.state !== "playing" && d.state !== "paused") || !d.title) return null;
    const key = hash(`${d.app}|${d.artist}|${d.album}`);
    artLookup.set(key, { artist: d.artist ?? "", album: d.album || d.title });
    return {
      state: d.state,
      title: d.title,
      artist: d.artist ?? "",
      album: d.album ?? "",
      duration: finite(d.duration),
      position: finite(d.position),
      volume: finite(d.volume),
      at: Date.now(),
      device: p.name,
      app: d.app ?? "",
      controls: d.controls !== false,
      art: `/api/now-playing/art?p=${i}&k=${key}`,
    };
  } catch {
    return null;
  }
}

// Last.fm: cached briefly, and its cover URL remembered for the art route.
let lastfmCache: { at: number; value: NowPlaying | null } | undefined;
const lastfmArt = new Map<string, string>();
const LASTFM_BLANK = "2a96cbd8b46e442fc41c2b86b821562f"; // Last.fm's "no image" star

async function fromLastfm(): Promise<NowPlaying | null> {
  if (!LASTFM) return null;
  if (lastfmCache && Date.now() - lastfmCache.at < 15_000) return lastfmCache.value;
  let value: NowPlaying | null = null;
  try {
    const u = new URL("https://ws.audioscrobbler.com/2.0/");
    u.search = new URLSearchParams({ method: "user.getrecenttracks", user: config.music.lastfmUser, api_key: config.music.lastfmKey, format: "json", limit: "1" }).toString();
    const r = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    const d = (await r.json()) as {
      recenttracks?: { track?: { name: string; artist?: { "#text"?: string }; album?: { "#text"?: string }; image?: { size: string; "#text": string }[]; "@attr"?: { nowplaying?: string } }[] };
    };
    const t = d.recenttracks?.track?.[0];
    if (t && t["@attr"]?.nowplaying === "true") {
      const artist = t.artist?.["#text"] ?? "";
      const album = t.album?.["#text"] ?? "";
      const key = hash(`lastfm|${artist}|${album}`);
      const img = t.image?.find((x) => x.size === "extralarge")?.["#text"] || t.image?.at(-1)?.["#text"];
      if (img && !img.includes(LASTFM_BLANK) && img.startsWith("https://")) lastfmArt.set(key, img);
      if (lastfmArt.size > 50) lastfmArt.delete(lastfmArt.keys().next().value!);
      artLookup.set(key, { artist, album: album || t.name });
      value = { state: "playing", title: t.name, artist, album, at: Date.now(), device: "Last.fm", app: "Last.fm", controls: false, art: `/api/now-playing/art?l=1&k=${key}` };
    }
  } catch {
    value = lastfmCache?.value ?? null;
  }
  lastfmCache = { at: Date.now(), value };
  return value;
}

export async function getNowPlaying(): Promise<NowPlayingResult> {
  if (!musicConfigured()) return { configured: false, playing: null };
  const found = (await Promise.all(players.map((_, i) => fromAgent(i)))).filter((x): x is NowPlaying => !!x);
  const playing = found.find((x) => x.state === "playing") ?? (await fromLastfm()) ?? found[0] ?? null;
  return { configured: true, playing };
}

/** Play/pause, skip, back or volume on the machine that's showing. */
export async function control(device: string, action: string, value?: number) {
  const p = players.find((x) => x.name === device);
  if (!p || !["playpause", "next", "previous", "volume"].includes(action)) return false;
  try {
    const r = await fetch(`${p.url}/control`, {
      method: "POST",
      headers: { "X-Token": p.token, "Content-Type": "application/json" },
      body: JSON.stringify({ action, value }),
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

// ---------- covers

const artLookup = new Map<string, { artist: string; album: string }>();
const artCache = new Map<string, { type: string; data: ArrayBuffer } | null>();

async function image(url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(6000) });
  const type = r.headers.get("content-type") ?? "";
  if (!r.ok || !/^image\/(jpeg|png|webp|gif)$/.test(type.split(";")[0])) return null;
  const data = await r.arrayBuffer();
  return data.byteLength > 0 && data.byteLength < 8_000_000 ? { type: type.split(";")[0], data } : null;
}

/** Apple's free search, for when the player or Last.fm has no cover. */
async function itunesCover(artist: string, album: string) {
  if (!artist && !album) return null;
  const u = new URL("https://itunes.apple.com/search");
  u.search = new URLSearchParams({ term: `${artist} ${album}`.trim(), entity: "album", limit: "1" }).toString();
  const r = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(5000) });
  const d = (await r.json().catch(() => null)) as { results?: { artworkUrl100?: string }[] } | null;
  const art = d?.results?.[0]?.artworkUrl100;
  return art?.startsWith("https://") ? image(art.replace(/\/\d+x\d+bb\./, "/600x600bb.")) : null;
}

export async function cover(key: string, fromPlayer?: number, lastfm?: boolean) {
  if (artCache.has(key)) return artCache.get(key) ?? null;
  const known = artLookup.get(key);
  let found: { type: string; data: ArrayBuffer } | null = null;
  try {
    const p = fromPlayer != null ? players[fromPlayer] : undefined;
    if (p) found = await image(`${p.url}/nowplaying/art`, { headers: { "X-Token": p.token } });
    if (!found && lastfm && lastfmArt.has(key)) found = await image(lastfmArt.get(key)!);
    if (!found && known) found = await itunesCover(known.artist, known.album);
  } catch {
    found = null;
  }
  // Only remember a miss if we knew what to look for (otherwise try again on the next poll).
  if (found || known) artCache.set(key, found);
  if (artCache.size > 40) artCache.delete(artCache.keys().next().value!);
  return found;
}
