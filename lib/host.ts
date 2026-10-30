import { existsSync, readFileSync, readdirSync, statfsSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import type { App, HostHardware, HostStats } from "./types";

// NAS's own stats, read from the host's /proc and /sys (container uses host networking).

let lastCpu: [idle: number, total: number] | null = null;

function cpuTimes(): [number, number] {
  const parts = readFileSync("/proc/stat", "utf8").split("\n")[0].trim().split(/\s+/).slice(1).map(Number);
  const idle = parts[3] + (parts[4] ?? 0);
  return [idle, parts.reduce((a, b) => a + b, 0)];
}

const readNum = (p: string) => Number(readFileSync(p, "utf8").trim());

/** Best-effort CPU temperature from hwmon (coretemp / k10temp / zenpower) or thermal zones. */
function cpuTemp(): number | undefined {
  const base = "/sys/class/hwmon";
  try {
    for (const d of readdirSync(base).sort()) {
      let name: string;
      try {
        name = readFileSync(`${base}/${d}/name`, "utf8").trim();
      } catch {
        continue;
      }
      if (!["coretemp", "k10temp", "zenpower", "cpu_thermal"].includes(name)) continue;
      const temps: number[] = [];
      for (const fn of readdirSync(`${base}/${d}`)) {
        if (!fn.startsWith("temp") || !fn.endsWith("_input")) continue;
        try {
          const v = readNum(`${base}/${d}/${fn}`);
          if (Number.isFinite(v)) temps.push(v / 1000);
        } catch {}
      }
      if (temps.length) return Math.round(Math.max(...temps) * 10) / 10;
    }
  } catch {}
  try {
    return Math.round(readNum("/sys/class/thermal/thermal_zone0/temp") / 100) / 10;
  } catch {
    return undefined;
  }
}

export function hostStats(): HostStats {
  const out: HostStats = { cores: os.cpus().length };
  try {
    const now = cpuTimes();
    if (lastCpu) {
      const dIdle = now[0] - lastCpu[0];
      const dTotal = now[1] - lastCpu[1];
      out.cpu_percent = dTotal ? Math.round(1000 * (1 - dIdle / dTotal)) / 10 : 0;
    }
    lastCpu = now;
  } catch {}
  const t = cpuTemp();
  if (t != null) out.temp_c = t;
  try {
    const mem: Record<string, number> = {};
    for (const line of readFileSync("/proc/meminfo", "utf8").split("\n")) {
      const [k, v] = line.split(":");
      if (v) mem[k] = parseInt(v, 10) * 1024;
    }
    if (mem.MemTotal) {
      out.mem_total = mem.MemTotal;
      out.mem_used = mem.MemTotal - (mem.MemAvailable ?? mem.MemFree ?? 0);
    }
  } catch {}
  try {
    out.uptime_seconds = Math.floor(parseFloat(readFileSync("/proc/uptime", "utf8")));
    out.load = os.loadavg().map((x) => Math.round(x * 100) / 100);
  } catch {}
  return out;
}

const readText = (p: string) => {
  try {
    return readFileSync(p, "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
};

/** Motherboard (from DMI) and kernel; the container shares the host's kernel and /sys. */
export const hostHardware = (): HostHardware => ({
  board_vendor: readText("/sys/class/dmi/id/board_vendor"),
  board_name: readText("/sys/class/dmi/id/board_name"),
  kernel: os.release(),
});

/** The operating system, for a server card without TrueNAS. In a container, mount the host's
 *  /etc/os-release at /host/etc/os-release so it names the host's OS rather than the container's. */
export function hostOs(): string {
  for (const p of ["/host/etc/os-release", "/etc/os-release"]) {
    const name = readText(p)?.match(/^PRETTY_NAME="?([^"\n]+)"?/m)?.[1];
    if (name && !(p === "/etc/os-release" && /alpine/i.test(name) && existsSync("/.dockerenv"))) return name;
  }
  return os.type() === "Darwin" ? "macOS" : os.type();
}

/** Root disk usage (or DISK_PATH), for a server card without TrueNAS. */
export function hostDisk(): Pick<HostStats, "disk_total" | "disk_used"> {
  try {
    const s = statfsSync(process.env.DISK_PATH || "/");
    return { disk_total: s.blocks * s.bsize, disk_used: (s.blocks - s.bfree) * s.bsize };
  } catch {
    return {};
  }
}

const DOCKER_STATE: Record<string, string> = { running: "RUNNING", restarting: "DEPLOYING", dead: "CRASHED" };

// Docker's Status text, e.g. "Up 3 days (healthy)" or "Exited (1) 2 hours ago".
const UNIT: Record<string, number> = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000 };
export function dockerUptime(status?: string) {
  const m = status?.match(/^Up (?:About an? |Less than an? )?(\d+)?\s*(second|minute|hour|day|week|month|year)/);
  if (!m) return undefined;
  return (m[1] ? Number(m[1]) : 1) * UNIT[m[2]];
}
export function dockerNote(status?: string) {
  if (!status) return undefined;
  if (/\(unhealthy\)/.test(status)) return "unhealthy";
  if (/\(health: starting\)/.test(status)) return "starting";
  const exit = status.match(/^Exited \((\d+)\)/);
  if (exit && exit[1] !== "0") return `exited with code ${exit[1]}`;
  if (/^Restarting/.test(status)) return "restarting";
  return undefined;
}

/** Start, stop or restart a container over the Docker socket (needs the socket mounted read-write). */
export function dockerAction(id: string, action: "start" | "stop" | "restart"): Promise<void> {
  const socketPath = process.env.DOCKER_SOCKET || "/var/run/docker.sock";
  if (!/^[0-9a-f]{12,64}$/i.test(id)) return Promise.reject(new Error("bad container id"));
  return new Promise((resolve, reject) => {
    const req = http.request({ socketPath, method: "POST", path: `/containers/${id}/${action}${action === "stop" ? "?t=15" : ""}`, timeout: 30000 }, (res) => {
      res.resume();
      if (res.statusCode === 204 || res.statusCode === 304) resolve();
      else if (res.statusCode === 403) reject(new Error("the Docker socket is mounted read-only"));
      else reject(new Error(`Docker said ${res.statusCode}`));
    });
    req.on("timeout", () => req.destroy(new Error("Docker timed out")));
    req.on("error", (e) => reject(/EACCES|EPERM/.test(e.message) ? new Error("no permission on the Docker socket") : e));
    req.end();
  });
}

/** Docker containers on this machine, when /var/run/docker.sock is mounted (read-only is enough). */
export function dockerContainers(): Promise<App[] | undefined> {
  const socketPath = process.env.DOCKER_SOCKET || "/var/run/docker.sock";
  if (!existsSync(/*turbopackIgnore: true*/ socketPath)) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const req = http.get({ socketPath, path: "/containers/json?all=1", timeout: 4000 }, (res) => {
      let body = "";
      res.on("data", (d) => (body += d));
      res.on("end", () => {
        try {
          const list = JSON.parse(body) as { Id?: string; Names?: string[]; State?: string; Status?: string; Image?: string }[];
          resolve(
            list
              .map((c) => ({
                name: (c.Names?.[0] ?? "?").replace(/^\//, ""),
                state: DOCKER_STATE[c.State ?? ""] ?? "STOPPED",
                kind: "Docker",
                id: c.Id?.slice(0, 12),
                image: c.Image,
                uptime_seconds: dockerUptime(c.Status),
                note: dockerNote(c.Status),
              }))
              .sort((a, b) => a.name.localeCompare(b.name)),
          );
        } catch {
          resolve(undefined);
        }
      });
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(undefined));
  });
}
