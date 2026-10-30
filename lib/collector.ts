import { watchGames, watchServers } from "./alerts";
import { createHash } from "node:crypto";
import os from "node:os";
import { config } from "./config";
import { dockerContainers, hostDisk, hostHardware, hostOs, hostStats } from "./host";
import { minecraftStatus } from "./minecraft";
import { listMods } from "./minecraftMods";
import { buildAgentServer, buildPiServer } from "./piServer";
import { proxmoxServers } from "./proxmox";
import { agentStats, checkUrl, piStats } from "./remote";
import { hostSpecs, nasSpecs } from "./specs";
import { truenasStats } from "./truenas";
import { weather } from "./weather";
import type { Server, Status } from "./types";

// Background collector: every REFRESH seconds, gather everything into one snapshot that
// /api/status serves. Kept on globalThis so instrumentation, route handlers and dev reloads
// all share one loop and one CPU history per server.

const HISTORY = 60; // samples kept for sparklines (10 min at 10 s)

type Collector = {
  state: Status;
  hist: Map<string, number[]>;
  icons: Map<string, string>;
  /** Last known hardware and tag of each agent machine, shown while it's unreachable. */
  last: Map<string, { specs?: Server["specs"]; platform?: string }>;
  backup: { lastAt: number; sentIcons: Map<string, string>; failing: boolean };
};
const g = globalThis as typeof globalThis & { __homebaseCollector?: Collector };

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((r) => (timer = setTimeout(() => r(fallback), ms)));
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/** Stores a server's icon and returns a cache-busting URL for it in place of the data: URL. */
function iconUrl(c: Collector, id: string, favicon?: string | null) {
  if (!favicon) {
    c.icons.delete(id);
    return undefined;
  }
  c.icons.set(id, favicon);
  const v = createHash("sha1").update(favicon).digest("hex").slice(0, 10);
  return `/api/mc-icon/${id}?v=${v}`;
}

/** Adds a CPU sample to a server's history and returns a copy for the snapshot. */
function track(c: Collector, id: string, cpu?: number) {
  const arr = c.hist.get(id) ?? [];
  if (cpu != null) {
    arr.push(cpu);
    if (arr.length > HISTORY) arr.shift();
  }
  c.hist.set(id, arr);
  return [...arr];
}

/** The extra agent machines (AGENTS), with ids that don't clash with the NAS, the Pi or each other. */
function agentCards() {
  const taken = new Set([config.nas.id, config.pi.id]);
  return config.agents.map((a) => {
    let id = a.id;
    for (let n = 2; taken.has(id); n++) id = `${a.id}-${n}`;
    taken.add(id);
    return { ...a, id };
  });
}

