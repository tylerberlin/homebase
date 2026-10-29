import { config } from "./config";
import type { AgentResult } from "./remote";
import { piSpecs } from "./specs";
import type { Server, Weather } from "./types";

export type AgentCard = { id: string; name: string; location: string; tz?: string; mcLabel?: string; mcAddress?: string; mcPort?: number };
type Opts = { history: number[]; weather?: Weather; iconUrl?: (favicon?: string | null) => string | undefined; specs?: Server["specs"]; platform?: string };

/** The card's tag: "Raspberry Pi 5", "Ubuntu 24.04", "macOS 15.1", "Windows 11"... */
function platformOf(r: Extract<AgentResult, { reachable: true }>): string {
  const pi = r.hardware?.model?.match(/Raspberry Pi( \d+| Zero( 2)?)?/)?.[0];
  if (r.platform?.is_pi || (!r.platform && pi)) return pi ?? "Raspberry Pi";
  return r.platform?.os?.replace(/ GNU\/Linux| LTS|\s*\(.*\)/g, "").trim() || "Server";
}

/**
 * The card for a machine running the stats agent. Shared by the collector and by the backup
 * site, which gets the Pi's report pushed straight from the Pi.
 */
export function buildAgentServer(card: AgentCard, r: AgentResult, opts: Opts): Server {
  const mcMeta = { label: card.mcLabel || `${card.name} Minecraft`, address: card.mcAddress ?? "" };
  if (!r.reachable) {
    return {
      id: card.id, name: card.name, location: card.location, kind: opts.platform?.startsWith("Raspberry") ? "pi" : "agent", platform: opts.platform, tz: card.tz, weather: opts.weather,
      reachable: false,
      error: r.error,
      stats: {},
      cpu_history: [...opts.history],
      specs: opts.specs,
      minecraft: card.mcPort ? { ...mcMeta, online: false, error: `${card.name} unreachable` } : null,
    };
  }
  const { minecraft, hardware, platform: _p, containers, tz, reachable: _, ...stats } = r;
  const platform = platformOf(r);
  return {
    id: card.id, name: card.name, location: card.location,
    kind: r.platform?.is_pi || (!r.platform && platform.startsWith("Raspberry")) ? "pi" : "agent",
    platform,
    tz: card.tz || tz,
    weather: opts.weather,
    reachable: true,
    stats,
    cpu_history: [...opts.history],
    specs: hardware ? piSpecs(hardware) : opts.specs,
    apps: containers?.length ? containers : undefined,
    appsLabel: containers?.length ? "Containers" : undefined,
    minecraft: minecraft ? { ...mcMeta, ...minecraft, favicon: opts.iconUrl?.(minecraft.favicon) } : null,
  };
}

/** The Pi set up with the PI_* settings. */
export function buildPiServer(pi: AgentResult, opts: Opts): Server {
  const p = config.pi;
  return buildAgentServer({ id: p.id, name: p.name, location: p.location, tz: p.tz, mcLabel: p.mcLabel, mcAddress: p.mcAddress, mcPort: p.mcPort }, pi, opts);
}
