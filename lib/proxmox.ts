import http from "node:http";
import https from "node:https";
import { config, slug } from "./config";
import { proxmoxSpecs } from "./specs";
import type { App, Pool, Server, Weather } from "./types";

// Proxmox VE over its REST API: one card per node, with its storages and its VMs and containers.
// Proxmox uses a self-signed certificate out of the box, so it isn't checked unless PROXMOX_VERIFY_SSL=true.

type Node = { node: string; status?: string; cpu?: number; maxcpu?: number; mem?: number; maxmem?: number; uptime?: number };
type NodeStatus = Parameters<typeof proxmoxSpecs>[0] & { loadavg?: string[]; rootfs?: { total?: number; used?: number } };
type Guest = { vmid: number; name?: string; status?: string; template?: number };
type Storage = { storage: string; total?: number; used?: number; active?: number; enabled?: number };

function pve<T>(path: string): Promise<T> {
  const { url, token, verifySsl } = config.proxmox;
  const u = new URL(`${url}/api2/json${path}`);
  const lib = u.protocol === "http:" ? http : https;
  return new Promise((resolve, reject) => {
    const req = lib.get(u, { headers: { Authorization: `PVEAPIToken=${token}` }, rejectUnauthorized: verifySsl, timeout: 8000 }, (res) => {
      let body = "";
      res.on("data", (d) => (body += d));
      res.on("end", () => {
        if (res.statusCode !== 200) return reject(new Error(`Proxmox returned ${res.statusCode}${res.statusCode === 401 ? " (check PROXMOX_TOKEN)" : ""}`));
        try {
          resolve((JSON.parse(body) as { data: T }).data);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("timed out")));
    req.on("error", reject);
  });
}

const STATE: Record<string, string> = { running: "RUNNING", paused: "STOPPED", stopped: "STOPPED" };
const guests = (list: Guest[] | null, kind: string): App[] =>
  (list ?? []).filter((g) => !g.template).map((g) => ({ name: g.name || `${kind} ${g.vmid}`, state: STATE[g.status ?? ""] ?? "STOPPED" }));

/** One card per Proxmox node. `track` adds a CPU sample to that node's history and returns it. */
export async function proxmoxServers(track: (id: string, cpu?: number) => number[], weather?: Weather): Promise<Server[]> {
  const p = config.proxmox;
  const base = { location: p.location, kind: "proxmox" as const, platform: "Proxmox VE", tz: p.tz, weather, web_url: p.url, minecraft: null };
  let nodes: Node[];
  try {
    nodes = await pve<Node[]>("/nodes");
  } catch (e) {
    return [{ ...base, id: "proxmox", name: "Proxmox", reachable: false, error: `can't reach Proxmox: ${(e as Error).message}`, stats: {}, cpu_history: track("proxmox") }];
  }
  return Promise.all(
    nodes
      .sort((a, b) => a.node.localeCompare(b.node))
      .map(async (n): Promise<Server> => {
        const id = `pve-${slug(n.node)}`;
        if (n.status !== "online") return { ...base, id, name: n.node, reachable: false, error: `node is ${n.status ?? "offline"}`, stats: {}, cpu_history: track(id) };
        const enc = encodeURIComponent(n.node);
        const [st, vms, cts, storage] = await Promise.all([
          pve<NodeStatus>(`/nodes/${enc}/status`).catch(() => null),
          pve<Guest[]>(`/nodes/${enc}/qemu`).catch(() => null),
          pve<Guest[]>(`/nodes/${enc}/lxc`).catch(() => null),
          pve<Storage[]>(`/nodes/${enc}/storage`).catch(() => null),
        ]);
        const cpu = n.cpu != null ? Math.round(n.cpu * 1000) / 10 : undefined;
        const pve_ = st?.pveversion?.match(/pve-manager\/(\d+\.\d+)/)?.[1];
        const pools: Pool[] = (storage ?? [])
          .filter((s) => s.active && s.enabled !== 0 && s.total)
          .map((s) => ({ name: s.storage, size: s.total, allocated: s.used, healthy: true, status: "ONLINE" }));
        const apps = [...guests(vms, "VM"), ...guests(cts, "CT")].sort((a, b) => a.name.localeCompare(b.name));
        return {
          ...base,
          id,
          name: n.node,
          platform: pve_ ? `Proxmox VE ${pve_}` : "Proxmox VE",
          reachable: true,
          stats: {
            cores: n.maxcpu, cpu_percent: cpu, mem_total: n.maxmem, mem_used: n.mem, uptime_seconds: n.uptime,
            load: st?.loadavg?.map(Number), disk_total: st?.rootfs?.total, disk_used: st?.rootfs?.used,
          },
          cpu_history: track(id, cpu),
          storage: pools.length ? pools : undefined,
          apps: apps.length ? apps : undefined,
          appsLabel: "VMs & containers",
          specs: st ? proxmoxSpecs(st) : undefined,
        };
      }),
  );
}
