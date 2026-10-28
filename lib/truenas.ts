import WebSocket from "ws";
import { config } from "./config";
import type { Drive, NasHardware, TrueNASInfo } from "./types";

// TrueNAS 25.04+: JSON-RPC over WebSocket.
// TrueNAS revokes an API key sent over plain HTTP, so this always uses wss://.

type RpcMsg = { id?: number; result?: unknown; error?: { message?: string; data?: { reason?: string } } };

// Hardware barely changes, so it's looked up once an hour rather than every refresh.
const HARDWARE_TTL = 60 * 60 * 1000;
let hardwareCache: { at: number; hw: NasHardware } | null = null;

type Call = <T>(method: string, params?: unknown[]) => Promise<T>;
type Vdev = { type?: string; disk?: string; children?: Vdev[] };

async function hardware(call: Call, info: Record<string, unknown>, pools: Record<string, unknown>[]): Promise<NasHardware> {
  const [gpus, disks, boot] = await Promise.all([
    call<{ description?: string }[]>("device.get_info", [{ type: "GPU" }]).catch(() => []),
    call<Record<string, unknown>[]>("disk.query").catch(() => []),
    call<string[]>("boot.get_disks").catch(() => []),
  ]);
  const roles = new Map<string, { role: string; layout?: string }>();
  for (const p of pools) {
    const vdevs = ((p.topology as { data?: Vdev[] } | undefined)?.data ?? []);
    for (const v of vdevs)
      for (const d of v.children?.length ? v.children : [v]) if (d.disk) roles.set(d.disk, { role: p.name as string, layout: v.type });
  }
  for (const b of boot ?? []) roles.set(b, { role: "boot" });
  const drives: Drive[] = (disks ?? []).map((d) => {
    const r = roles.get(d.name as string);
    return { name: d.name as string, model: d.model as string, size: d.size as number, type: d.type as string, role: r?.role, pool_layout: r?.layout };
  });
  return {
    cpu: info.model as string,
    cores: info.cores as number,
    physical_cores: info.physical_cores as number,
    physmem: info.physmem as number,
    ecc: info.ecc_memory as boolean,
    gpus: (gpus ?? []).map((g) => g.description).filter((d): d is string => !!d),
    drives: drives.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function truenasStats(): Promise<TrueNASInfo> {
  const { host, apiKey, verifySsl } = config.truenas;
  if (!apiKey) return { error: "TRUENAS_API_KEY not set" };

  let ws: WebSocket;
  try {
    ws = await new Promise<WebSocket>((resolve, reject) => {
      const s = new WebSocket(`wss://${host}/api/current`, { rejectUnauthorized: verifySsl, handshakeTimeout: 8000 });
      s.once("open", () => resolve(s));
      s.once("error", reject);
    });
  } catch (e) {
    return { error: `can't reach TrueNAS API: ${(e as Error).message}` };
  }

  let seq = 0;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  ws.on("message", (raw) => {
    let msg: RpcMsg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const p = msg.id != null ? pending.get(msg.id) : undefined;
    if (!p) return;
    pending.delete(msg.id!);
    if (msg.error) p.reject(new Error(msg.error.data?.reason || msg.error.message || JSON.stringify(msg.error)));
    else p.resolve(msg.result);
  });
  ws.on("close", () => pending.forEach((p) => p.reject(new Error("connection closed"))));

  const call = <T>(method: string, params: unknown[] = []) =>
    new Promise<T>((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, 8000);
      pending.set(id, {
        resolve: (v) => (clearTimeout(timer), resolve(v as T)),
        reject: (e) => (clearTimeout(timer), reject(e)),
      });
      ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });

  const out: TrueNASInfo = {};
  try {
    if (!(await call<boolean>("auth.login_with_api_key", [apiKey]))) return { error: "TrueNAS rejected the API key" };
    const info = (await call<Record<string, unknown>>("system.info")) ?? {};
    out.version = info.version as string;
    out.hostname = info.hostname as string;
    const pools = (await call<Record<string, unknown>[]>("pool.query")) ?? [];
    out.pools = pools.map((p) => ({
      name: p.name as string,
      status: p.status as string,
      healthy: p.healthy as boolean,
      size: p.size as number,
      allocated: p.allocated as number,
    }));
    if (!hardwareCache || Date.now() - hardwareCache.at > HARDWARE_TTL) {
      try {
        hardwareCache = { at: Date.now(), hw: await hardware(call, info, pools) };
      } catch {}
    }
    out.hardware = hardwareCache?.hw;
    try {
      const apps = (await call<Record<string, string>[]>("app.query")) ?? [];
      out.apps = apps
        .map((a) => ({ name: a.name, state: a.state }))
        .sort((a, b) => (a.name ?? "").toLowerCase().localeCompare((b.name ?? "").toLowerCase()));
    } catch (e) {
      out.apps_error = (e as Error).message;
    }
    try {
      const alerts = (await call<Record<string, unknown>[]>("alert.list")) ?? [];
      out.alerts = alerts
        .filter((a) => !a.dismissed)
        .map((a) => ({ level: a.level as string, text: (a.formatted || a.klass) as string }))
        .slice(0, 6);
    } catch {}
  } catch (e) {
    out.error = (e as Error).message;
  } finally {
    ws.close();
  }
  return out;
}
