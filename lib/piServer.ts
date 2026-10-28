import { config } from "./config";
import type { PiResult } from "./remote";
import { piSpecs } from "./specs";
import type { Server, Weather } from "./types";

/**
 * The pi card from a pi_agent.py report. Shared by the collector on NAS and by the
 * backup site, which gets the same report pushed straight from the Pi.
 */
export function buildPiServer(
  pi: PiResult,
  opts: { history: number[]; weather?: Weather; iconUrl?: (favicon?: string | null) => string | undefined; specs?: Server["specs"] },
): Server {
  const piCfg = config.pi;
  const base = { id: "pi", name: piCfg.name, location: piCfg.location, kind: "pi" as const, tz: piCfg.tz, weather: opts.weather };
  const mcMeta = { label: piCfg.mcLabel, address: piCfg.mcAddress };
  if (!pi.reachable) {
    return {
      ...base,
      reachable: false,
      error: pi.error,
      stats: {},
      cpu_history: [...opts.history],
      specs: opts.specs,
      minecraft: { ...mcMeta, online: false, error: "Pi unreachable" },
    };
  }
  const { minecraft, hardware, reachable: _, ...stats } = pi;
  return {
    ...base,
    reachable: true,
    stats,
    cpu_history: [...opts.history],
    specs: hardware ? piSpecs(hardware) : opts.specs,
    minecraft: minecraft ? { ...mcMeta, ...minecraft, favicon: opts.iconUrl?.(minecraft.favicon) } : null,
  };
}
