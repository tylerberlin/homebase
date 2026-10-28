import { createHash } from "node:crypto";
import { config } from "./config";
import { hostHardware, hostStats } from "./host";
import { minecraftStatus } from "./minecraft";
import { listMods } from "./minecraftMods";
import { checkUrl, piStats } from "./remote";
import { buildPiServer } from "./piServer";
import { nasSpecs } from "./specs";
import { truenasStats } from "./truenas";
import { weather } from "./weather";
import type { Status } from "./types";

// Background collector: every REFRESH seconds, gather everything into one snapshot that
// /api/status serves. Kept on globalThis so instrumentation, route handlers and dev reloads
// all share one loop and one CPU history.

const HISTORY = 60; // samples kept for sparklines (10 min at 10 s)

type Collector = {
  state: Status;
  hist: { nas: number[]; pi: number[] };
  icons: Map<string, string>;
  lastPiSpecs?: Status["servers"][number]["specs"];
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

const push = (arr: number[], v: number) => {
  arr.push(v);
  if (arr.length > HISTORY) arr.shift();
};

async function collect(c: Collector) {
  const { nas: nasCfg, pi: piCfg, links } = config;
  const timedOut = { error: "timed out" };
  const [host, nas, pi, nasMc, linkResults, nasWx, piWx] = await Promise.all([
    Promise.resolve().then(hostStats),
    withTimeout(truenasStats(), 20000, timedOut),
    withTimeout(piStats(), 20000, { reachable: false as const, error: "timed out" }),
    nasCfg.mcPort ? minecraftStatus(nasCfg.mcHost, nasCfg.mcPort) : Promise.resolve(null),
    Promise.all(links.map((l) => checkUrl(l.url))),
    weather(nasCfg.lat, nasCfg.lon),
    weather(piCfg.lat, piCfg.lon),
  ]);

  // Mods after the ping: its version picks which updates apply. Jars are only re-read when they change.
  const nasMods = await withTimeout(listMods(nasCfg.mcModsDir, nasMc?.version?.match(/\d+\.\d+(\.\d+)?/)?.[0]), 20000, null);

  if (host.cpu_percent != null) push(c.hist.nas, host.cpu_percent);

  if (pi.reachable && pi.cpu_percent != null) push(c.hist.pi, pi.cpu_percent);
  const piServer = buildPiServer(pi, {
    history: c.hist.pi,
    weather: piWx,
    iconUrl: (f) => iconUrl(c, "pi", f),
    specs: c.lastPiSpecs,
  });
  if (piServer.reachable) c.lastPiSpecs = piServer.specs;

  c.state = {
    updated: Math.floor(Date.now() / 1000),
    refresh: config.refresh,
    servers: [
      {
        id: "nas",
        name: nasCfg.name,
        location: nasCfg.location,
        kind: "truenas",
        tz: nasCfg.tz,
        weather: nasWx,
        reachable: true,
        stats: host,
        cpu_history: [...c.hist.nas],
        truenas: nas,
        specs: nasSpecs(nas.hardware, hostHardware(), nas.version),
        web_url: nasCfg.webUrl || undefined,
        minecraft: nasMc
          ? { label: nasCfg.mcLabel, address: nasCfg.mcAddress, ...nasMc, favicon: iconUrl(c, "nas", nasMc.favicon), mods: nasMods }
          : null,
      },
      piServer,
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
    hist: { nas: [], pi: [] },
    icons: new Map(),
    backup: { lastAt: 0, sentIcons: new Map(), failing: false },
  };
  g.__homebaseCollector = c;
  hostStats(); // prime CPU counter
  const loop = async () => {
    try {
      await collect(c);
      void pushBackup(c);
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
