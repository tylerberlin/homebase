import { config } from "./config";
import { dockerAction } from "./host";
import { nodeOf, proxmoxAction } from "./proxmox";
import { truenasCall } from "./truenas";
import type { App } from "./types";

// Start, stop and restart from an app's details on its server card. Which backend depends on the
// server: TrueNAS apps over its API, Docker containers over the socket (here, or on the machine
// running the agent), VMs and containers over the Proxmox API. APP_CONTROLS=off hides it all.

export type ControlAction = "start" | "stop" | "restart";
export const controlsOn = () => !/^(0|off|false|no)$/i.test(process.env.APP_CONTROLS ?? "") && !config.backup.mode;

async function viaAgent(base: string, token: string, app: App, action: ControlAction) {
  const r = await fetch(`${base.replace(/\/stats$/, "")}/control`, {
    method: "POST",
    headers: { "X-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify(app.kind === "Service" ? { action: "service", op: action } : { action: "container", op: action, id: app.id }),
    cache: "no-store",
    signal: AbortSignal.timeout(35_000),
  });
  if (r.status === 409) throw new Error(app.kind === "Service" ? "that machine couldn't restart the service (check MC_SERVICE and sudo on the agent)" : "that machine couldn't do it (is its Docker socket writable?)");
  if (!r.ok) throw new Error(`the agent said ${r.status}`);
}

export async function controlApp(serverId: string, app: App, action: ControlAction): Promise<void> {
  if (!controlsOn()) throw new Error("controls are off");
  if (serverId === config.nas.id) {
    if (config.truenas.apiKey && app.kind === "App") {
      const method = { start: "app.start", stop: "app.stop", restart: "app.redeploy" }[action];
      await truenasCall(method, [app.name]);
      return;
    }
    if (app.kind === "Docker" && app.id) return dockerAction(String(app.id), action);
    throw new Error("this app can't be controlled from here");
  }
  if (serverId === config.pi.id && config.pi.agentUrl) {
    if (!app.id) throw new Error("this app can't be controlled from here");
    return viaAgent(config.pi.agentUrl, config.pi.agentToken, app, action);
  }
  const agent = config.agents.find((a) => a.id === serverId);
  if (agent) {
    if (!app.id) throw new Error("this app can't be controlled from here");
    return viaAgent(agent.url, agent.token, app, action);
  }
  const node = nodeOf.get(serverId);
  if (node && app.id != null && (app.kind === "VM" || app.kind === "CT")) {
    await proxmoxAction(node, app.kind, app.id, action);
    return;
  }
  throw new Error("unknown server");
}
