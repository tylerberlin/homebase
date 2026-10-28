import { config } from "./config";
import type { HostStats, MinecraftStatus, PiHardware } from "./types";

export type PiResult = ({ reachable: true; minecraft?: MinecraftStatus; hardware?: PiHardware } & HostStats) | { reachable: false; error: string };

const errMsg = (e: unknown) => {
  const err = e as Error & { cause?: Error };
  return err.cause?.message || err.message;
};

/** Stats from pi_agent.py over Tailscale. */
export async function piStats(): Promise<PiResult> {
  const { agentUrl, agentToken } = config.pi;
  if (!agentUrl) return { reachable: false, error: "PI_AGENT_URL not set" };
  try {
    const r = await fetch(agentUrl, { headers: { "X-Token": agentToken }, signal: AbortSignal.timeout(6000), cache: "no-store" });
    if (!r.ok) return { reachable: false, error: `Pi agent returned ${r.status}` };
    return { reachable: true, ...(await r.json()) };
  } catch (e) {
    return { reachable: false, error: `can't reach Pi: ${errMsg(e)}` };
  }
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
