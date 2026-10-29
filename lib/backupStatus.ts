import { config } from "./config";
import { buildPiServer } from "./piServer";
import type { PiResult } from "./remote";
import { checkUrl } from "./remote";
import { getJson } from "./store";
import type { Server, Status } from "./types";
import { weather } from "./weather";

// The backup site's /api/status: assembled from the last report each server pushed. A server
// that hasn't reported for a while is shown as offline, with when it was last heard from.

export const REPORT_EVERY = 30; // seconds between pushes from each server
const STALE_AFTER = REPORT_EVERY * 3;

export type NasReport = { at: number; status: Status };
export type PiReport = { at: number; pi: PiResult };
export type IconIndex = Record<string, string>; // server id → icon version hash

const ago = (s: number) => (s < 120 ? `${Math.round(s)} s` : s < 7200 ? `${Math.round(s / 60)} min` : s < 172800 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86400)} days`);

function offline(card: Server, lastAt: number | undefined, now: number): Server {
  return {
    ...card,
    reachable: false,
    error: lastAt ? `No report for ${ago(now - lastAt)}` : "Hasn't reported to the backup yet",
    stats: {},
    cpu_history: [],
    minecraft: card.minecraft ? { ...card.minecraft, online: false, players: [], error: undefined } : null,
  };
}

const placeholder = (which: "nas" | "pi"): Server =>
  which === "nas"
    ? { id: config.nas.id, name: config.nas.name, location: config.nas.location, kind: config.truenas.apiKey ? "truenas" : "host", tz: config.nas.tz, reachable: false, stats: {}, cpu_history: [], minecraft: null }
    : { id: config.pi.id, name: config.pi.name, location: config.pi.location, kind: "pi", tz: config.pi.tz, reachable: false, stats: {}, cpu_history: [], minecraft: null };

export async function backupStatus(): Promise<Status> {
  const [nasRep, piRep, icons] = (await getJson<unknown>("nas", "pi", "icons")) as [NasReport | null, PiReport | null, IconIndex | null];
  const now = Date.now() / 1000;
  const fresh = (r: { at: number } | null): boolean => !!r && now - r.at < STALE_AFTER;
  const nasFresh = fresh(nasRep);
  const { id: nasId } = config.nas, { id: piId } = config.pi;
  const fromNas = (id: string) => nasRep?.status.servers.find((s) => s.id === id);
  const servers: Server[] = [];

  // NAS can only be described by its own reports.
  if (config.nas.enabled || fromNas(nasId)) {
    let nas = fromNas(nasId) ?? placeholder("nas");
    if (!nasFresh) nas = { ...offline(nas, nasRep?.at, now), weather: (await weather(config.nas.lat, config.nas.lon)) ?? nas.weather };
    servers.push(nas);
  }

  // The Pi is seen two ways: through NAS's report (with CPU history), or its own push.
  const piViaNas = fromNas(piId);
  if (config.pi.enabled || piViaNas || piRep) {
    let pi: Server;
    if (nasFresh && piViaNas?.reachable) pi = piViaNas;
    else if (fresh(piRep) && piRep!.pi.reachable) {
      pi = buildPiServer(piRep!.pi, {
        history: [],
        weather: piViaNas?.weather ?? (await weather(config.pi.lat, config.pi.lon)),
        iconUrl: () => (icons?.[piId] ? `/api/mc-icon/${piId}?v=${icons[piId]}` : undefined),
        specs: piViaNas?.specs,
        platform: piViaNas?.platform,
      });
    } else if (nasFresh && piViaNas) {
      pi = piViaNas; // NAS can't reach it either, and says why
    } else {
      const lastAt = piRep?.at;
      pi = { ...offline(piViaNas ?? placeholder("pi"), lastAt, now), weather: piViaNas?.weather ?? (await weather(config.pi.lat, config.pi.lon)) };
    }
    servers.push(pi);
  }

  // Everything else (more agents, Proxmox) only reaches the backup through NAS's reports.
  for (const s of nasRep?.status.servers ?? []) if (s.id !== nasId && s.id !== piId) servers.push(nasFresh ? s : offline(s, nasRep!.at, now));

  const links = nasFresh
    ? nasRep!.status.links
    : await Promise.all(config.links.map(async (l) => ({ ...l, ...(await checkUrl(l.url)) })));

  const latest = Math.max(nasRep?.at ?? 0, piRep?.at ?? 0);
  return {
    updated: latest ? Math.floor(latest) : null,
    refresh: REPORT_EVERY,
    backup: { nas: nasRep?.at, pi: piRep?.at },
    servers,
    links,
  };
}
