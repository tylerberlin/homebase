import { readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import type { HostHardware, HostStats } from "./types";

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
