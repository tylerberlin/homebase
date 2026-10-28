export type Level = "" | "warn" | "bad";

export function bytes(n?: number | null) {
  if (n == null) return "–";
  const u = ["B", "KB", "MB", "GB", "TB", "PB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n >= 100 ? n.toFixed(0) : n.toFixed(1)} ${u[i]}`;
}

export function dur(s?: number | null) {
  if (s == null) return "–";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

export const pct = (a?: number | null, b?: number | null) => (a != null && b ? Math.round((a / b) * 100) : null);

export const level = (p: number | null | undefined, warn = 75, bad = 90): Level =>
  p == null ? "" : p >= bad ? "bad" : p >= warn ? "warn" : "";

export const tempLevel = (t: number | undefined, kind: "pi" | "truenas"): Level =>
  kind === "pi" ? level(t, 70, 80) : level(t, 75, 85);
