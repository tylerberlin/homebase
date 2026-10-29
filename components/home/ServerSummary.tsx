import { healthOf } from "@/lib/health";
import type { Status } from "@/lib/types";
import { ChevronIcon } from "../icons";

// One glass strip on Home: each server at a glance, and who's on Minecraft (if a server has it). Opens the Servers tab.

export default function ServerSummary({ data }: { data: Status | null }) {
  if (!data?.updated || !data.servers.length) return null;
  const mc = data.servers.some((s) => s.minecraft);
  const players = data.servers.reduce((n, s) => n + (s.minecraft?.online ? (s.minecraft.players_online ?? 0) : 0), 0);
  return (
    <a className="srv-summary" href="#servers" aria-label="Servers: open the Servers tab">
      {data.servers.map((s) => {
        const h = healthOf(s).level;
        return (
          <span key={s.id} className="srv-item">
            <span className={`dot live ${h}`} />
            <strong>{s.name}</strong>
            <span className="srv-stats mono">
              {s.reachable ? `CPU ${Math.round(s.stats.cpu_percent ?? 0)}%${s.stats.temp_c != null ? ` · ${Math.round(s.stats.temp_c)}°C` : ""}` : "offline"}
            </span>
          </span>
        );
      })}
      {mc && (
        <span className="srv-item">
          <span className={`dot ${players ? "ok" : ""}`} />
          <strong>Minecraft</strong>
          <span className="srv-stats">{players === 1 ? "1 player online" : `${players} players online`}</span>
        </span>
      )}
      <span className="srv-open" aria-hidden="true">
        Servers <ChevronIcon />
      </span>
    </a>
  );
}