async function collect(c: Collector) {
  const { nas: nasCfg, pi: piCfg, links } = config;
  const truenas = nasCfg.enabled && !!config.truenas.apiKey;
  const agents = agentCards();
  const pveOn = !!config.proxmox.url && !!config.proxmox.token;
  const timedOut = { error: "timed out" };
  const offline = { reachable: false as const, error: "timed out" };
  const [host, nas, pi, nasMc, linkResults, nasWx, piWx, agentResults, agentWx, pveWx, containers] = await Promise.all([
    Promise.resolve().then(hostStats),
    truenas ? withTimeout(truenasStats(), 20000, timedOut) : Promise.resolve<Awaited<ReturnType<typeof truenasStats>>>({ error: "not set up" }),
    piCfg.enabled ? withTimeout(piStats(), 20000, offline) : Promise.resolve({ reachable: false as const, error: "not set up" }),
    nasCfg.enabled && nasCfg.mcPort ? minecraftStatus(nasCfg.mcHost, nasCfg.mcPort) : Promise.resolve(null),
    Promise.all(links.map((l) => checkUrl(l.url))),
    nasCfg.enabled ? weather(nasCfg.lat, nasCfg.lon) : Promise.resolve(undefined),
    piCfg.enabled ? weather(piCfg.lat, piCfg.lon) : Promise.resolve(undefined),
    Promise.all(agents.map((a) => withTimeout(agentStats(a.url, a.token, a.name), 20000, offline))),
    Promise.all(agents.map((a) => (a.lat != null && a.lon != null ? weather(a.lat, a.lon) : Promise.resolve(undefined)))),
    pveOn && config.proxmox.lat != null && config.proxmox.lon != null ? weather(config.proxmox.lat, config.proxmox.lon) : Promise.resolve(undefined),
    nasCfg.enabled && !truenas ? dockerContainers() : Promise.resolve(undefined),
  ]);
  const pve = pveOn ? await withTimeout(proxmoxServers((id, cpu) => track(c, id, cpu), pveWx), 25000, []) : [];

  // Mods after the ping: its version picks which updates apply. Jars are only re-read when they change.
  const nasMods = nasCfg.enabled ? await withTimeout(listMods(nasCfg.mcModsDir, nasMc?.version?.match(/\d+\.\d+(\.\d+)?/)?.[0]), 20000, null) : null;

  /** An agent machine's card, remembering its hardware for when it goes offline. */
  const agentCard = (id: string, build: (opts: Parameters<typeof buildPiServer>[1]) => Server, cpu?: number, wx?: Server["weather"]) => {
    const last = c.last.get(id);
    const s = build({ history: track(c, id, cpu), weather: wx, iconUrl: (f) => iconUrl(c, id, f), specs: last?.specs, platform: last?.platform });
    if (s.reachable) c.last.set(id, { specs: s.specs, platform: s.platform });
    return s;
  };

  const nasCard = (): Server => {
    const common = {
      id: nasCfg.id, name: nasCfg.name, location: nasCfg.location, tz: nasCfg.tz, weather: nasWx, reachable: true,
      cpu_history: track(c, nasCfg.id, host.cpu_percent),
      web_url: nasCfg.webUrl || undefined,
      minecraft: nasMc
        ? { label: nasCfg.mcLabel, address: nasCfg.mcAddress, ...nasMc, favicon: iconUrl(c, nasCfg.id, nasMc.favicon), mods: nasMods }
        : null,
    };
    if (truenas) return { ...common, kind: "truenas", platform: nasCfg.platform, stats: host, truenas: nas, specs: nasSpecs(nas.hardware, hostHardware(), nas.version) };
    // A plain server: no TrueNAS, just this machine's own stats and its Docker containers.
    const osName = hostOs();
    return {
      ...common,
      kind: "host",
      platform: osName.replace(/ GNU\/Linux| LTS|\s*\(.*\)/g, ""),
      stats: { ...host, ...hostDisk() },
      specs: hostSpecs({ model: os.cpus()[0]?.model, threads: os.cpus().length }, os.totalmem(), hostHardware(), osName),
      apps: containers?.length ? containers : undefined,
      appsLabel: containers?.length ? "Containers" : undefined,
    };
  };

  c.state = {
    updated: Math.floor(Date.now() / 1000),
    refresh: config.refresh,
    // Only the servers that are set up; with none, the dashboard is just the Home tab.
    servers: [
      ...(nasCfg.enabled ? [nasCard()] : []),
      ...(piCfg.enabled ? [agentCard(piCfg.id, (o) => buildPiServer(pi, o), pi.reachable ? pi.cpu_percent : undefined, piWx)] : []),
      ...agents.map((a, i) => {
        const r = agentResults[i];
        return agentCard(a.id, (o) => buildAgentServer(a, r, o), r.reachable ? r.cpu_percent : undefined, agentWx[i]);
      }),
      ...pve,
    ],
    links: links.map((l, i) => ({ ...l, ...linkResults[i] })),
  };
}

/** Sends the latest snapshot to the backup site every 30 s (when BACKUP_PUSH_URL is set). */
async function pushBackup(c: Collector) {
  const { pushUrl, token } = config.backup;
  if (!pushUrl || !token || !c.state.updated || Date.now() - c.backup.lastAt < 30_000) return;
  c.backup.lastAt = Date.now();
  const icons: Record<string, string> = {};
  for (const [id, data] of c.icons) if (c.backup.sentIcons.get(id) !== data) icons[id] = data;
  try {
    const r = await fetch(`${pushUrl}/api/push`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ source: "nas", status: c.state, icons }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    for (const [id, data] of Object.entries(icons)) c.backup.sentIcons.set(id, data);
    if (c.backup.failing) console.log("backup push working again");
    c.backup.failing = false;
  } catch (e) {
    if (!c.backup.failing) console.error("backup push failed:", (e as Error).message);
    c.backup.failing = true;
  }
}

export function ensureCollector(): Collector {
  if (g.__homebaseCollector) return g.__homebaseCollector;
  const c: Collector = {
    state: { updated: null, servers: [], links: [] },
    hist: new Map(),
    last: new Map(),
    icons: new Map(),
    backup: { lastAt: 0, sentIcons: new Map(), failing: false },
  };
  g.__homebaseCollector = c;
  hostStats(); // prime CPU counter
  const loop = async () => {
    try {
      await collect(c);
      void pushBackup(c);
      void watchServers(c.state).catch((e) => console.error("alerts:", (e as Error).message));
      void watchGames().catch((e) => console.error("alerts:", (e as Error).message));
    } catch (e) {
      console.error("collect error:", e);
    }
    setTimeout(loop, config.refresh * 1000).unref?.();
  };
  void loop();
  console.log("Homebase collector started");
  return c;
}

export const getStatus = () => ensureCollector().state;
export const getIcon = (id: string) => ensureCollector().icons.get(id);
