import { config } from "./config";
import type { AgentPlatform, App, HostStats, MinecraftStatus, PiHardware } from "./types";

/** A report from agent/homebase_agent.py (older Pi agents send the same minus platform and containers). */
export type AgentResult =
  | ({ reachable: true; minecraft?: MinecraftStatus; hardware?: PiHardware; platform?: AgentPlatform; containers?: App[]; tz?: string } & HostStats)
  | { reachable: false; error: string };
export type PiResult = AgentResult;

const errMsg = (e: unknown) => {
  const err = e as Error & { cause?: Error };
  return err.cause?.message || err.message;
};

/** Stats from a machine running the agent. */
export async function agentStats(url: string, token: string, name: string): Promise<AgentResult> {
  try {
    const r = await fetch(url, { headers: { "X-Token": token }, signal: AbortSignal.timeout(6000), cache: "no-store" });
    if (!r.ok) return { reachable: false, error: `${name}'s agent returned ${r.status}` };
    return { reachable: true, ...(await r.json()) };
  } catch (e) {
    return { reachable: false, error: `can't reach ${name}: ${errMsg(e)}` };
  }
}

/** The Pi set up with PI_AGENT_URL. */
export async function piStats(): Promise<AgentResult> {
  const { agentUrl, agentToken } = config.pi;
  if (!agentUrl) return { reachable: false, error: "PI_AGENT_URL not set" };
  return agentStats(agentUrl, agentToken, "Pi");
}

export async function checkUrl(url: string) {
  const start = Date.now();
  try {
    const r = await fetch(url, { headers: { "User-Agent": "homebase" }, signal: AbortSignal.timeout(6000), cache: "no-store" });
    await r.body?.cancel();
    return { up: r.status < 500, code: r.status, ms: Date.now() - start };
  } catch (e) {
    return { up: false, error: errMsg(e) };
  }
}
