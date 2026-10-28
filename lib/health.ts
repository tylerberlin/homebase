import { level, pct, tempLevel } from "./format";
import type { Link, Server } from "./types";

// One source of truth for "is anything wrong": the card dots, the header pill and the
// issue strip all read from here, so they can never disagree.

export type HealthLevel = "ok" | "warn" | "bad";
export type Issue = {
  level: "warn" | "bad";
  text: string;
  detail?: string;
  /** element id the issue strip links to */
  target?: string;
};

const BAD_ALERTS = new Set(["CRITICAL", "ERROR", "ALERT", "EMERGENCY"]);
export const isInfoAlert = (lvl?: string) => lvl === "INFO" || lvl === "NOTICE";

export const worst = (issues: Issue[]): HealthLevel =>
  issues.some((i) => i.level === "bad") ? "bad" : issues.length ? "warn" : "ok";

export const tempMax = (kind: Server["kind"]) => (kind === "pi" ? 90 : 100);

export function healthOf(s: Server): { level: HealthLevel; issues: Issue[] } {
  const issues: Issue[] = [];
  const add = (lvl: "" | "warn" | "bad", text: string, detail?: string) => {
    if (lvl) issues.push({ level: lvl, text, detail, target: s.id });
  };

  // An unreachable host explains everything else on it (including its Minecraft server).
  if (!s.reachable) {
    add("bad", `${s.name} is unreachable`, s.error);
    return { level: "bad", issues };
  }

  const st = s.stats ?? {};
  add(level(st.cpu_percent, 70, 90), `${s.name} CPU at ${Math.round(st.cpu_percent ?? 0)}%`);
  const memP = pct(st.mem_used, st.mem_total);
  add(level(memP, 85, 95), `${s.name} memory ${memP}% used`);
  add(tempLevel(st.temp_c, s.kind), `${s.name} running hot at ${st.temp_c}°C`);
  const diskP = pct(st.disk_used, st.disk_total);
  add(level(diskP, 80, 92), `${s.name} disk ${diskP}% full`);

  const tn = s.truenas;
  if (tn) {
    if (tn.error) add("warn", "TrueNAS API unavailable, so storage and apps aren't being checked", tn.error);
    for (const p of tn.pools ?? []) {
      if (p.healthy === false || (p.status && p.status !== "ONLINE")) add("bad", `Pool ${p.name} is ${p.status ?? "unhealthy"}`);
    }
    for (const a of tn.apps ?? []) if (a.state === "CRASHED") add("bad", `App ${a.name} crashed`);
    for (const a of tn.alerts ?? []) {
      if (BAD_ALERTS.has(a.level ?? "")) add("bad", `TrueNAS: ${a.text}`);
      else if (a.level === "WARNING") add("warn", `TrueNAS: ${a.text}`);
    }
  }

  const mc = s.minecraft;
  if (mc && !mc.online) add("bad", `${mc.label} is offline`, mc.error);

  return { level: worst(issues), issues };
}

export const linkIssues = (links: Link[]): Issue[] =>
  links.filter((l) => !l.up).map((l) => ({ level: "bad", text: `${l.name} is down`, detail: l.error ?? (l.code ? `HTTP ${l.code}` : undefined), target: "links" }));
